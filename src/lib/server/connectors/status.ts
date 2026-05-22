import "server-only";

export type RemoteStatusSummary = {
  platform: string;
  latencyMs: number;
  updatedAt: string;
  totalAccounts: number;
  normalAccounts: number;
  warningAccounts: number;
  statusDistribution: Record<string, number>;
  platformDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  quotaWindows: Array<{
    label: string;
    usedPercent: number | null;
    remainingPercent: number | null;
    sampleSize: number;
  }>;
};

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
  if (["disabled", "inactive", "expired", "banned", "error", "quota_exhausted"].includes(normalized)) return normalized;
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
