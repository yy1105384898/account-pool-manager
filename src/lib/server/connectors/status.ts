import "server-only";

export type { RemoteStatusSummary } from "@/lib/types";

export function createDistribution(values: Array<string | null | undefined>) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value?.trim() || "未知";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export function normalizeRemoteStatus(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "未知";
  if (["active", "normal", "ok", "available", "enabled", "正常"].includes(normalized)) return "正常";
  if (["unauthorized", "forbidden", "banned", "blocked", "封禁", "被封禁"].includes(normalized)) return "banned";
  if (["rate_limited", "rate-limit", "rate limit", "limited", "quota_exhausted", "额度耗尽", "限流"].includes(normalized)) return "quota_exhausted";
  if (["disabled", "inactive", "expired", "error", "refreshing"].includes(normalized)) return normalized;
  return value ?? "未知";
}

export function isNormalRemoteStatus(value?: string | null) {
  return normalizeRemoteStatus(value) === "正常";
}

export function percent(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, parsed));
  }
  return null;
}
