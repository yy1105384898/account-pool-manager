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

type CodexProxyExportAccount = {
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
  quota5hRemainingPercent?: number | string | null;
  quota7dRemainingPercent?: number | string | null;
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

export async function testCodexProxy(integration: IntegrationRecord) {
  const payload = await fetchJson<{ accounts?: unknown[] }>(integration, "/auth/accounts");
  const count = Array.isArray(payload.accounts) ? payload.accounts.length : 0;
  return { message: `连接成功，远端账号 ${count} 个` };
}

export async function importFromCodexProxy(integration: IntegrationRecord) {
  const platform = integration.type === "cpa" ? "cpa" : "codexproxy";
  const payload = await fetchJson<{ accounts?: CodexProxyExportAccount[] }>(
    integration,
    "/auth/accounts/export?format=full",
  );

  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
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
    metadata: { platform, sourceProject: platform === "codexproxy" ? "codex2api" : "cpa" },
  }));
}

export async function readCodexProxyStatus(integration: IntegrationRecord): Promise<RemoteStatusSummary> {
  const started = Date.now();
  const payload = await fetchJson<{ accounts?: CodexProxyExportAccount[] }>(
    integration,
    "/auth/accounts/export?format=full",
  );
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const statuses = accounts.map((item) => normalizeRemoteStatus(item.status));
  const normalAccounts = accounts.filter((item) => isNormalRemoteStatus(item.status)).length;
  const quota5h = accounts.map((item) => percent(item.quota5hUsedPercent)).filter((value) => value !== null);
  const quota7d = accounts.map((item) => percent(item.quota7dUsedPercent)).filter((value) => value !== null);

  return {
    platform: integration.type === "cpa" ? "CPA" : "codexproxy",
    latencyMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
    totalAccounts: accounts.length,
    normalAccounts,
    warningAccounts: accounts.length - normalAccounts,
    statusDistribution: createDistribution(statuses),
    platformDistribution: createDistribution(accounts.map((item) => item.platform ?? "OpenAI")),
    typeDistribution: createDistribution(accounts.map((item) => item.type ?? "OAuth")),
    quotaWindows: [
      {
        label: "5h",
        usedPercent: quota5h.length ? Math.round(quota5h.reduce((sum, value) => sum + value, 0) / quota5h.length * 10) / 10 : null,
        remainingPercent: quota5h.length ? Math.round((100 - quota5h.reduce((sum, value) => sum + value, 0) / quota5h.length) * 10) / 10 : null,
        sampleSize: quota5h.length || accounts.length,
      },
      {
        label: "7d",
        usedPercent: quota7d.length ? Math.round(quota7d.reduce((sum, value) => sum + value, 0) / quota7d.length * 10) / 10 : null,
        remainingPercent: quota7d.length ? Math.round((100 - quota7d.reduce((sum, value) => sum + value, 0) / quota7d.length) * 10) / 10 : null,
        sampleSize: quota7d.length || accounts.length,
      },
    ],
  };
}

export async function pushToCodexProxy(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  const platform = integration.type === "cpa" ? "CPA" : "codexproxy";
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
    message: `已推送 ${accounts.length} 个账号到 ${platform}`,
  };
}
