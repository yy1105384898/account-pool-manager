import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { addActivityLog, createManualAccount, findManualAccountByCredential } from "@/lib/server/db";
import { parseCodexTokenClaims } from "@/lib/server/codex-token";
import { accountStatuses, manualAccountInputSchema, type AccountStatus, type ManualAccountInput } from "@/lib/types";

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
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJsonPayloads(value: string) {
  try {
    return [JSON.parse(value) as unknown];
  } catch (error) {
    const payloads: unknown[] = [];
    let current = "";
    for (const line of normalizeLines(value)) {
      current = current ? `${current}\n${line}` : line;
      try {
        payloads.push(JSON.parse(current) as unknown);
        current = "";
      } catch {
        // Multi-line JSON files are joined here until a complete object is formed.
      }
    }
    if (payloads.length > 0) return payloads;
    throw error;
  }
}

function parseMaybeJsonString(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { access_token: trimmed };
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { access_token: trimmed };
  }
}

function collectAccountItems(payload: unknown): unknown[] {
  if (typeof payload === "string") return [parseMaybeJsonString(payload)];
  if (Array.isArray(payload)) return payload.map(parseMaybeJsonString);
  if (!isRecord(payload)) return [];

  const arrayKeys = ["accounts", "contents", "files", "data", "items", "results", "rows", "list"];
  for (const key of arrayKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.map(parseMaybeJsonString);
  }

  for (const key of arrayKeys) {
    const nested = payload[key];
    const items = collectAccountItems(nested);
    if (items.length > 0) return items;
  }

  return [payload];
}

function readNestedString(record: Record<string, unknown>, keys: string[]): string {
  const direct = readString(record, ...keys);
  if (direct) return direct;

  const nestedKeys = [
    "credentials",
    "credential",
    "tokens",
    "token",
    "account",
    "user",
    "profile",
    "metadata",
    "raw",
    "content",
  ];
  for (const key of nestedKeys) {
    const value = record[key];
    if (isRecord(value)) {
      const nested = readNestedString(value, keys);
      if (nested) return nested;
    }
  }

  return "";
}

function readStatus(record: Record<string, unknown>): AccountStatus {
  const value = readNestedString(record, ["status", "state"]).toLowerCase();
  return accountStatuses.includes(value as AccountStatus) ? (value as AccountStatus) : "active";
}

function readPlanType(record: Record<string, unknown>) {
  const value = readNestedString(record, [
    "planType",
    "plan_type",
    "chatgpt_plan_type",
    "account_plan_type",
    "subscription_plan_type",
    "subscription_plan",
    "account_plan",
    "plan",
    "sku",
  ]);
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("plus")) return "Plus";
  if (normalized.includes("pro")) return "Pro";
  if (normalized.includes("team")) return "Team";
  if (normalized.includes("enterprise")) return "Enterprise";
  if (normalized.includes("free")) return "Free";
  return value;
}

function parseJsonAccounts(value: string): ManualAccountInput[] {
  const items = parseJsonPayloads(value).flatMap(collectAccountItems);

  return items.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const record = item as Record<string, unknown>;
    const accessToken = readNestedString(record, [
      "accessToken",
      "access_token",
      "access",
      "token",
      "api_key",
      "apiKey",
      "key",
      "at",
    ]);
    const refreshToken = readNestedString(record, ["refreshToken", "refresh_token", "refresh", "rt"]);
    const idToken = readNestedString(record, ["idToken", "id_token"]);
    const claims = parseCodexTokenClaims(idToken) ?? parseCodexTokenClaims(accessToken);
    const email = readNestedString(record, ["email", "account_email", "user_email", "mail"]) || claims?.email || "";
    const label = readNestedString(record, ["label", "name", "title"]) || email || `导入账号 ${index + 1}`;
    const modelText = readNestedString(record, ["models", "model", "modelList"]);
    if (!accessToken && !refreshToken) return [];
    return [
      {
        label,
        email,
        accountId: readNestedString(record, [
          "accountId",
          "account_id",
          "chatgpt_account_id",
          "openai_account_id",
          "id",
        ]) || claims?.accountId || "",
        userId: readNestedString(record, ["userId", "user_id", "chatgpt_user_id", "openai_user_id"]) || claims?.userId || "",
        planType: readPlanType(record) || claims?.planType || "",
        accessToken: accessToken || `refresh:${refreshToken}`,
        refreshToken,
        idToken,
        status: readStatus(record),
        notes: "JSON 导入",
        proxyUrl: readNestedString(record, ["proxyUrl", "proxy_url", "proxy"]),
        baseUrl: readNestedString(record, ["baseUrl", "base_url", "api_base", "endpoint"]),
        models: modelText ? modelText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) : [],
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
    const proxyUrl = typeof payload.proxyUrl === "string" ? payload.proxyUrl : "";
    const baseUrl = typeof payload.baseUrl === "string" ? payload.baseUrl : "";
    const sharedRefreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken.trim() : "";
    const sharedNotes = typeof payload.notes === "string" ? payload.notes.trim() : "";
    const models =
      typeof payload.models === "string"
        ? payload.models.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
        : Array.isArray(payload.models)
          ? payload.models.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
          : [];
    return normalizeLines(rawText).map((value, index) => ({
      label: readString(payload, "label") || `批量账号 ${index + 1}`,
      accessToken: importMode === "refresh" ? `refresh:${value}` : value,
      refreshToken: importMode === "refresh" ? value : sharedRefreshToken,
      status: "active" as const,
      notes: sharedNotes || (importMode === "apiKey"
          ? "API Key 导入"
          : importMode === "access"
            ? "Access Token 导入"
            : importMode === "oauth"
              ? "OAuth 导入"
              : "Refresh Token 导入"),
      proxyUrl,
      baseUrl,
      models,
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

    let skipped = 0;
    const createdIds = accounts.flatMap((item) => {
      const payload = manualAccountInputSchema.parse(item);
      const existingId = findManualAccountByCredential(payload);
      if (existingId) {
        skipped += 1;
        return [];
      }
      return [createManualAccount(payload)];
    });

    if (createdIds.length === 0) {
      return NextResponse.json({ ok: false, error: `没有新增账号，已跳过重复账号 ${skipped} 个` }, { status: 400 });
    }

    addActivityLog(
      "account_create",
      "success",
      "本地账号已创建",
      `已加入号池 ${createdIds.length} 个账号${skipped ? `，跳过重复 ${skipped} 个` : ""}`,
      { accountIds: createdIds, skipped },
    );
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      accountIds: createdIds,
      count: createdIds.length,
      skipped,
      message: `已导入 ${createdIds.length} 个账号${skipped ? `，跳过重复 ${skipped} 个` : ""}`,
    });
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
