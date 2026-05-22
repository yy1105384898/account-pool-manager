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
  quota5hUsedPercent: number | null;
  quota7dUsedPercent: number | null;
  requestCount7d: number | null;
  riskCount: number | null;
  cost5h: number | null;
  cost7d: number | null;
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
  { name: "codex_usage", url: "https://chatgpt.com/backend-api/codex/usage" },
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

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizePercent(value: unknown) {
  const number = readNumber(value);
  if (number === null) return null;
  const percent = number <= 1 && number >= 0 ? number * 100 : number;
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
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

function firstNumberByKeys(value: unknown, keys: string[]) {
  let matched: number | null = null;
  walkObjects(value, (item) => {
    if (matched !== null) return;
    for (const key of keys) {
      const direct = readNumber(item[key]);
      if (direct !== null) {
        matched = direct;
        return;
      }
    }
  });
  return matched;
}

function percentFromRateLimit(value: unknown, windowNames: string[]) {
  let matched: number | null = null;
  walkObjects(value, (item) => {
    if (matched !== null) return;
    const windowName =
      readString(item.window) ??
      readString(item.window_name) ??
      readString(item.name) ??
      readString(item.key);
    const isTargetWindow = windowName
      ? windowNames.some((name) => windowName.toLowerCase().includes(name))
      : false;
    if (!isTargetWindow) return;
    matched =
      normalizePercent(item.used_percent) ??
      normalizePercent(item.usage_percent) ??
      normalizePercent(item.percent_used) ??
      normalizePercent(item.used);
  });
  return matched;
}

function extractSnapshot(results: ProbeResult[]): AccountSnapshot {
  const payloads = results.filter((item) => item.ok).map((item) => item.data);
  const rawSources = results.filter((item) => item.ok).map((item) => item.name);
  const merged = payloads.length === 1 ? payloads[0] : payloads;

  const quota5hUsedPercent =
    firstNumberByKeys(merged, ["usage_percent_5h", "codex_5h_used_percent", "quota5hUsedPercent"])
    ?? percentFromRateLimit(merged, ["5h", "primary"]);
  const quota7dUsedPercent =
    firstNumberByKeys(merged, ["usage_percent_7d", "codex_7d_used_percent", "quota7dUsedPercent"])
    ?? percentFromRateLimit(merged, ["7d", "weekly", "secondary"]);

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
    quota5hUsedPercent: normalizePercent(quota5hUsedPercent),
    quota7dUsedPercent: normalizePercent(quota7dUsedPercent),
    requestCount7d: firstNumberByKeys(merged, ["request_count_7d", "requests_7d", "num_requests_7d"]),
    riskCount: firstNumberByKeys(merged, ["risk_count", "riskCount"]),
    cost5h: firstNumberByKeys(merged, ["cost_5h", "cost5h"]),
    cost7d: firstNumberByKeys(merged, ["cost_7d", "cost7d"]),
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

function buildMessage(snapshot: AccountSnapshot, latencyMs: number) {
  const plan = normalizePlanType(snapshot.planType) ?? "未返回";
  return `套餐 ${plan}，状态可用，延迟 ${latencyMs}ms`;
}

function buildSnapshotMetadata(snapshot: AccountSnapshot, message: string, latencyMs: number) {
  const metadata: Record<string, unknown> = {
    lastCheckMessage: message,
    lastCheckLatencyMs: latencyMs,
    accountPlanSource: snapshot.rawSources.join(","),
    modelCount: null,
  };

  if (snapshot.subscriptionStatus) metadata.subscriptionStatus = snapshot.subscriptionStatus;
  if (snapshot.quota5hUsedPercent !== null) metadata.quota5hUsedPercent = snapshot.quota5hUsedPercent;
  if (snapshot.quota7dUsedPercent !== null) metadata.quota7dUsedPercent = snapshot.quota7dUsedPercent;
  if (snapshot.requestCount7d !== null) metadata.requestCount7d = snapshot.requestCount7d;
  if (snapshot.riskCount !== null) metadata.riskCount = snapshot.riskCount;
  if (snapshot.cost5h !== null) metadata.cost5h = snapshot.cost5h;
  if (snapshot.cost7d !== null) metadata.cost7d = snapshot.cost7d;

  return metadata;
}

function statusFromSnapshot(snapshot: AccountSnapshot): AccountStatus {
  if (
    (snapshot.quota5hUsedPercent !== null && snapshot.quota5hUsedPercent >= 100) ||
    (snapshot.quota7dUsedPercent !== null && snapshot.quota7dUsedPercent >= 100)
  ) {
    return "quota_exhausted";
  }
  return "active";
}

function shouldCheckAccount(account: AccountRecord, now: number) {
  if (!account.accessToken.trim()) return false;
  if (account.status === "disabled" || account.status === "banned") return false;
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
      const firstError = results.find((item) => item.error)?.error ?? "未读取到套餐订阅信息";
      updateAccountTestResult(id, {
        status: "error",
        remoteStatus: results.some((item) => item.status === 401 || item.status === 403) ? "unauthorized" : "subscription_unavailable",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        metadata: {
          lastCheckMessage: firstError,
          lastCheckLatencyMs: latencyMs,
          accountPlanSource: "none",
          modelCount: null,
        },
      });
      persistedFailure = true;
      if (!options.silent) addActivityLog("account_test", "error", "账号检测失败", firstError, { accountId: id });
      throw new Error(firstError);
    }

    const message = buildMessage(snapshot, latencyMs);
    const planType = normalizePlanType(snapshot.planType) ?? account.planType;
    updateAccountTestResult(id, {
      status: statusFromSnapshot(snapshot),
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
        metadata: { lastCheckMessage: message, lastCheckLatencyMs: Date.now() - started },
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
