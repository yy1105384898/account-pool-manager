import { NextResponse } from "next/server";
import { getAccountsByIds, listAccounts } from "@/lib/server/db";
import type { AccountRecord } from "@/lib/types";

type ExportFormat = "pool" | "sub2api" | "cpa";

function compact<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}

function baseCredential(account: AccountRecord) {
  return compact({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    email: account.email,
    chatgpt_account_id: account.accountId,
    chatgpt_user_id: account.userId,
    plan_type: account.planType,
  });
}

function exportPool(accounts: AccountRecord[]) {
  return {
    format: "account-pool",
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((account) =>
      compact({
        label: account.label,
        email: account.email,
        accountId: account.accountId,
        userId: account.userId,
        planType: account.planType,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        status: account.status,
        notes: account.notes,
      }),
    ),
  };
}

function exportSub2Api(accounts: AccountRecord[]) {
  const contents = accounts.map((account) => JSON.stringify(baseCredential(account)));
  return {
    format: "sub2api",
    update_existing: true,
    contents,
    accounts: accounts.map((account) =>
      compact({
        name: account.label ?? account.email ?? account.accountId ?? account.id,
        platform: "openai",
        type: "oauth",
        notes: account.notes,
        credentials: baseCredential(account),
      }),
    ),
  };
}

function exportCpa(accounts: AccountRecord[]) {
  return {
    format: "cpa",
    accounts: accounts.map((account) =>
      compact({
        token: account.accessToken,
        refreshToken: account.refreshToken,
        label: account.label,
        email: account.email,
        accountId: account.accountId,
        userId: account.userId,
        planType: account.planType,
        status: account.status,
      }),
    ),
  };
}

function resolveFormat(value: string | null): ExportFormat {
  return value === "sub2api" || value === "cpa" ? value : "pool";
}

function resolveAccounts(searchParams: URLSearchParams) {
  const ids = [
    ...searchParams.getAll("id"),
    ...(searchParams.get("ids") ?? "").split(","),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return ids.length > 0 ? getAccountsByIds(ids) : listAccounts();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = resolveFormat(url.searchParams.get("format"));
  const accounts = resolveAccounts(url.searchParams);
  const payload =
    format === "sub2api" ? exportSub2Api(accounts) : format === "cpa" ? exportCpa(accounts) : exportPool(accounts);

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="account-pool-${format}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
