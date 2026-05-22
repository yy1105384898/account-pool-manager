import "server-only";

import type { AccountRecord, IntegrationPushOptions, IntegrationRecord, PlanGroupMap } from "@/lib/types";

type FetchOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
};

function detailFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof record.message === "string") return record.message;
  return null;
}

export function authHeaders(integration: IntegrationRecord) {
  if (integration.authMode === "none" || !integration.authValue) {
    return {} as Record<string, string>;
  }
  if (integration.authMode === "bearer") {
    const token = integration.authValue.trim();
    return {
      Authorization: token.toLowerCase().startsWith("bearer ")
        ? token
        : `Bearer ${token}`,
    } satisfies Record<string, string>;
  }
  if (integration.authMode === "cookie") {
    return { Cookie: integration.authValue.trim() } satisfies Record<string, string>;
  }
  return {
    [integration.authHeaderName?.trim() || "Authorization"]:
      integration.authValue.trim(),
  } satisfies Record<string, string>;
}

export function buildUrl(baseUrl: string, path: string, query?: URLSearchParams) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  if (query) url.search = query.toString();
  return url.toString();
}

export function cleanGroupList(groups?: string[] | null) {
  return groups?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function normalizePlanKey(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "default" as const;
  if (normalized.includes("plus")) return "plus" as const;
  if (normalized.includes("pro")) return "pro" as const;
  if (normalized.includes("free")) return "free" as const;
  return "default" as const;
}

function hasPlanGroups(planGroupMap?: Partial<PlanGroupMap> | null) {
  if (!planGroupMap) return false;
  return ["plus", "free", "pro", "default"].some((key) =>
    cleanGroupList(planGroupMap[key as keyof PlanGroupMap]).length > 0,
  );
}

export function resolveAccountPushGroups(
  account: AccountRecord,
  options?: IntegrationPushOptions,
  fallbackGroups: string[] = [],
) {
  const planGroupMap = options?.planGroupMap;
  if (hasPlanGroups(planGroupMap)) {
    const planKey = normalizePlanKey(account.planType);
    const routedGroups = cleanGroupList(planGroupMap?.[planKey]);
    if (routedGroups.length > 0) return routedGroups;

    const defaultGroups = cleanGroupList(planGroupMap?.default);
    if (defaultGroups.length > 0) return defaultGroups;
  }

  const targetGroups = cleanGroupList(options?.targetGroups);
  return targetGroups.length > 0 ? targetGroups : cleanGroupList(fallbackGroups);
}

export async function fetchJson<T>(
  integration: IntegrationRecord,
  path: string,
  options: FetchOptions = {},
) {
  const headers: Record<string, string> = {
    ...authHeaders(integration),
    ...(options.headers ?? {}),
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(integration.baseUrl, path), {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const detail =
      detailFromPayload(payload) ?? text.slice(0, 200) ?? "unknown error";
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }

  return payload as T;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value };
  }
}
