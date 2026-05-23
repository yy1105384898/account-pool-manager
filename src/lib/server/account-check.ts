import "server-only";

import type { AccountRecord, AccountStatus } from "@/lib/types";
import { addActivityLog, getAccountById, listAccounts, updateAccountTestResult } from "@/lib/server/db";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
};

type ProbeResult = {
  name: string;
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
};

type AccountSnapshot = {
  planType: string | null;
  subscriptionStatus: string | null;
  rawSources: string[];
};

type CheckOptions = {
  silent?: boolean;
};

type GlobalState = typeof globalThis & {
  __accountPoolAccountCheckTimer?: ReturnType<typeof setInterval>;
  __accountPoolAccountCheckSweep?: Promise<void> | null;
};

const schedulerState = globalThis as GlobalState;
const ACCOUNT_CHECK_SWEEP_INTERVAL_MS = 5 * 60_000;
const ACCOUNT_CHECK_STALE_MS = 30 * 60_000;
const ACCOUNT_CHECK_BATCH_SIZE = 3;

const tokenClients = [
  "app_EMoam8TOJkqQZrVYEdGNOde1",
  "TdJIcbe16WoTHtN95nyywh5E4yOo6ItG",
];

const accountInfoEndpoints = [
  { name: "account_check", url: "https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27" },
  { name: "subscriptions", url: "https://chatgpt.com/backend-api/subscriptions" },
  { name: "me", url: "https://chatgpt.com/backend-api/me" },
];

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanToken(value: string | null | undefined) {
  const token = value?.trim();
  if (!token) return null;
  return token.startsWith("refresh:") ? token.slice("refresh:".length).trim() : token;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkObjects(value: unknown, visit: (item: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit);
    return;
  }
  if (!isObject(value)) return;
  visit(value);
  for (const item of Object.values(value)) walkObjects(item, visit);
}

function firstStringByKeys(value: unknown, keys: string[]) {
  let matched: string | null = null;
  walkObjects(value, (item) => {
    if (matched) return;
    for (const key of keys) {
      const direct = readString(item[key]);
      if (direct) {
        matched = direct;
        return;
      }
      if (isObject(item[key])) {
        matched =
          readString(item[key].plan_type) ??
          readString(item[key].type) ??
          readString(item[key].name) ??
          readString(item[key].display_name);
        if (matched) return;
      }
    }
  });
  return matched;
}

function extractSnapshot(results: ProbeResult[]): AccountSnapshot {
  const payloads = results.filter((item) => item.ok).map((item) => item.data);
  const rawSources = results.filter((item) => item.ok).map((item) => item.name);
  const merged = payloads.length === 1 ? payloads[0] : payloads;

  return {
    planType: firstStringByKeys(merged, [
      "plan_type",
      "chatgpt_plan_type",
      "account_plan_type",
      "subscription_plan_type",
      "subscription_plan",
      "account_plan",
      "plan",
    ]),
    subscriptionStatus: firstStringByKeys(merged, [
      "subscription_status",
      "account_status",
      "billing_status",
      "status",
    ]),
    rawSources,
  };
}

function buildHeaders(accessToken: string, accountId: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "account-pool-manager/1.0",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;
  return headers;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  let lastError = "刷新 Access Token 失败";
  for (const clientId of tokenClients) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });
    const response = await fetchViaProxy("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as
      | {
          access_token?: string;
          refresh_token?: string;
          error?: string;
          error_description?: string;
        }
      | null;
    if (response.ok && data?.access_token) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
      };
    }
    lastError = data?.error_description ?? data?.error ?? `刷新 Access Token 失败：${response.status}`;
  }
  throw new Error(lastError);
}

async function probeAccountInfo(accessToken: string, accountId: string | null) {
  const headers = buildHeaders(accessToken, accountId);
  return Promise.all(
    accountInfoEndpoints.map(async (endpoint): Promise<ProbeResult> => {
      try {
        const response = await fetchViaProxy(endpoint.url, {
          headers,
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        return {
          name: endpoint.name,
          ok: response.ok,
          status: response.status,
          data,
          error: response.ok
            ? null
            : readString(isObject(data) ? data.error_description ?? data.error ?? data.message : null) ??
              `${endpoint.name} 返回 ${response.status}`,
        };
      } catch (error) {
        return {
          name: endpoint.name,
          ok: false,
          status: 0,
          data: null,
          error: error instanceof Error ? error.message : `${endpoint.name} 请求失败`,
        };
      }
    }),
  );
}

function normalizePlanType(value: string | null) {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (text.includes("plus")) return "Plus";
  if (text.includes("pro")) return "Pro";
  if (text.includes("team")) return "Team";
  if (text.includes("enterprise")) return "Enterprise";
  if (text.includes("free")) return "Free";
  return value?.trim() ?? null;
}

function buildMessage(snapshot: AccountSnapshot) {
  const plan = normalizePlanType(snapshot.planType) ?? "未返回";
  return `套餐 ${plan}`;
}

function buildUnavailableMessage(results: ProbeResult[]) {
  const firstError = results.find((item) => item.error)?.error ?? "未读取到套餐订阅信息";
  if (results.some((item) => item.status === 401 || item.status === 403)) {
    return `库存直检未授权（${firstError}），保留导入状态`;
  }
  return `库存直检未返回套餐，保留导入状态（${firstError}）`;
}

function buildSnapshotMetadata(snapshot: AccountSnapshot, message: string, latencyMs: number) {
  const metadata: Record<string, unknown> = {
    lastCheckMessage: message,
    lastCheckLatencyMs: latencyMs,
    accountPlanSource: snapshot.rawSources.join(","),
    subscriptionStatus: undefined,
    modelCount: undefined,
    quota5hUsedPercent: undefined,
    quota7dUsedPercent: undefined,
    requestCount7d: undefined,
    riskCount: undefined,
    cost5h: undefined,
    cost7d: undefined,
  };

  if (snapshot.subscriptionStatus) metadata.subscriptionStatus = snapshot.subscriptionStatus;

  return metadata;
}

function activeStatus(): AccountStatus {
  return "active";
}

function shouldCheckAccount(account: AccountRecord, now: number) {
  if (!account.accessToken.trim()) return false;
  if (account.status === "disabled" || account.status === "banned") return false;
  if (account.lastPushedAt) return false;
  if (!account.lastStatusCheckedAt) return true;
  const checkedAt = Date.parse(account.lastStatusCheckedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= ACCOUNT_CHECK_STALE_MS;
}

export async function checkAccountById(id: string, options: CheckOptions = {}) {
  const account = getAccountById(id);
  if (!account) throw new Error("账号不存在");

  const started = Date.now();
  const existingRefreshToken = cleanToken(account.refreshToken) ?? cleanToken(readMetadataString(account.metadata, "refreshToken"));
  const isRefreshOnly = account.accessToken.startsWith("refresh:");
  let tokens: TokenSet = {
    accessToken: isRefreshOnly ? "" : account.accessToken,
    refreshToken: existingRefreshToken ?? (isRefreshOnly ? cleanToken(account.accessToken) : null),
  };
  let persistedFailure = false;

  try {
    if (!tokens.accessToken) {
      if (!tokens.refreshToken) throw new Error("缺少 Access Token 或 Refresh Token");
      tokens = await refreshAccessToken(tokens.refreshToken);
    }

    let results = await probeAccountInfo(tokens.accessToken, account.accountId);
    if (!results.some((item) => item.ok) && tokens.refreshToken && results.some((item) => item.status === 401 || item.status === 403)) {
      tokens = await refreshAccessToken(tokens.refreshToken);
      results = await probeAccountInfo(tokens.accessToken, account.accountId);
    }

    const latencyMs = Date.now() - started;
    const snapshot = extractSnapshot(results);
    if (!snapshot.rawSources.length) {
      const message = buildUnavailableMessage(results);
      updateAccountTestResult(id, {
        status: account.status === "error" || account.status === "unknown" ? "active" : account.status,
        remoteStatus: "subscription_unavailable",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        planType: account.planType,
        metadata: {
          lastCheckMessage: message,
          lastCheckLatencyMs: latencyMs,
          accountPlanSource: "none",
          subscriptionStatus: undefined,
          modelCount: undefined,
          quota5hUsedPercent: undefined,
          quota7dUsedPercent: undefined,
          requestCount7d: undefined,
          riskCount: undefined,
          cost5h: undefined,
          cost7d: undefined,
        },
      });
      persistedFailure = true;
      if (!options.silent) addActivityLog("account_test", "info", "库存直检未确认", message, { accountId: id });
      return { ok: true, message };
    }

    const message = buildMessage(snapshot);
    const planType = normalizePlanType(snapshot.planType) ?? account.planType;
    updateAccountTestResult(id, {
      status: activeStatus(),
      remoteStatus: snapshot.subscriptionStatus ?? "available",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      planType,
      metadata: buildSnapshotMetadata(snapshot, message, latencyMs),
    });
    if (!options.silent) addActivityLog("account_test", "success", "账号检测成功", message, { accountId: id, planType });
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "账号检测失败";
    if (!persistedFailure) {
      updateAccountTestResult(id, {
        status: "error",
        remoteStatus: "check_error",
        metadata: {
          lastCheckMessage: message,
          lastCheckLatencyMs: Date.now() - started,
          subscriptionStatus: undefined,
          modelCount: undefined,
          quota5hUsedPercent: undefined,
          quota7dUsedPercent: undefined,
          requestCount7d: undefined,
          riskCount: undefined,
          cost5h: undefined,
          cost7d: undefined,
        },
      });
      if (!options.silent) addActivityLog("account_test", "error", "账号检测失败", message, { accountId: id });
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function processDueAccountChecks() {
  if (schedulerState.__accountPoolAccountCheckSweep) return schedulerState.__accountPoolAccountCheckSweep;

  schedulerState.__accountPoolAccountCheckSweep = (async () => {
    const now = Date.now();
    const dueAccounts = listAccounts()
      .filter((account) => shouldCheckAccount(account, now))
      .sort((a, b) => {
        const left = a.lastStatusCheckedAt ? Date.parse(a.lastStatusCheckedAt) : 0;
        const right = b.lastStatusCheckedAt ? Date.parse(b.lastStatusCheckedAt) : 0;
        return left - right;
      })
      .slice(0, ACCOUNT_CHECK_BATCH_SIZE);

    for (const account of dueAccounts) {
      try {
        await checkAccountById(account.id, { silent: true });
      } catch (error) {
        console.error(
          `[account-check] ${account.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  })().finally(() => {
    schedulerState.__accountPoolAccountCheckSweep = null;
  });

  return schedulerState.__accountPoolAccountCheckSweep;
}

export function ensureAccountCheckScheduler() {
  if (schedulerState.__accountPoolAccountCheckTimer) return;

  schedulerState.__accountPoolAccountCheckTimer = setInterval(() => {
    void processDueAccountChecks();
  }, ACCOUNT_CHECK_SWEEP_INTERVAL_MS);

  schedulerState.__accountPoolAccountCheckTimer.unref?.();
  void processDueAccountChecks();
}
