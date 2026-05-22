import "server-only";

import type { AccountRecord, IntegrationRecord } from "@/lib/types";
import { fetchJson } from "@/lib/server/connectors/shared";

type AdminDataPayload = {
  accounts?: Array<{
    name?: string;
    notes?: string | null;
    platform?: string;
    type?: string;
    credentials?: Record<string, unknown>;
  }>;
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
    include_proxies: "false",
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
        },
      },
    ];
  });
}

export async function pushToSub2Api(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
) {
  const body = {
    contents: accounts.map((item) =>
      JSON.stringify({
        access_token: item.accessToken,
        refresh_token: item.refreshToken ?? undefined,
        email: item.email ?? undefined,
        chatgpt_account_id: item.accountId ?? undefined,
        chatgpt_user_id: item.userId ?? undefined,
        plan_type: item.planType ?? undefined,
      }),
    ),
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
