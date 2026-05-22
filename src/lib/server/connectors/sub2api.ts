import "server-only";

import type { AccountRecord, IntegrationPushOptions, IntegrationRecord } from "@/lib/types";
import { cleanGroupList, fetchJson, resolveAccountPushGroups } from "@/lib/server/connectors/shared";
import {
  createDistribution,
  isNormalRemoteStatus,
  normalizeRemoteStatus,
  percent,
  type RemoteStatusSummary,
} from "@/lib/server/connectors/status";

type AdminDataPayload = {
  accounts?: Array<{
    name?: string;
    notes?: string | null;
    platform?: string;
    type?: string;
    credentials?: Record<string, unknown>;
    quota?: Record<string, unknown>;
    usage?: Record<string, unknown>;
  } & Record<string, unknown>>;
};

type AccountListItem = {
  name?: string;
  status?: string;
};

type PaginatedResponse = {
  items?: AccountListItem[];
  pages?: number;
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

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function compact(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function readGroupList(record: Record<string, unknown>) {
  const value = record.groups ?? record.group_names ?? record.groupNames ?? record.group ?? record.group_name;
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function applyPushOptions(
  payload: Record<string, unknown>,
  options?: IntegrationPushOptions,
  groups?: string[],
) {
  const targetGroups = cleanGroupList(groups ?? options?.targetGroups);
  const next = { ...payload };

  if (targetGroups.length > 0) {
    next.groups = targetGroups;
    next.group_names = targetGroups;
    next.group = targetGroups[0];
    next.group_name = targetGroups[0];
  }

  if (options?.pushNotes?.trim()) {
    const notes = [options.pushNotes.trim(), typeof next.notes === "string" ? next.notes : ""]
      .filter(Boolean)
      .join(" / ");
    next.notes = notes;
  }

  return next;
}

async function loadStatuses(integration: IntegrationRecord) {
  const statusMap = new Map<string, string>();
  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const query = new URLSearchParams({
      page: String(page),
      page_size: "200",
      platform: "openai",
      type: "oauth",
      lite: "true",
    });
    const payload = await fetchJson<PaginatedResponse>(
      integration,
      `/api/v1/admin/accounts?${query.toString()}`,
    );
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      if (item.name && item.status) {
        statusMap.set(item.name, item.status);
      }
    }
    pages = typeof payload.pages === "number" && payload.pages > 0 ? payload.pages : 1;
    page += 1;
  }

  return statusMap;
}

export async function testSub2Api(integration: IntegrationRecord) {
  const query = new URLSearchParams({
    page: "1",
    page_size: "1",
    platform: "openai",
    type: "oauth",
    lite: "true",
  });
  const payload = await fetchJson<PaginatedResponse>(
    integration,
    `/api/v1/admin/accounts?${query.toString()}`,
  );
  const count = Array.isArray(payload.items) ? payload.items.length : 0;
  return { message: `连接成功，远端返回 ${count} 条账号数据` };
}

export async function importFromSub2Api(integration: IntegrationRecord) {
  const query = new URLSearchParams({
    platform: "openai",
    type: "oauth",
    include_proxies: "true",
  });

  const [payload, statuses] = await Promise.all([
    fetchJson<AdminDataPayload>(
      integration,
      `/api/v1/admin/accounts/data?${query.toString()}`,
    ),
    loadStatuses(integration),
  ]);

  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  return accounts.flatMap<RemoteAccount>((item) => {
    if (item.platform !== "openai" || item.type !== "oauth" || !item.credentials) {
      return [];
    }

    const email = readString(item.credentials, "email");
    const accountId = readString(item.credentials, "chatgpt_account_id");
    const userId = readString(item.credentials, "chatgpt_user_id");
    const accessToken = readString(item.credentials, "access_token");
    const refreshToken = readString(item.credentials, "refresh_token");
    const planType = readString(item.credentials, "plan_type");

    return [
      {
        remoteId: item.name ?? null,
        email,
        label: item.name ?? email,
        accountId,
        userId,
        accessToken,
        refreshToken,
        planType,
        status: item.name ? statuses.get(item.name) ?? "unknown" : "unknown",
        notes: item.notes ?? null,
        metadata: {
          platform: "sub2api",
          exportedName: item.name ?? null,
          sub2apiConfig: item,
          quota5hUsedPercent: percent(item.quota?.["5h"] ?? item.usage?.["5h"] ?? item.credentials?.quota5hUsedPercent),
          quota7dUsedPercent: percent(item.quota?.["7d"] ?? item.usage?.["7d"] ?? item.credentials?.quota7dUsedPercent),
        },
      },
    ];
  });
}

export async function readSub2ApiAccountTemplate(
  integration: IntegrationRecord,
  accountId: string,
) {
  const query = new URLSearchParams({
    platform: "openai",
    type: "oauth",
    include_proxies: "true",
  });
  const payload = await fetchJson<AdminDataPayload>(
    integration,
    `/api/v1/admin/accounts/data?${query.toString()}`,
  );
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const target = accountId.trim();
  const account = accounts.find((item) =>
    item.name === target ||
    readString(item.credentials ?? {}, "email") === target ||
    readString(item.credentials ?? {}, "chatgpt_account_id") === target,
  );

  if (!account) return null;

  return {
    accountId: account.name ?? target,
    groups: readGroupList(account),
    proxy: account.proxy ?? account.proxies ?? account.proxy_url ?? account.proxyUrl ?? null,
    notes: account.notes ?? null,
    raw: account,
  };
}

export async function readSub2ApiStatus(integration: IntegrationRecord): Promise<RemoteStatusSummary> {
  const started = Date.now();
  const query = new URLSearchParams({
    platform: "openai",
    type: "oauth",
    include_proxies: "true",
  });
  const [payload, statuses] = await Promise.all([
    fetchJson<AdminDataPayload>(
      integration,
      `/api/v1/admin/accounts/data?${query.toString()}`,
    ),
    loadStatuses(integration),
  ]);
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const statusValues = accounts.map((item) =>
    normalizeRemoteStatus(item.name ? statuses.get(item.name) : null),
  );
  const normalAccounts = statusValues.filter((status) => isNormalRemoteStatus(status)).length;
  const quota5h = accounts
    .map((item) => percent(item.quota?.["5h"] ?? item.usage?.["5h"] ?? item.credentials?.quota5hUsedPercent))
    .filter((value) => value !== null);
  const quota7d = accounts
    .map((item) => percent(item.quota?.["7d"] ?? item.usage?.["7d"] ?? item.credentials?.quota7dUsedPercent))
    .filter((value) => value !== null);

  return {
    platform: "sub2api",
    latencyMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
    totalAccounts: accounts.length,
    normalAccounts,
    warningAccounts: accounts.length - normalAccounts,
    statusDistribution: createDistribution(statusValues),
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

export async function pushToSub2Api(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
  options?: IntegrationPushOptions,
) {
  let templateConfig: Record<string, unknown> = {};
  if (options?.cloneAccountId?.trim()) {
    const template = await readSub2ApiAccountTemplate(integration, options.cloneAccountId);
    if (template?.raw && typeof template.raw === "object") {
      templateConfig = template.raw as Record<string, unknown>;
    }
  }

  const accountPayloads = accounts.map((item) => {
    const storedConfig =
      item.metadata.sub2apiConfig && typeof item.metadata.sub2apiConfig === "object"
        ? (item.metadata.sub2apiConfig as Record<string, unknown>)
        : {};
    const baseConfig = { ...storedConfig, ...templateConfig };
    const pushGroups = resolveAccountPushGroups(item, options, readGroupList(baseConfig));
    const storedCredentials =
      baseConfig.credentials && typeof baseConfig.credentials === "object"
        ? (baseConfig.credentials as Record<string, unknown>)
        : {};
    const credentials = compact({
      ...storedCredentials,
      access_token: item.accessToken,
      refresh_token: item.refreshToken ?? undefined,
      email: item.email ?? storedCredentials.email,
      chatgpt_account_id: item.accountId ?? storedCredentials.chatgpt_account_id,
      chatgpt_user_id: item.userId ?? storedCredentials.chatgpt_user_id,
      plan_type: item.planType ?? storedCredentials.plan_type,
    });
    return applyPushOptions(compact({
      ...baseConfig,
      name: item.label ?? item.email ?? item.accountId ?? undefined,
      notes: item.notes ?? baseConfig.notes,
      platform: baseConfig.platform ?? "openai",
      type: baseConfig.type ?? "oauth",
      credentials,
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      email: credentials.email,
      chatgpt_account_id: credentials.chatgpt_account_id,
      chatgpt_user_id: credentials.chatgpt_user_id,
      plan_type: credentials.plan_type,
    }), options, pushGroups);
  });

  const body = {
    contents: accountPayloads.map((item) => JSON.stringify(item)),
    accounts: accountPayloads,
    update_existing: true,
  };

  await fetchJson(integration, "/api/v1/admin/accounts/import/codex-session", {
    method: "POST",
    body,
  });

  return {
    pushed: accounts.length,
    message: `已推送 ${accounts.length} 个账号到 sub2api`,
  };
}
