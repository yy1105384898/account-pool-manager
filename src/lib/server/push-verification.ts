import "server-only";

import type {
  AccountRecord,
  AccountStatus,
  IntegrationRecord,
  RemoteAccountSnapshot,
} from "@/lib/types";
import { updateAccountPushVerification } from "@/lib/server/db";
import { readIntegrationAccounts } from "@/lib/server/connectors";
import { isNormalRemoteStatus, normalizeRemoteStatus } from "@/lib/server/connectors/status";

type PushVerificationResult = {
  checked: number;
  normal: number;
  abnormal: number;
  missing: number;
  message: string;
};

type RemotePresenceResult = {
  present: AccountRecord[];
  missing: AccountRecord[];
  message: string;
};

function normalizeKey(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function addTokenKeys(target: Set<string>, value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return;
  target.add(normalized);
  if (normalized.toLowerCase().startsWith("refresh:")) {
    const refreshToken = normalized.slice("refresh:".length).trim();
    if (refreshToken) target.add(refreshToken);
  } else {
    target.add(`refresh:${normalized}`);
  }
}

function credentialKeys(account: AccountRecord | RemoteAccountSnapshot) {
  const keys = new Set<string>();
  addTokenKeys(keys, account.accessToken);
  addTokenKeys(keys, account.refreshToken);
  return keys;
}

function identityKeys(account: AccountRecord | RemoteAccountSnapshot) {
  return [account.email, account.accountId, account.userId, account.remoteId]
    .map(normalizeKey)
    .filter((value): value is string => Boolean(value));
}

function fallbackLabelKey(account: AccountRecord | RemoteAccountSnapshot) {
  const key = normalizeKey(account.label);
  if (!key) return null;
  if (/^(批量账号|导入账号)\s*\d+$/i.test(key)) return null;
  return key;
}

function hasIntersection(left: Set<string>, right: Set<string>) {
  for (const item of left) {
    if (right.has(item)) return true;
  }
  return false;
}

function findRemoteAccount(
  account: AccountRecord,
  remoteAccounts: RemoteAccountSnapshot[],
) {
  const localCredentialKeys = credentialKeys(account);
  if (localCredentialKeys.size > 0) {
    const matched = remoteAccounts.find((item) =>
      hasIntersection(localCredentialKeys, credentialKeys(item)),
    );
    if (matched) return matched;
  }

  const localIdentityKeys = new Set(identityKeys(account));
  if (localIdentityKeys.size > 0) {
    const matched = remoteAccounts.find((item) =>
      identityKeys(item).some((key) => localIdentityKeys.has(key)),
    );
    if (matched) return matched;
  }

  const labelKey = fallbackLabelKey(account);
  if (!labelKey) return null;
  return remoteAccounts.find((item) => fallbackLabelKey(item) === labelKey) ?? null;
}

function toAccountStatus(remoteStatus?: string | null): AccountStatus {
  const normalized = normalizeRemoteStatus(remoteStatus);
  if (normalized === "正常") return "active";
  switch (normalized.toLowerCase()) {
    case "unauthorized":
    case "forbidden":
    case "disabled":
    case "inactive":
    case "expired":
    case "banned":
    case "error":
    case "quota_exhausted":
    case "refreshing":
      return normalized as AccountStatus;
    default:
      return "unknown";
  }
}

export async function verifyPushedAccountsOnIntegration(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
): Promise<PushVerificationResult> {
  if (accounts.length === 0) {
    return {
      checked: 0,
      normal: 0,
      abnormal: 0,
      missing: 0,
      message: "没有需要校验的推送账号",
    };
  }

  const remoteAccounts = await readIntegrationAccounts(integration);
  let normal = 0;
  let abnormal = 0;
  let missing = 0;
  const checkedAt = new Date().toISOString();

  for (const account of accounts) {
    const matched = findRemoteAccount(account, remoteAccounts);
    if (!matched) {
      missing += 1;
      updateAccountPushVerification(account.id, {
        status: "error",
        remoteStatus: "推送后未在中转站找到",
        metadata: {
          lastPushCheckIntegrationId: integration.id,
          lastPushCheckIntegrationName: integration.name,
          lastPushCheckStatus: "missing",
          lastPushCheckMessage: "推送后未在中转站找到，已标记异常，避免重复补号",
          lastCheckMessage: "中转站未找到该账号，已标记异常",
          accountPlanSource: "relay",
          lastPushCheckedAt: checkedAt,
        },
      });
      continue;
    }

    const remoteStatus = normalizeRemoteStatus(matched.status);
    const accountStatus = toAccountStatus(matched.status);
    const isNormal = isNormalRemoteStatus(matched.status);
    const pushCheckMessage = isNormal
      ? `中转站 ${integration.name} 状态正常`
      : `中转站 ${integration.name} 状态异常：${remoteStatus}`;
    if (isNormal) normal += 1;
    else abnormal += 1;

    updateAccountPushVerification(account.id, {
      status: accountStatus,
      remoteStatus,
      planType: matched.planType?.trim() ? matched.planType : undefined,
      metadata: {
        lastPushCheckIntegrationId: integration.id,
        lastPushCheckIntegrationName: integration.name,
        lastPushCheckStatus: isNormal ? "normal" : "abnormal",
        lastPushCheckMessage: pushCheckMessage,
        lastCheckMessage: pushCheckMessage,
        accountPlanSource: "relay",
        lastPushCheckedAt: checkedAt,
      },
    });
  }

  return {
    checked: accounts.length,
    normal,
    abnormal,
    missing,
    message: `推送后校验 ${accounts.length} 个：正常 ${normal}，异常 ${abnormal}，未找到 ${missing}`,
  };
}

export async function splitAccountsByIntegrationPresence(
  integration: IntegrationRecord,
  accounts: AccountRecord[],
): Promise<RemotePresenceResult> {
  if (accounts.length === 0) {
    return { present: [], missing: [], message: "没有需要检查的账号" };
  }

  const remoteAccounts = await readIntegrationAccounts(integration);
  const present: AccountRecord[] = [];
  const missing: AccountRecord[] = [];

  for (const account of accounts) {
    if (findRemoteAccount(account, remoteAccounts)) {
      present.push(account);
    } else {
      missing.push(account);
    }
  }

  return {
    present,
    missing,
    message: `推送前去重：中转站已存在 ${present.length} 个，可推送 ${missing.length} 个`,
  };
}
