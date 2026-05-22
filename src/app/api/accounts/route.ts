import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { addActivityLog, createManualAccount } from "@/lib/server/db";
import { manualAccountInputSchema, type ManualAccountInput } from "@/lib/types";

function normalizeLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseJsonAccounts(value: string): ManualAccountInput[] {
  const parsed = JSON.parse(value) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { accounts?: unknown }).accounts)
      ? (parsed as { accounts: unknown[] }).accounts
      : [parsed];

  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const credentials =
      record.credentials && typeof record.credentials === "object"
        ? (record.credentials as Record<string, unknown>)
        : record;
    const accessToken = readString(credentials, "accessToken", "access_token", "token", "api_key", "apiKey");
    const refreshToken = readString(credentials, "refreshToken", "refresh_token", "refresh");
    const label = readString(record, "label", "name") || readString(credentials, "email") || `导入账号 ${index + 1}`;
    if (!accessToken && !refreshToken) return [];
    return [
      {
        label,
        email: readString(credentials, "email"),
        accountId: readString(credentials, "accountId", "chatgpt_account_id"),
        userId: readString(credentials, "userId", "chatgpt_user_id"),
        planType: readString(credentials, "planType", "plan_type"),
        accessToken: accessToken || `refresh:${refreshToken}`,
        refreshToken,
        status: "active" as const,
        notes: "JSON 导入",
      },
    ];
  });
}

function buildManualAccounts(payload: Record<string, unknown>): ManualAccountInput[] {
  const importMode = typeof payload.importMode === "string" ? payload.importMode : "manual";
  const rawText = typeof payload.bulkText === "string" ? payload.bulkText.trim() : "";

  if (importMode === "json" && rawText) {
    return parseJsonAccounts(rawText);
  }

  if ((importMode === "refresh" || importMode === "access" || importMode === "apiKey" || importMode === "oauth") && rawText) {
    return normalizeLines(rawText).map((value, index) => ({
      label: `批量账号 ${index + 1}`,
      accessToken: importMode === "refresh" ? `refresh:${value}` : value,
      refreshToken: importMode === "refresh" ? value : "",
      status: "active" as const,
      notes:
        importMode === "apiKey"
          ? "API Key 导入"
          : importMode === "access"
            ? "Access Token 导入"
            : importMode === "oauth"
              ? "OAuth 导入"
              : "Refresh Token 导入",
    }));
  }

  return [manualAccountInputSchema.parse(payload)];
}

export async function POST(request: Request) {
  try {
    const rawPayload = (await request.json()) as Record<string, unknown>;
    const accounts = buildManualAccounts(rawPayload);
    if (accounts.length === 0) {
      return NextResponse.json({ ok: false, error: "没有可导入的账号" }, { status: 400 });
    }

    const createdIds = accounts.map((item) => {
      const payload = manualAccountInputSchema.parse(item);
      return createManualAccount(payload);
    });

    addActivityLog(
      "account_create",
      "success",
      "本地账号已创建",
      `已加入号池 ${createdIds.length} 个账号`,
      { accountIds: createdIds },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, accountIds: createdIds, count: createdIds.length });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "创建失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
