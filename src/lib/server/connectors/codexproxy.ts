import "server-only";

import type { AccountRecord, IntegrationRecord } from "@/lib/types";
import { fetchJson } from "@/lib/server/connectors/shared";
import {
  createDistribution,
  isNormalRemoteStatus,
  normalizeRemoteStatus,
  percent,
  type RemoteStatusSummary,
} from "@/lib/server/connectors/status";

type LegacyCodexProxyExportAccount = {
  id?: string;
  token?: string;
  refreshToken?: string | null;
  email?: string | null;
  accountId?: string | null;
  userId?: string | null;
  label?: string | null;
  planType?: string | null;
  status?: string | null;
  platform?: string | null;
  type?: string | null;
  quota5hUsedPercent?: number | string | null;
  quota7dUsedPercent?: number | string | null;
};

type CodexProxyAdminHealth = {
  status?: string;
  available?: number;
  total?: number;
};

type CodexProxyAdminAccount = {
  id?: number | string;
  name?: string | null;
  email?: string | null;
  plan_type?: string | null;
  status?: string | null;
  account_type?: string | null;
  health_tier?: string | null;
  usage_percent_5h?: number | string | null;
  usage_percent_7d?: number | string | null;
  enabled?: boolean | null;
  locked?: boolean | null;
  at_only?: boolean | null;
};

type CodexProxyAdminAccountList = {
  accounts?: CodexProxyAdminAccount[];
};

type CodexProxyExportAccount = {
  type?: string | null;
  email?: string | null;
  plan_type?: string | null;
  account_id?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  last_refresh?: string | null;
  expired?: string | null;
  codex_5h_used_percent?: number | string | null;
  codex_7d_used_percent?: number | string | null;
};

type RemoteAccount = {
  remoteId?: string | null;
  email?: string | null;
  label?: string | null;
  accountId?: string | null;
  userId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  planType?: string | null;
  status?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

function text(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function averagePercent(values: Array<number | null>) {
  const usable = values.filter((value): value is number => value !== null);
  if (usable.length === 0) return null;
  const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  return Math.round(average * 10) / 10;
}

function quotaWindow(label: string, values: Array<number | null>, fallbackSize: number) {
  const usedPercent = averagePercent(values);
  return {
    label,
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.round((100 - usedPercent) * 10) / 10,
    sampleSize: values.filter((value) => value !== null).length || fallbackSize,
  };
}

function legacyAccountsFromPayload(payload: { accounts?: LegacyCodexProxyExportAccount[] }) {
  return Array.isArray(payload.accounts) ? payload.accounts : [];
}

function codexProxyExportAccountsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload as CodexProxyExportAccount[];
  }
  if (payload && typeof payload === "object") {
    const record = payload as { accounts?: unknown };
    if (Array.isArray(record.accounts)) {
      return record.accounts as CodexProxyExportAccount[];
    }
  }
  return [] as CodexProxyExportAccount[];
}

function codexProxyAccountKey(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function codexProxyRemoteStatus(item: CodexProxyAdminAccount) {
  if (item.enabled === false) return "disabled";
  return text(item.status) ?? "unknown";
}

function codexProxyStatusLabel(item: CodexProxyAdminAccount) {
  if (item.enabled === false) return "disabled";
  return normalizeRemoteStatus(item.status);
}

function codexProxyTypeLabel(item: CodexProxyAdminAccount) {
  const accountType = text(item.account_type) ?? "oauth";
  return item.at_only ? `${accountType} / AT` : accountType;
}

function resolveRefreshToken(account: AccountRecord) {
  const refreshToken = account.refreshToken?.trim();
  if (refreshToken) return refreshToken;
  const accessToken = account.accessToken.trim();
  if (accessToken.toLowerCase().startsWith("refresh:")) {
    return accessToken.slice("refresh:".length).trim() || null;
  }
  return null;
}

async function loadCodexProxyAdminHealth(integration: IntegrationRecord) {
  return fetchJson<CodexProxyAdminHealth>(integration, "/api/admin/health");
}

async function loadCodexProxyAdminAccounts(integration: IntegrationRecord) {
  const payload = await fetchJson<CodexProxyAdminAccountList>(integration, "/api/admin/accounts");
  return Array.isArray(payload.accounts) ? payload.accounts : [];
}

async function loadCodexProxyExportAccounts(integration: IntegrationRecord) {
  const payload = await fetchJson<unknown>(integration, "/api/admin/accounts/export");
  return codexProxyExportAccountsFromPayload(payload);
}

async function loadLegacyCodexProxyAccounts(integration: IntegrationRecord) {
  const payload = await fetchJson<{ accounts?: LegacyCodexProxyExportAccount[] }>(
    integration,
    "/auth/accounts/export?format=full",
  );
  return legacyAccountsFromPayload(payload);
}

export async function testCodexProxy(integration: IntegrationRecord) {
  const payload = await loadCodexProxyAdminHealth(integration);
  const available = typeof payload.available === "number" ? payload.available : 0;
  const total = typeof payload.total === "number" ? payload.total : available;
  return { message: `连接成功，可用账号 ${available}/${total}` };
}

export async function importFromCodexProxy(integration: IntegrationRecord) {
  const [exportAccounts, statusAccounts] = await Promise.all([
    loadCodexProxyExportAccounts(integration),
    loadCodexProxyAdminAccounts(integration),
  ]);

  const statusByEmail = new Map<string, CodexProxyAdminAccount>();
  for (const item of statusAccounts) {
    const key = codexProxyAccountKey(item.email ?? item.name);
    if (key) statusByEmail.set(key, item);
  }

  return exportAccounts.flatMap<RemoteAccount>((item) => {
    const email = text(item.email);
    const refreshToken = text(item.refresh_token);
    const accessToken = text(item.access_token) ?? (refreshToken ? `refresh:${refreshToken}` : null);
    if (!accessToken) {
      return [];
    }

    const matchedStatus = email ? statusByEmail.get(email.toLowerCase()) : undefined;
    return [
      {
        remoteId: text(item.account_id) ?? email,
        email,
        label: email ?? text(item.account_id),
        accountId: text(item.account_id),
        userId: null,
        accessToken,
        refreshToken,
        planType: text(item.plan_type),
        status: matchedStatus ? codexProxyRemoteStatus(matchedStatus) : "active",
        metadata: {
          platform: "codexproxy",
          sourceProject: "codexproxy-admin",
          exportType: text(item.type) ?? "codex",
          expiresAt: text(item.expired),
          lastRefreshAt: text(item.last_refresh),
          quota5hUsedPercent: percent(item.codex_5h_used_percent),
          quota7dUsedPercent: percent(item.codex_7d_used_percent),
          enabled: matchedStatus?.enabled ?? null,
          locked: matchedStatus?.locked ?? null,
          healthTier: text(matchedStatus?.health_tier),
          accountType: text(matchedStatus?.account_type),
          atOnly: matchedStatus?.at_only ?? !refreshToken,
        },
      },
    ];
  });
}

export async function readCodexProxyStatus(integration: IntegrationRecord): Promise<RemoteStatusSummary> {
  const started = Date.now();
  const [health, accounts] = await Promise.all([
    loadCodexProxyAdminHealth(integration),
    loadCodexProxyAdminAccounts(integration),
  ]);

  const statusValues = accounts.map(codexProxyStatusLabel);
  const fallbackNormal = accounts.filter((item) =>
    item.enabled !== false && isNormalRemoteStatus(item.status),
  ).length;
  const totalAccounts = accounts.length || (typeof health.total === "number" ? health.total : 0);
  const normalAccounts =
    typeof health.available === "number"
      ? Math.min(health.available, totalAccounts || health.available)
      : fallbackNormal;
  const quota5h = accounts.map((item) => percent(item.usage_percent_5h));
  const quota7d = accounts.map((item) => percent(item.usage_percent_7d));

  return {
    platform: "codexproxy",
    latencyMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
    totalAccounts,
    normalAccounts,
    warningAccounts: Math.max(totalAccounts - normalAccounts, 0),
    statusDistribution: createDistribution(statusValues),
    platformDistribution: createDistribution(accounts.map((item) => text(item.plan_type) ?? "未知套餐")),
    typeDistribution: createDistribution(accounts.map(codexProxyTypeLabel)),
    quotaWindows: [
      quotaWindow("5h", quota5h, totalAccounts),
      quotaWindow("7d", quota7d, totalAccounts),
    ],
  };
}

export async function pushToCodexProxy(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  let pushed = 0;

  for (const item of accounts) {
    const refreshToken = resolveRefreshToken(item);
    const name = item.label ?? item.email ?? item.accountId ?? undefined;

    if (refreshToken) {
      await fetchJson(integration, "/api/admin/accounts", {
        method: "POST",
        body: {
          name,
          refresh_token: refreshToken,
          proxy_url: "",
        },
      });
      pushed += 1;
      continue;
    }

    const accessToken = item.accessToken.trim();
    if (!accessToken || accessToken.toLowerCase().startsWith("refresh:")) {
      throw new Error(`账号 ${item.label ?? item.email ?? item.id} 缺少可推送的 access token`);
    }

    await fetchJson(integration, "/api/admin/accounts/at", {
      method: "POST",
      body: {
        name,
        access_token: accessToken,
        proxy_url: "",
      },
    });
    pushed += 1;
  }

  return {
    pushed,
    message: `已推送 ${pushed} 个账号到 codexproxy`,
  };
}

export async function testCpa(integration: IntegrationRecord) {
  const payload = await fetchJson<{ accounts?: unknown[] }>(integration, "/auth/accounts");
  const count = Array.isArray(payload.accounts) ? payload.accounts.length : 0;
  return { message: `连接成功，远端账号 ${count} 个` };
}

export async function importFromCpa(integration: IntegrationRecord) {
  const accounts = await loadLegacyCodexProxyAccounts(integration);
  return accounts.map<RemoteAccount>((item) => ({
    remoteId: item.id ?? null,
    email: item.email ?? null,
    label: item.label ?? item.email ?? item.accountId ?? null,
    accountId: item.accountId ?? null,
    userId: item.userId ?? null,
    accessToken: item.token ?? null,
    refreshToken: item.refreshToken ?? null,
    planType: item.planType ?? null,
    status: item.status ?? null,
    metadata: { platform: "cpa", sourceProject: "cpa" },
  }));
}

export async function readCpaStatus(integration: IntegrationRecord): Promise<RemoteStatusSummary> {
  const started = Date.now();
  const accounts = await loadLegacyCodexProxyAccounts(integration);
  const statuses = accounts.map((item) => normalizeRemoteStatus(item.status));
  const normalAccounts = accounts.filter((item) => isNormalRemoteStatus(item.status)).length;
  const quota5h = accounts.map((item) => percent(item.quota5hUsedPercent));
  const quota7d = accounts.map((item) => percent(item.quota7dUsedPercent));

  return {
    platform: "CPA",
    latencyMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
    totalAccounts: accounts.length,
    normalAccounts,
    warningAccounts: accounts.length - normalAccounts,
    statusDistribution: createDistribution(statuses),
    platformDistribution: createDistribution(accounts.map((item) => item.platform ?? "OpenAI")),
    typeDistribution: createDistribution(accounts.map((item) => item.type ?? "OAuth")),
    quotaWindows: [
      quotaWindow("5h", quota5h, accounts.length),
      quotaWindow("7d", quota7d, accounts.length),
    ],
  };
}

export async function pushToCpa(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  const body = {
    accounts: accounts.map((item) => ({
      token: item.accessToken,
      refreshToken: item.refreshToken ?? undefined,
      label: item.label ?? item.email ?? item.accountId ?? undefined,
      email: item.email ?? undefined,
      accountId: item.accountId ?? undefined,
      userId: item.userId ?? undefined,
      planType: item.planType ?? undefined,
    })),
  };

  await fetchJson(integration, "/auth/accounts/import", {
    method: "POST",
    body,
  });

  return {
    pushed: accounts.length,
    message: `已推送 ${accounts.length} 个账号到 CPA`,
  };
}
