import "server-only";

import type {
  AccountRecord,
  IntegrationRecord,
  RemoteAccountSnapshot,
} from "@/lib/types";
import { parseCodexTokenClaims, readAccountIdToken, resolveAccountPlanType } from "@/lib/server/codex-token";
import { authHeaders, buildUrl, fetchJson } from "@/lib/server/connectors/shared";
import {
  createDistribution,
  isNormalRemoteStatus,
  normalizeRemoteStatus,
  type RemoteStatusSummary,
} from "@/lib/server/connectors/status";

type CpaAuthFile = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  provider?: string | null;
  email?: string | null;
  status?: string | null;
  status_message?: string | null;
  disabled?: boolean | null;
  unavailable?: boolean | null;
  id_token?: { plan_type?: string | null; chatgpt_account_id?: string | null } | null;
};

type CpaAuthFilesPayload = {
  files?: CpaAuthFile[];
};

type CpaCodexCredential = {
  type?: string | null;
  id_token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  account_id?: string | null;
  last_refresh?: string | null;
  email?: string | null;
  expired?: string | null;
  plan_type?: string | null;
} & Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isCodexFile(file: CpaAuthFile) {
  return (text(file.type) ?? text(file.provider))?.toLowerCase() === "codex";
}

function cpaRemoteStatus(file: CpaAuthFile) {
  if (file.disabled) return "disabled";
  if (file.unavailable) return "error";
  const status = text(file.status)?.toLowerCase();
  if (!status || status === "ready") return "active";
  return status;
}

function filePlanType(file: CpaAuthFile, credential?: CpaCodexCredential) {
  return (
    text(file.id_token?.plan_type) ??
    parseCodexTokenClaims(text(credential?.id_token))?.planType ??
    text(credential?.plan_type)
  );
}

async function loadCpaFiles(integration: IntegrationRecord) {
  const payload = await fetchJson<CpaAuthFilesPayload>(integration, "/v0/management/auth-files");
  return (Array.isArray(payload.files) ? payload.files : []).filter(isCodexFile);
}

async function downloadCpaCredential(integration: IntegrationRecord, name: string) {
  return fetchJson<CpaCodexCredential>(
    integration,
    `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`,
  );
}

function cpaFileName(account: AccountRecord) {
  const saved = text(account.metadata.cpaAuthFileName);
  if (saved?.toLowerCase().endsWith(".json")) return saved;
  const identity = (account.email ?? account.accountId ?? account.id)
    .replace(/[^a-zA-Z0-9@._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "account";
  const plan = (resolveAccountPlanType(account) ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return `codex-${identity}${plan ? `-${plan}` : ""}.json`;
}

function cpaCredential(account: AccountRecord) {
  return {
    type: "codex",
    id_token: readAccountIdToken(account) ?? undefined,
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    account_id: account.accountId ?? undefined,
    last_refresh: text(account.metadata.lastRefreshAt) ?? undefined,
    email: account.email ?? undefined,
    expired: text(account.metadata.expiresAt) ?? text(account.metadata.expired) ?? undefined,
    plan_type: resolveAccountPlanType(account) ?? undefined,
  };
}

async function uploadCpaCredential(integration: IntegrationRecord, account: AccountRecord) {
  const name = cpaFileName(account);
  const response = await fetch(
    buildUrl(integration.baseUrl, `/v0/management/auth-files?name=${encodeURIComponent(name)}`),
    {
      method: "POST",
      headers: { ...authHeaders(integration), "Content-Type": "application/json" },
      body: JSON.stringify(cpaCredential(account)),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    },
  );
  const detail = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${detail.slice(0, 200)}`);
  }
}

export async function testCpa(integration: IntegrationRecord) {
  const files = await loadCpaFiles(integration);
  return { message: `连接成功，Codex 认证文件 ${files.length} 个` };
}

export async function importFromCpa(integration: IntegrationRecord) {
  const files = await loadCpaFiles(integration);
  const accounts: RemoteAccountSnapshot[] = [];

  for (const file of files) {
    const name = text(file.name);
    if (!name) continue;
    const credential = await downloadCpaCredential(integration, name);
    const accessToken = text(credential.access_token);
    const refreshToken = text(credential.refresh_token);
    if (!accessToken && !refreshToken) continue;
    const claims = parseCodexTokenClaims(text(credential.id_token));

    accounts.push({
      remoteId: text(file.id) ?? name,
      email: text(credential.email) ?? text(file.email) ?? claims?.email ?? null,
      label: name,
      accountId: text(credential.account_id) ?? claims?.accountId ?? null,
      userId: claims?.userId ?? null,
      accessToken: accessToken ?? `refresh:${refreshToken}`,
      refreshToken,
      planType: filePlanType(file, credential),
      status: cpaRemoteStatus(file),
      notes: text(file.status_message),
      metadata: {
        platform: "cpa",
        sourceProject: "CLIProxyAPI",
        cpaAuthFileName: name,
        idToken: text(credential.id_token),
        lastRefreshAt: text(credential.last_refresh),
        expiresAt: text(credential.expired),
      },
    });
  }

  return accounts;
}

export async function readCpaStatus(integration: IntegrationRecord): Promise<RemoteStatusSummary> {
  const started = Date.now();
  const files = await loadCpaFiles(integration);
  const statuses = files.map(cpaRemoteStatus);
  const normalAccounts = statuses.filter((status) => isNormalRemoteStatus(status)).length;

  return {
    platform: "CPA",
    latencyMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
    totalAccounts: files.length,
    normalAccounts,
    warningAccounts: files.length - normalAccounts,
    statusDistribution: createDistribution(statuses.map(normalizeRemoteStatus)),
    platformDistribution: createDistribution(files.map(() => "Codex")),
    typeDistribution: createDistribution(files.map(() => "OAuth")),
    quotaWindows: [
      { label: "5h", usedPercent: null, remainingPercent: null, sampleSize: files.length },
      { label: "7d", usedPercent: null, remainingPercent: null, sampleSize: files.length },
    ],
  };
}

export async function pushToCpa(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  for (const account of accounts) {
    await uploadCpaCredential(integration, account);
  }

  return {
    pushed: accounts.length,
    message: `已推送 ${accounts.length} 个 Codex 认证文件到 CPA`,
  };
}
