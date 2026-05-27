import "server-only";

import type { AccountRecord, AccountStatus } from "@/lib/types";
import { addActivityLog, getAccountById, listAccounts, updateAccountTestResult } from "@/lib/server/db";
import { resolveAccountPlanType } from "@/lib/server/codex-token";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
};

type CodexProbeResult = {
  status: AccountStatus;
  remoteStatus: string;
  message: string;
  quota5hUsedPercent: number | null;
  quota7dUsedPercent: number | null;
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

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_TEST_MODEL = "gpt-5.2";
const NETWORK_RETRY_COUNT = 2;

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

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message === "[object Object]" ? "代理返回无效错误" : error.message;
  }
  if (typeof error === "string" && error.trim()) return error;
  if (isObject(error)) {
    return readString(error.message) ?? readString(error.error) ?? JSON.stringify(error);
  }
  return "账号检测失败";
}

function isTransientNetworkError(error: unknown) {
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|TLS|socket|代理连接|代理请求超时|网络|fetch failed/i.test(
    errorMessage(error),
  );
}

async function retryTransientNetwork<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= NETWORK_RETRY_COUNT; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === NETWORK_RETRY_COUNT) throw error;
    }
  }
  throw lastError;
}

function buildHeaders(accessToken: string, accountId: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Originator: "codex_cli_rs",
    "User-Agent": "codex_cli_rs/0.132.0",
    Version: "0.132.0",
    Connection: "Keep-Alive",
  };
  if (accountId) headers["Chatgpt-Account-Id"] = accountId;
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
    const response = await retryTransientNetwork(() =>
      fetchViaProxy("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      }),
    );
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

function codexTestBody() {
  return JSON.stringify({
    model: CODEX_TEST_MODEL,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Say hello in one sentence." }],
      },
    ],
    stream: true,
    store: false,
    instructions: "You are a helpful assistant. Reply briefly.",
  });
}

function headerNumber(headers: Headers, name: string) {
  const value = Number(headers.get(name));
  return Number.isFinite(value) ? value : null;
}

function readCodexQuota(headers: Headers) {
  const primaryUsed = headerNumber(headers, "x-codex-primary-used-percent");
  const primaryWindow = headerNumber(headers, "x-codex-primary-window-minutes");
  const secondaryUsed = headerNumber(headers, "x-codex-secondary-used-percent");
  const secondaryWindow = headerNumber(headers, "x-codex-secondary-window-minutes");
  const windows = [
    { used: primaryUsed, minutes: primaryWindow, fallback: "5h" as const },
    { used: secondaryUsed, minutes: secondaryWindow, fallback: "7d" as const },
  ];

  return {
    quota5hUsedPercent:
      windows.find((item) => item.minutes !== null && item.minutes <= 360)?.used ??
      windows.find((item) => item.fallback === "5h")?.used ??
      null,
    quota7dUsedPercent:
      windows.find((item) => item.minutes !== null && item.minutes >= 7 * 24 * 60 - 60)?.used ??
      windows.find((item) => item.fallback === "7d")?.used ??
      null,
  };
}

function responseReachedUsageLimit(response: Response) {
  const quota = readCodexQuota(response.headers);
  return (quota.quota5hUsedPercent !== null && quota.quota5hUsedPercent >= 100) ||
    (quota.quota7dUsedPercent !== null && quota.quota7dUsedPercent >= 100);
}

function errorDetail(body: string) {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const error = isObject(payload.error) ? payload.error : payload;
    return readString(error.message) ?? readString(error.error_description) ?? body.slice(0, 160);
  } catch {
    return body.trim().slice(0, 160);
  }
}

async function probeCodexConnection(
  accessToken: string,
  accountId: string | null,
): Promise<CodexProbeResult> {
  const response = await retryTransientNetwork(() =>
    fetchViaProxy(CODEX_RESPONSES_URL, {
      method: "POST",
      headers: buildHeaders(accessToken, accountId),
      body: codexTestBody(),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    }),
  );
  const body = await response.text();
  const quota = readCodexQuota(response.headers);

  if (response.status === 200) {
    if (responseReachedUsageLimit(response)) {
      return {
        status: "quota_exhausted",
        remoteStatus: "codex_rate_limited",
        message: "Codex 限流",
        ...quota,
      };
    }
    return { status: "active", remoteStatus: "available", message: "Codex 可用", ...quota };
  }
  if (response.status === 401) {
    return { status: "banned", remoteStatus: "unauthorized", message: "Codex 封禁", ...quota };
  }
  if (response.status === 429) {
    return {
      status: "quota_exhausted",
      remoteStatus: "codex_rate_limited",
      message: "Codex 限流",
      ...quota,
    };
  }

  const detail = errorDetail(body);
  return {
    status: "error",
    remoteStatus: `codex_http_${response.status}`,
    message: `Codex 异常（${response.status}${detail ? `: ${detail}` : ""}）`,
    ...quota,
  };
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

function formatQuotaRemaining(usedPercent: number | null) {
  if (usedPercent === null) return "未返回";
  const remaining = Math.max(0, 100 - usedPercent);
  return `${Math.round(remaining * 10) / 10}%`;
}

function buildQuotaMessage(probe: CodexProbeResult) {
  if (probe.quota5hUsedPercent === null && probe.quota7dUsedPercent === null) return "";
  return `，5h余 ${formatQuotaRemaining(probe.quota5hUsedPercent)}，7d余 ${formatQuotaRemaining(probe.quota7dUsedPercent)}`;
}

function buildSnapshotMetadata(message: string, latencyMs: number, probe?: CodexProbeResult) {
  return {
    lastCheckMessage: message,
    lastCheckLatencyMs: latencyMs,
    accountPlanSource: "codex_probe",
    subscriptionStatus: undefined,
    modelCount: undefined,
    quota5hUsedPercent: probe?.quota5hUsedPercent ?? undefined,
    quota7dUsedPercent: probe?.quota7dUsedPercent ?? undefined,
    requestCount7d: undefined,
    riskCount: undefined,
    cost5h: undefined,
    cost7d: undefined,
  };
}

function shouldCheckAccount(account: AccountRecord, now: number) {
  if (!account.accessToken.trim()) return false;
  if (account.status === "disabled") return false;
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
  try {
    if (!tokens.accessToken) {
      if (!tokens.refreshToken) throw new Error("缺少 Access Token 或 Refresh Token");
      tokens = await refreshAccessToken(tokens.refreshToken);
    }

    let probe = await probeCodexConnection(tokens.accessToken, account.accountId);
    if (probe.status === "banned" && tokens.refreshToken) {
      tokens = await refreshAccessToken(tokens.refreshToken);
      probe = await probeCodexConnection(tokens.accessToken, account.accountId);
    }

    const latencyMs = Date.now() - started;
    const planType = normalizePlanType(resolveAccountPlanType(account, tokens.accessToken)) ?? account.planType;
    const message = `${probe.message}，套餐 ${planType ?? "未返回"}${buildQuotaMessage(probe)}`;
    updateAccountTestResult(id, {
      status: probe.status,
      remoteStatus: probe.remoteStatus,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      planType,
      metadata: buildSnapshotMetadata(message, latencyMs, probe),
    });
    if (!options.silent) {
      addActivityLog(
        "account_test",
        probe.status === "active" ? "success" : probe.status === "error" ? "error" : "info",
        probe.status === "active" ? "Codex账号检测成功" : "Codex账号检测异常",
        message,
        { accountId: id, planType },
      );
    }
    return { ok: true, message };
  } catch (error) {
    const message = errorMessage(error);
    if (isTransientNetworkError(error)) {
      const networkMessage = `检测网络失败：${message}；已保留原账号状态`;
      updateAccountTestResult(id, {
        status: account.status,
        remoteStatus: account.remoteStatus ?? "network_error",
        metadata: buildSnapshotMetadata(networkMessage, Date.now() - started),
      });
      if (!options.silent) {
        addActivityLog("account_test", "info", "账号检测网络失败", networkMessage, { accountId: id });
      }
      throw new Error(networkMessage);
    }
    updateAccountTestResult(id, {
      status: "error",
      remoteStatus: "check_error",
      metadata: buildSnapshotMetadata(message, Date.now() - started),
    });
    if (!options.silent) addActivityLog("account_test", "error", "账号检测失败", message, { accountId: id });
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
