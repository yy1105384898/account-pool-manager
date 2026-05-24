import "server-only";

import type {
  AccountRecord,
  IntegrationPushOptions,
  IntegrationRecord,
  RemoteAccountSnapshot,
} from "@/lib/types";
import { fetchJson, resolveAccountPushGroups } from "@/lib/server/connectors/shared";
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
  tags?: string[] | null;
  group_ids?: Array<number | string> | null;
  enabled?: boolean | null;
  locked?: boolean | null;
  at_only?: boolean | null;
} & Record<string, unknown>;

type CodexProxyAdminAccountList = {
  accounts?: CodexProxyAdminAccount[];
};

type CodexProxyAccountGroup = {
  id?: number | string;
  name?: string | null;
};

type CodexProxyAccountGroupList = {
  groups?: CodexProxyAccountGroup[];
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
} & Record<string, unknown>;

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

function matchesTemplateId(record: Record<string, unknown>, target: string) {
  const normalizedTarget = target.trim().toLowerCase();
  return ["id", "name", "email", "account_id", "accountId"].some((key) => {
    const value = record[key];
    return (typeof value === "string" || typeof value === "number") &&
      String(value).trim().toLowerCase() === normalizedTarget;
  });
}

function accountIdentityKeys(account: AccountRecord) {
  return [account.email, account.label, account.accountId, account.remoteId, account.userId]
    .map(codexProxyAccountKey)
    .filter((value): value is string => Boolean(value));
}

function matchesAccountIdentity(record: CodexProxyAdminAccount, account: AccountRecord) {
  const keys = new Set(accountIdentityKeys(account));
  if (keys.size === 0) return false;
  return [record.email, record.name, record.id === undefined || record.id === null ? null : String(record.id)]
    .map(codexProxyAccountKey)
    .some((value) => value ? keys.has(value) : false);
}

function createdAccountId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.id,
    record.account && typeof record.account === "object"
      ? (record.account as Record<string, unknown>).id
      : null,
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>).id
      : null,
  ];
  for (const value of candidates) {
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

function readTemplateGroups(record: Record<string, unknown>) {
  const value = record.groups ?? record.group_names ?? record.groupNames ?? record.group ?? record.group_name;
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function readTemplateProxy(record: Record<string, unknown>) {
  return record.proxy ?? record.proxies ?? record.proxy_url ?? record.proxyUrl ?? null;
}

function codexProxyRemoteStatus(item: CodexProxyAdminAccount) {
  if (item.enabled === false) return "disabled";
  if (isCodexProxyBanned(item)) return "banned";
  if (isCodexProxyRateLimited(item)) return "quota_exhausted";
  return text(item.status) ?? "unknown";
}

function codexProxyStatusLabel(item: CodexProxyAdminAccount) {
  return normalizeRemoteStatus(codexProxyRemoteStatus(item));
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

function isCodexProxyBanned(item: CodexProxyAdminAccount) {
  const values = [item.status, item.health_tier, item.cooldown_reason]
    .map((value) => text(value)?.toLowerCase())
    .filter(Boolean);
  return values.some((value) =>
    value === "unauthorized" ||
    value === "banned" ||
    value === "forbidden" ||
    value === "blocked" ||
    value?.includes("ban"),
  );
}

function isCodexProxyRateLimited(item: CodexProxyAdminAccount) {
  const values = [item.status, item.cooldown_reason, item.health_tier]
    .map((value) => text(value)?.toLowerCase())
    .filter(Boolean);
  return values.some((value) =>
    value === "rate_limited" ||
    value === "rate-limited" ||
    value === "rate_limit" ||
    value?.includes("rate"),
  );
}

function resolvePlanTag(account: AccountRecord) {
  const normalized = account.planType?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("plus")) return "Plus";
  if (normalized.includes("pro")) return "Pro";
  if (normalized.includes("free")) return "Free";
  return account.planType?.trim() || null;
}

function resolvePlanTypeValue(account: AccountRecord) {
  const tag = resolvePlanTag(account);
  return tag ? tag.toLowerCase() : account.planType?.trim() || undefined;
}

async function resolveCodexProxyGroupIds(
  integration: IntegrationRecord,
  groupNames: string[],
) {
  if (groupNames.length === 0) return [] as number[];
  const groups = await loadCodexProxyAccountGroups(integration);
  const nameToId = new Map(
    groups.flatMap((group) => {
      const name = text(group.name)?.toLowerCase();
      const id = Number(group.id);
      return name && Number.isFinite(id) ? [[name, id] as const] : [];
    }),
  );
  const missing: string[] = [];
  const ids = groupNames.flatMap((name) => {
    const id = nameToId.get(name.trim().toLowerCase());
    if (!id) missing.push(name);
    return id ? [id] : [];
  });
  if (missing.length > 0) {
    throw new Error(`codexproxy 缺少账号分组：${missing.join("，")}，请先在中转站创建同名分组`);
  }
  return [...new Set(ids)];
}

function buildCodexProxyPlacementPayload(
  account: AccountRecord,
  groupNames: string[],
  groupIds: number[],
  pushNotes?: string | null,
) {
  const planTag = resolvePlanTag(account);
  const tags = planTag ? [planTag] : [];
  const planType = resolvePlanTypeValue(account);

  return {
    plan_type: planType,
    tag: tags[0],
    tags: tags.length ? tags : undefined,
    tag_name: tags[0],
    tag_names: tags.length ? tags : undefined,
    group: groupNames[0],
    groups: groupNames.length ? groupNames : undefined,
    group_name: groupNames[0],
    group_names: groupNames.length ? groupNames : undefined,
    group_id: groupIds[0],
    group_ids: groupIds.length ? groupIds : undefined,
    account_group_id: groupIds[0],
    account_group_ids: groupIds.length ? groupIds : undefined,
    notes: pushNotes?.trim() || undefined,
  };
}

async function findCodexProxyRemoteAccountId(
  integration: IntegrationRecord,
  account: AccountRecord,
  fallbackPayload?: unknown,
) {
  const directId = createdAccountId(fallbackPayload);
  if (directId) return directId;

  const accounts = await loadCodexProxyAdminAccounts(integration);
  const matched = accounts.find((item) => matchesAccountIdentity(item, account));
  if (matched?.id !== undefined && matched.id !== null) {
    return String(matched.id);
  }
  return null;
}

async function applyCodexProxyAccountPlacement(
  integration: IntegrationRecord,
  account: AccountRecord,
  options?: IntegrationPushOptions,
  fallbackPayload?: unknown,
  fallbackGroups: string[] = [],
) {
  const pushGroups = resolveAccountPushGroups(account, options, fallbackGroups);
  const pushGroupIds = await resolveCodexProxyGroupIds(integration, pushGroups);
  const placement = buildCodexProxyPlacementPayload(
    account,
    pushGroups,
    pushGroupIds,
    options?.pushNotes,
  );
  const tags = Array.isArray(placement.tags) ? placement.tags : [];
  const groupIds = Array.isArray(placement.group_ids) ? placement.group_ids : [];
  if (tags.length === 0 && groupIds.length === 0) return false;

  const remoteId = await findCodexProxyRemoteAccountId(integration, account, fallbackPayload);
  if (!remoteId) {
    throw new Error(`codexproxy 未找到账号 ${account.email ?? account.label ?? account.id}，无法设置标签和分组`);
  }

  await fetchJson(integration, `/api/admin/accounts/${encodeURIComponent(remoteId)}/scheduler`, {
    method: "PATCH",
    body: {
      tags,
      group_ids: groupIds,
    },
  });
  return true;
}

async function loadCodexProxyAdminHealth(integration: IntegrationRecord) {
  return fetchJson<CodexProxyAdminHealth>(integration, "/api/admin/health");
}

async function loadCodexProxyAdminAccounts(integration: IntegrationRecord) {
  const payload = await fetchJson<CodexProxyAdminAccountList>(integration, "/api/admin/accounts");
  return Array.isArray(payload.accounts) ? payload.accounts : [];
}

async function loadCodexProxyAccountGroups(integration: IntegrationRecord) {
  const payload = await fetchJson<CodexProxyAccountGroupList>(
    integration,
    "/api/admin/account-groups",
  );
  return Array.isArray(payload.groups) ? payload.groups : [];
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

export async function readCodexProxyAccountsSnapshot(
  integration: IntegrationRecord,
): Promise<RemoteAccountSnapshot[]> {
  const [statusAccounts, exportAccounts] = await Promise.all([
    loadCodexProxyAdminAccounts(integration),
    loadCodexProxyExportAccounts(integration).catch(() => []),
  ]);
  const exportByEmail = new Map<string, CodexProxyExportAccount>();
  const exportByAccountId = new Map<string, CodexProxyExportAccount>();

  for (const item of exportAccounts) {
    const email = codexProxyAccountKey(item.email);
    const accountId = codexProxyAccountKey(item.account_id);
    if (email) exportByEmail.set(email, item);
    if (accountId) exportByAccountId.set(accountId, item);
  }

  return statusAccounts.map((item) => {
    const email = text(item.email ?? item.name);
    const idText = text(item.id === undefined || item.id === null ? null : String(item.id));
    const matchedExport =
      (email ? exportByEmail.get(email.toLowerCase()) : undefined) ??
      (idText ? exportByAccountId.get(idText.toLowerCase()) : undefined);
    const refreshToken = text(matchedExport?.refresh_token);
    const accessToken = text(matchedExport?.access_token) ?? (refreshToken ? `refresh:${refreshToken}` : null);

    return {
      remoteId: idText ?? text(matchedExport?.account_id) ?? email,
      email,
      label: text(item.name) ?? email,
      accountId: text(matchedExport?.account_id) ?? idText,
      userId: null,
      accessToken,
      refreshToken,
      planType: text(item.plan_type) ?? text(matchedExport?.plan_type),
      status: codexProxyRemoteStatus(item),
      metadata: {
        platform: "codexproxy",
        enabled: item.enabled ?? null,
        locked: item.locked ?? null,
        healthTier: text(item.health_tier),
        cooldownReason: text(item.cooldown_reason),
        rawStatus: text(item.status),
      },
    };
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
    item.enabled !== false && isNormalRemoteStatus(codexProxyRemoteStatus(item)),
  ).length;
  const totalAccounts = accounts.length || (typeof health.total === "number" ? health.total : 0);
  const normalAccounts =
    accounts.length > 0
      ? fallbackNormal
      : typeof health.available === "number"
        ? Math.min(health.available, totalAccounts || health.available)
        : 0;
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
  options?: IntegrationPushOptions,
) {
  let pushed = 0;
  const template = options?.cloneAccountId?.trim()
    ? await readCodexProxyAccountTemplate(integration, options.cloneAccountId)
    : null;
  const templateProxy = typeof template?.proxy === "string" ? template.proxy : "";

  for (const item of accounts) {
    const refreshToken = resolveRefreshToken(item);
    const name = item.label ?? item.email ?? item.accountId ?? undefined;
    const pushGroups = resolveAccountPushGroups(item, options, template?.groups ?? []);
    const pushGroupIds = await resolveCodexProxyGroupIds(integration, pushGroups);
    const placement = buildCodexProxyPlacementPayload(
      item,
      pushGroups,
      pushGroupIds,
      options?.pushNotes,
    );

    if (refreshToken) {
      const created = await fetchJson(integration, "/api/admin/accounts", {
        method: "POST",
        body: {
          name,
          refresh_token: refreshToken,
          proxy_url: templateProxy,
          ...placement,
        },
      });
      await applyCodexProxyAccountPlacement(
        integration,
        item,
        options,
        created,
        template?.groups ?? [],
      );
      pushed += 1;
      continue;
    }

    const accessToken = item.accessToken.trim();
    if (!accessToken || accessToken.toLowerCase().startsWith("refresh:")) {
      throw new Error(`账号 ${item.label ?? item.email ?? item.id} 缺少可推送的 access token`);
    }

    const created = await fetchJson(integration, "/api/admin/accounts/at", {
      method: "POST",
      body: {
        name,
        access_token: accessToken,
        proxy_url: templateProxy,
        ...placement,
      },
    });
    await applyCodexProxyAccountPlacement(
      integration,
      item,
      options,
      created,
      template?.groups ?? [],
    );
    pushed += 1;
  }

  return {
    pushed,
    message: `已推送 ${pushed} 个账号到 codexproxy`,
  };
}

export async function ensureCodexProxyAccountsPlacement(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
  options?: IntegrationPushOptions,
) {
  let updated = 0;
  const template = options?.cloneAccountId?.trim()
    ? await readCodexProxyAccountTemplate(integration, options.cloneAccountId)
    : null;

  for (const account of accounts) {
    const changed = await applyCodexProxyAccountPlacement(
      integration,
      account,
      options,
      undefined,
      template?.groups ?? [],
    );
    if (changed) updated += 1;
  }

  return {
    updated,
    message: `已补写 codexproxy 标签/分组 ${updated} 个`,
  };
}

export async function readCodexProxyAccountTemplate(
  integration: IntegrationRecord,
  accountId: string,
) {
  const [statusAccounts, exportAccounts] = await Promise.all([
    loadCodexProxyAdminAccounts(integration).catch(() => []),
    loadCodexProxyExportAccounts(integration).catch(() => []),
  ]);
  const matchedStatus = statusAccounts.find((item) => matchesTemplateId(item, accountId));
  const matchedExport = exportAccounts.find((item) => matchesTemplateId(item, accountId));
  const raw = {
    ...(matchedExport ?? {}),
    ...(matchedStatus ?? {}),
  };

  if (!matchedStatus && !matchedExport) return null;

  return {
    accountId: String(raw.id ?? raw.name ?? raw.account_id ?? accountId),
    groups: readTemplateGroups(raw),
    proxy: readTemplateProxy(raw),
    notes: typeof raw.notes === "string" ? raw.notes : null,
    raw,
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
  options?: IntegrationPushOptions,
) {
  const body = {
    accounts: accounts.map((item) => {
      const targetGroups = resolveAccountPushGroups(item, options);
      return {
        token: item.accessToken,
        refreshToken: item.refreshToken ?? undefined,
        label: item.label ?? item.email ?? item.accountId ?? undefined,
        email: item.email ?? undefined,
        accountId: item.accountId ?? undefined,
        userId: item.userId ?? undefined,
        planType: item.planType ?? undefined,
        group: targetGroups[0],
        groups: targetGroups.length ? targetGroups : undefined,
        group_name: targetGroups[0],
        group_names: targetGroups.length ? targetGroups : undefined,
        notes: options?.pushNotes?.trim() || undefined,
      };
    }),
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
