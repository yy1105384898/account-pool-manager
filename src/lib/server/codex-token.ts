import "server-only";

import type { AccountRecord } from "@/lib/types";

type CodexClaims = {
  email: string | null;
  accountId: string | null;
  userId: string | null;
  planType: string | null;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseCodexTokenClaims(token?: string | null): CodexClaims | null {
  const parts = token?.trim().split(".");
  if (!parts || parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const authValue = payload["https://api.openai.com/auth"];
    const auth =
      authValue && typeof authValue === "object" && !Array.isArray(authValue)
        ? (authValue as Record<string, unknown>)
        : {};

    return {
      email: readString(payload.email),
      accountId: readString(auth.chatgpt_account_id),
      userId: readString(auth.chatgpt_user_id) ?? readString(auth.user_id),
      planType: readString(auth.chatgpt_plan_type),
    };
  } catch {
    return null;
  }
}

export function readAccountIdToken(account: AccountRecord) {
  const token = account.metadata.idToken;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export function resolveAccountPlanType(account: AccountRecord, accessToken?: string | null) {
  return (
    parseCodexTokenClaims(readAccountIdToken(account))?.planType ??
    parseCodexTokenClaims(accessToken ?? account.accessToken)?.planType ??
    account.planType
  );
}
