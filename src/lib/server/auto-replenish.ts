import "server-only";

import type {
  AccountRecord,
  AutoReplenishCredentialFilter,
  AutoReplenishPlanFilter,
  AutoReplenishRuleInput,
  AutoReplenishRuleRecord,
  AutoReplenishRunStatus,
} from "@/lib/types";
import {
  addActivityLog,
  addAutoReplenishRun,
  getAutoReplenishRuleByIntegrationId,
  getIntegrationById,
  listAccounts,
  listAutoReplenishRules,
  listAutoReplenishRuns,
  listPushedAccountStatesByIntegration,
  markAccountsPushed,
  recordAccountsPushedToIntegration,
  upsertAutoReplenishRule,
  updateAutoReplenishRuleExecution,
  updateIntegrationHealth,
  updateIntegrationRemoteStatusSummary,
} from "@/lib/server/db";
import { pushAccountsToIntegration, readIntegrationRemoteStatus } from "@/lib/server/connectors";
import type { RemoteStatusSummary } from "@/lib/server/connectors/status";

type RunOptions = {
  force?: boolean;
  triggerSource?: "manual" | "scheduled";
};

type AutoReplenishRunResult = {
  integrationId: string;
  status: AutoReplenishRunStatus;
  message: string;
  pushed: number;
  summary: RemoteStatusSummary | null;
  selectedAccountIds: string[];
};

type GlobalState = typeof globalThis & {
  __accountPoolAutoReplenishTimer?: ReturnType<typeof setInterval>;
  __accountPoolAutoReplenishSweep?: Promise<void> | null;
};

const schedulerState = globalThis as GlobalState;
const AUTO_SWEEP_INTERVAL_MS = 60_000;
const QUOTA_CRITICAL_REMAINING_PERCENT = 5;

function toRuleInput(rule: AutoReplenishRuleRecord): AutoReplenishRuleInput {
  return {
    enabled: rule.enabled,
    triggerMode: rule.triggerMode,
    minUsableAccounts: rule.minUsableAccounts,
    min5hRemainingPercent: rule.min5hRemainingPercent,
    targetUsableAccounts: rule.targetUsableAccounts,
    quotaLowPurchaseCount: rule.quotaLowPurchaseCount,
    maxAccountsPerRun: rule.maxAccountsPerRun,
    intervalMinutes: rule.intervalMinutes,
    credentialFilter: rule.credentialFilter,
    planFilters: rule.planFilters,
    targetGroups: rule.targetGroups,
    planGroupMap: rule.planGroupMap,
    cloneAccountId: rule.cloneAccountId ?? "",
    pushNotes: rule.pushNotes ?? "",
    respectRateLimitRecovery: rule.respectRateLimitRecovery,
    rateLimitRecoveryGraceMinutes: rule.rateLimitRecoveryGraceMinutes,
  };
}

function nextRunAt(rule: AutoReplenishRuleRecord, startedAt: string) {
  if (!rule.enabled) return null;
  return new Date(
    new Date(startedAt).getTime() + rule.intervalMinutes * 60_000,
  ).toISOString();
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "未返回";
  return `${Math.round(value * 10) / 10}%`;
}

function read5hRemainingPercent(summary: RemoteStatusSummary) {
  return (
    summary.quotaWindows.find((item) => item.label.toLowerCase() === "5h")
      ?.remainingPercent ?? null
  );
}

function isQuotaCritical(quotaRemaining: number | null) {
  return (
    typeof quotaRemaining === "number" &&
    quotaRemaining <= QUOTA_CRITICAL_REMAINING_PERCENT
  );
}

function passesCredentialFilter(
  account: AccountRecord,
  credentialFilter: AutoReplenishCredentialFilter,
) {
  const hasRefreshToken =
    Boolean(account.refreshToken?.trim()) ||
    account.accessToken.trim().toLowerCase().startsWith("refresh:");

  if (credentialFilter === "has_refresh_token") return hasRefreshToken;
  if (credentialFilter === "access_only") return !hasRefreshToken;
  return true;
}

function normalizePlanFilter(value?: string | null): Exclude<AutoReplenishPlanFilter, "all"> | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("plus")) return "plus";
  if (normalized.includes("pro")) return "pro";
  if (normalized.includes("free")) return "free";
  return null;
}

function passesPlanFilter(account: AccountRecord, planFilters: AutoReplenishPlanFilter[]) {
  if (planFilters.length === 0) return true;
  const normalizedPlan = normalizePlanFilter(account.planType);
  return normalizedPlan ? planFilters.includes(normalizedPlan) : false;
}

function buildCandidateFilterText(
  credentialFilter: AutoReplenishCredentialFilter,
  planFilters: AutoReplenishPlanFilter[],
) {
  const chunks: string[] = [];
  if (credentialFilter === "has_refresh_token") chunks.push("仅 Refresh Token");
  if (credentialFilter === "access_only") chunks.push("仅 Access Token");
  if (planFilters.length > 0) chunks.push(`套餐 ${planFilters.map((item) => item.toUpperCase()).join("/")}`);
  return chunks.length ? `（筛选：${chunks.join("，")}）` : "";
}

function sortByIsoAsc(a: string | null, b: string | null) {
  const left = a ? Date.parse(a) : 0;
  const right = b ? Date.parse(b) : 0;
  return left - right;
}

function pickCandidateAccounts(
  integrationId: string,
  credentialFilter: AutoReplenishCredentialFilter,
  planFilters: AutoReplenishPlanFilter[],
  count: number,
) {
  const pushStates = new Map(
    listPushedAccountStatesByIntegration(integrationId).map((item) => [
      String(item.account_id),
      {
        lastPushedAt:
          typeof item.last_pushed_at === "string" ? item.last_pushed_at : null,
      },
    ]),
  );
  const eligible = listAccounts()
    .filter((account) => account.sourceType === "manual")
    .filter((account) => account.status === "active")
    .filter((account) => account.accessToken.trim())
    .filter((account) => passesCredentialFilter(account, credentialFilter))
    .filter((account) => passesPlanFilter(account, planFilters));

  const untouched = eligible
    .filter((account) => !pushStates.has(account.id))
    .sort((a, b) => sortByIsoAsc(a.createdAt, b.createdAt));
  const touched = eligible
    .filter((account) => pushStates.has(account.id))
    .sort((a, b) =>
      sortByIsoAsc(
        pushStates.get(a.id)?.lastPushedAt ?? a.lastPushedAt,
        pushStates.get(b.id)?.lastPushedAt ?? b.lastPushedAt,
      ),
    );
  const ordered = [...untouched, ...touched];

  return {
    selected: ordered.slice(0, count),
    totalEligible: ordered.length,
  };
}

function buildThresholdMessage(
  rule: AutoReplenishRuleRecord,
  summary: RemoteStatusSummary,
) {
  return `已刷新 ${summary.platform} 状态 ${summary.updatedAt}，未达到补号阈值：正常账号 ${summary.normalAccounts}，5h 剩余 ${formatPercent(read5hRemainingPercent(summary))}`;
}

function buildTriggerText(
  rule: AutoReplenishRuleRecord,
  summary: RemoteStatusSummary,
  quotaRemaining: number | null,
) {
  const chunks: string[] = [];
  if (summary.normalAccounts < rule.minUsableAccounts) {
    chunks.push(`正常账号 ${summary.normalAccounts} < ${rule.minUsableAccounts}`);
  }
  if (
    typeof quotaRemaining === "number" &&
    quotaRemaining < rule.min5hRemainingPercent
  ) {
    chunks.push(
      `5h 剩余 ${formatPercent(quotaRemaining)} < ${formatPercent(
        rule.min5hRemainingPercent,
      )}`,
    );
  }
  if (isQuotaCritical(quotaRemaining)) {
    chunks.push(`5h 剩余已接近耗尽（≤${QUOTA_CRITICAL_REMAINING_PERCENT}%）`);
  }
  return chunks.join("，");
}

function buildRecoverySkipMessage(
  rule: AutoReplenishRuleRecord,
  summary: RemoteStatusSummary,
  quotaRemaining: number | null,
) {
  return `已刷新 ${summary.platform} 状态 ${summary.updatedAt}，5h 剩余 ${formatPercent(quotaRemaining)} 低于阈值，但正常账号 ${summary.normalAccounts} 个仍满足最低 ${rule.minUsableAccounts} 个；判断其它账号足够撑到额度恢复，本次不补号`;
}

async function persistRunOutcome(
  rule: AutoReplenishRuleRecord,
  startedAt: string,
  triggerSource: "manual" | "scheduled",
  result: AutoReplenishRunResult,
) {
  updateAutoReplenishRuleExecution(rule.integrationId, {
    lastRunAt: startedAt,
    nextRunAt: nextRunAt(rule, startedAt),
    lastStatus: result.status,
    lastMessage: result.message,
  });
  addAutoReplenishRun(
    rule.integrationId,
    triggerSource,
    result.status,
    result.message,
    {
      integrationId: rule.integrationId,
      pushed: result.pushed,
      summary: result.summary,
      selectedAccountIds: result.selectedAccountIds,
    },
  );
}

export function getAutoReplenishSnapshot() {
  return {
    rules: listAutoReplenishRules(),
    runs: listAutoReplenishRuns(),
  };
}

export function saveAutoReplenishRule(
  integrationId: string,
  input: AutoReplenishRuleInput,
) {
  return upsertAutoReplenishRule(integrationId, input);
}

export async function runAutoReplenishForIntegration(
  integrationId: string,
  options: RunOptions = {},
) {
  const integration = getIntegrationById(integrationId);
  if (!integration) {
    throw new Error("连接不存在");
  }

  let rule = getAutoReplenishRuleByIntegrationId(integrationId);
  if (!rule.id) {
    rule = upsertAutoReplenishRule(integrationId, toRuleInput(rule));
  }

  const startedAt = new Date().toISOString();
  const triggerSource = options.triggerSource ?? "manual";

  try {
    const summary = await readIntegrationRemoteStatus(integration);
    updateIntegrationRemoteStatusSummary(integrationId, summary);
    const quotaRemaining = read5hRemainingPercent(summary);
    const normalLow = summary.normalAccounts < rule.minUsableAccounts;
    const quotaLow =
      typeof quotaRemaining === "number" &&
      quotaRemaining < rule.min5hRemainingPercent;
    const quotaCritical = isQuotaCritical(quotaRemaining);
    const quotaLowTriggers = rule.triggerMode === "any" && quotaLow;
    const shouldTrigger = normalLow || quotaCritical || quotaLowTriggers;

    if (!shouldTrigger) {
      const result: AutoReplenishRunResult = {
        integrationId,
        status: "skipped",
        message: buildThresholdMessage(rule, summary),
        pushed: 0,
        summary,
        selectedAccountIds: [],
      };
      await persistRunOutcome(rule, startedAt, triggerSource, result);
      if (triggerSource === "manual") {
        addActivityLog("auto_replenish_run", "info", "自动补号已检查", result.message, {
          integrationId,
          status: result.status,
        });
      }
      updateIntegrationHealth(
        integrationId,
        "success",
        `读取成功，远端账号 ${summary.totalAccounts} 个`,
      );
      return result;
    }

    if (!normalLow && quotaLow && !quotaCritical && rule.respectRateLimitRecovery) {
      const result: AutoReplenishRunResult = {
        integrationId,
        status: "skipped",
        message: buildRecoverySkipMessage(rule, summary, quotaRemaining),
        pushed: 0,
        summary,
        selectedAccountIds: [],
      };
      await persistRunOutcome(rule, startedAt, triggerSource, result);
      if (triggerSource === "manual") {
        addActivityLog(
          "auto_replenish_run",
          "info",
          "自动补号已跳过",
          result.message,
          { integrationId, status: result.status },
        );
      }
      updateIntegrationHealth(integrationId, "success", result.message);
      return result;
    }

    const desiredByNormal = normalLow
      ? Math.max(Math.max(rule.targetUsableAccounts, rule.minUsableAccounts) - summary.normalAccounts, 0)
      : 0;
    const desiredByQuota =
      quotaLow && (!rule.respectRateLimitRecovery || normalLow || quotaCritical)
        ? rule.quotaLowPurchaseCount
        : 0;
    const desiredCount = Math.min(
      Math.max(desiredByNormal, desiredByQuota, 0),
      rule.maxAccountsPerRun,
    );

    if (desiredCount <= 0) {
      const result: AutoReplenishRunResult = {
        integrationId,
        status: "skipped",
        message: buildThresholdMessage(rule, summary),
        pushed: 0,
        summary,
        selectedAccountIds: [],
      };
      await persistRunOutcome(rule, startedAt, triggerSource, result);
      return result;
    }

    const { selected, totalEligible } = pickCandidateAccounts(
      integrationId,
      rule.credentialFilter,
      rule.planFilters,
      desiredCount,
    );

    if (selected.length === 0) {
      const filterText = buildCandidateFilterText(rule.credentialFilter, rule.planFilters);
      const result: AutoReplenishRunResult = {
        integrationId,
        status: "error",
        message: `已触发自动补号，但本地号池没有可推送账号${filterText}`,
        pushed: 0,
        summary,
        selectedAccountIds: [],
      };
      await persistRunOutcome(rule, startedAt, triggerSource, result);
      if (triggerSource === "manual") {
        addActivityLog("auto_replenish_run", "error", "自动补号失败", result.message, {
          integrationId,
          status: result.status,
        });
      }
      updateIntegrationHealth(integrationId, "error", result.message);
      throw new Error(result.message);
    }

    const pushOptions = {
      targetGroups: rule.targetGroups,
      planGroupMap: rule.planGroupMap,
      pushNotes: rule.pushNotes,
    };
    const pushResult = await pushAccountsToIntegration(integration, selected, pushOptions);
    markAccountsPushed(selected.map((item) => item.id));
    recordAccountsPushedToIntegration(
      integrationId,
      selected.map((item) => item.id),
    );

    const partialNote =
      selected.length < desiredCount
        ? `，本地仅找到 ${selected.length} 个可推账号`
        : "";
    const result: AutoReplenishRunResult = {
      integrationId,
      status: "success",
      message: `已刷新 ${summary.platform} 状态 ${summary.updatedAt}，已自动补号 ${pushResult.pushed} 个${partialNote}，触发原因：${buildTriggerText(rule, summary, quotaRemaining)}，本地剩余可推 ${Math.max(totalEligible - selected.length, 0)} 个`,
      pushed: pushResult.pushed,
      summary,
      selectedAccountIds: selected.map((item) => item.id),
    };
    await persistRunOutcome(rule, startedAt, triggerSource, result);
    updateIntegrationHealth(integrationId, "success", result.message);

    if (triggerSource === "manual") {
      addActivityLog("auto_replenish_run", "success", "自动补号完成", result.message, {
        integrationId,
        pushed: pushResult.pushed,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("已触发自动补号，但本地号池没有可推送账号")) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "自动补号执行失败";
    const result: AutoReplenishRunResult = {
      integrationId,
      status: "error",
      message,
      pushed: 0,
      summary: null,
      selectedAccountIds: [],
    };
    await persistRunOutcome(rule, startedAt, triggerSource, result);
    updateIntegrationHealth(integrationId, "error", message);
    if (triggerSource === "manual") {
      addActivityLog("auto_replenish_run", "error", "自动补号失败", message, {
        integrationId,
      });
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function processDueAutoReplenishRules() {
  if (schedulerState.__accountPoolAutoReplenishSweep) {
    return schedulerState.__accountPoolAutoReplenishSweep;
  }

  schedulerState.__accountPoolAutoReplenishSweep = (async () => {
    const now = Date.now();
    const dueRules = listAutoReplenishRules().filter(
      (rule) =>
        rule.enabled &&
        rule.nextRunAt &&
        Number.isFinite(Date.parse(rule.nextRunAt)) &&
        Date.parse(rule.nextRunAt) <= now,
    );

    for (const rule of dueRules) {
      try {
        await runAutoReplenishForIntegration(rule.integrationId, {
          triggerSource: "scheduled",
        });
      } catch (error) {
        console.error(
          `[auto-replenish] ${rule.integrationId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  })().finally(() => {
    schedulerState.__accountPoolAutoReplenishSweep = null;
  });

  return schedulerState.__accountPoolAutoReplenishSweep;
}

export function ensureAutoReplenishScheduler() {
  if (schedulerState.__accountPoolAutoReplenishTimer) return;

  schedulerState.__accountPoolAutoReplenishTimer = setInterval(() => {
    void processDueAutoReplenishRules();
  }, AUTO_SWEEP_INTERVAL_MS);

  schedulerState.__accountPoolAutoReplenishTimer.unref?.();
  void processDueAutoReplenishRules();
}
