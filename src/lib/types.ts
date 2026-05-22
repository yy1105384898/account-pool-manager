import { z } from "zod";

export const integrationTypes = ["codexproxy", "sub2api", "cpa"] as const;
export const authModes = ["none", "bearer", "cookie", "header"] as const;
export const accountSources = ["manual", "codexproxy", "sub2api", "cpa"] as const;
export const autoReplenishTriggerModes = ["any", "all"] as const;
export const autoReplenishCredentialFilters = [
  "all",
  "has_refresh_token",
  "access_only",
] as const;
export const autoReplenishRunStatuses = ["success", "error", "skipped"] as const;
export const accountStatuses = [
  "active",
  "inactive",
  "disabled",
  "expired",
  "banned",
  "error",
  "quota_exhausted",
  "refreshing",
  "unknown",
] as const;

export type IntegrationType = (typeof integrationTypes)[number];
export type AuthMode = (typeof authModes)[number];
export type AccountSource = (typeof accountSources)[number];
export type AccountStatus = (typeof accountStatuses)[number];
export type AutoReplenishTriggerMode =
  (typeof autoReplenishTriggerModes)[number];
export type AutoReplenishCredentialFilter =
  (typeof autoReplenishCredentialFilters)[number];
export type AutoReplenishRunStatus = (typeof autoReplenishRunStatuses)[number];

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

export type IntegrationRecord = {
  id: string;
  name: string;
  type: IntegrationType;
  baseUrl: string;
  authMode: AuthMode;
  authValue: string | null;
  authHeaderName: string | null;
  enabled: boolean;
  notes: string | null;
  lastTestStatus: "success" | "error" | null;
  lastTestMessage: string | null;
  lastSyncedAt: string | null;
  lastStatusSummary: RemoteStatusSummary | null;
  lastStatusCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRecord = {
  id: string;
  sourceType: AccountSource;
  sourceIntegrationId: string | null;
  remoteId: string | null;
  email: string | null;
  label: string | null;
  accountId: string | null;
  userId: string | null;
  accessToken: string;
  refreshToken: string | null;
  planType: string | null;
  status: AccountStatus;
  remoteStatus: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  lastImportedAt: string | null;
  lastStatusCheckedAt: string | null;
  lastPushedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLogRecord = {
  id: string;
  kind: string;
  status: "success" | "error" | "info";
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AutoReplenishRuleRecord = {
  id: string | null;
  integrationId: string;
  enabled: boolean;
  triggerMode: AutoReplenishTriggerMode;
  minUsableAccounts: number;
  min5hRemainingPercent: number;
  targetUsableAccounts: number;
  quotaLowPurchaseCount: number;
  maxAccountsPerRun: number;
  intervalMinutes: number;
  credentialFilter: AutoReplenishCredentialFilter;
  respectRateLimitRecovery: boolean;
  rateLimitRecoveryGraceMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: AutoReplenishRunStatus | null;
  lastMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AutoReplenishRunRecord = {
  id: string;
  integrationId: string;
  triggerSource: "manual" | "scheduled";
  status: AutoReplenishRunStatus;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AccountViewModel = {
  id: string;
  sourceType: AccountSource;
  sourceIntegrationId: string | null;
  remoteId: string | null;
  email: string | null;
  label: string | null;
  accountId: string | null;
  userId: string | null;
  planType: string | null;
  status: AccountStatus;
  remoteStatus: string | null;
  notes: string | null;
  tokenPreview: string;
  hasRefreshToken: boolean;
  lastImportedAt: string | null;
  lastStatusCheckedAt: string | null;
  lastPushedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationViewModel = Omit<IntegrationRecord, "authValue"> & {
  authConfigured: boolean;
  authPreview: string | null;
};

export type DashboardSummary = {
  totalAccounts: number;
  activeAccounts: number;
  warningAccounts: number;
  integrationCount: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  accounts: AccountViewModel[];
  integrations: IntegrationViewModel[];
  logs: ActivityLogRecord[];
  autoRules: AutoReplenishRuleRecord[];
  autoRuns: AutoReplenishRunRecord[];
};

const trimmedOptional = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    return value;
  });

export const integrationInputSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(80, "名称过长"),
  type: z.enum(integrationTypes),
  baseUrl: z.url("请输入正确的地址").transform((value) => value.replace(/\/+$/, "")),
  authMode: z.enum(authModes),
  authValue: trimmedOptional,
  authHeaderName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return value;
    }),
  notes: trimmedOptional,
});

export const manualAccountInputSchema = z.object({
  label: z.string().trim().max(120).optional(),
  email: z.email("邮箱格式不正确").optional().or(z.literal("")),
  accountId: z.string().trim().max(120).optional(),
  userId: z.string().trim().max(120).optional(),
  planType: z.string().trim().max(60).optional(),
  accessToken: z.string().trim().min(1, "access token 不能为空"),
  refreshToken: z.string().trim().optional(),
  status: z.enum(accountStatuses).default("active"),
  notes: trimmedOptional,
  proxyUrl: z.url("代理地址格式不正确").optional().or(z.literal("")),
  baseUrl: z.url("Base URL 格式不正确").optional().or(z.literal("")),
  models: z.array(z.string().trim().min(1)).optional(),
});

export const accountPatchSchema = z.object({
  label: z.string().trim().max(120).optional(),
  notes: trimmedOptional,
  status: z.enum(accountStatuses).optional(),
});

export const pushRequestSchema = z.object({
  integrationId: z.string().trim().min(1),
  accountIds: z.array(z.string().trim().min(1)).min(1, "至少选择一个账号"),
});

export const autoReplenishRuleSchema = z.object({
  enabled: z.boolean().default(false),
  triggerMode: z.enum(autoReplenishTriggerModes).default("any"),
  minUsableAccounts: z.int().min(0).max(999).default(3),
  min5hRemainingPercent: z.number().min(0).max(100).default(20),
  targetUsableAccounts: z.int().min(0).max(999).default(5),
  quotaLowPurchaseCount: z.int().min(0).max(999).default(1),
  maxAccountsPerRun: z.int().min(1).max(999).default(3),
  intervalMinutes: z.int().min(1).max(1440).default(5),
  credentialFilter: z.enum(autoReplenishCredentialFilters).default("all"),
  respectRateLimitRecovery: z.boolean().default(true),
  rateLimitRecoveryGraceMinutes: z.int().min(0).max(1440).default(30),
});

export type IntegrationInput = z.infer<typeof integrationInputSchema>;
export type ManualAccountInput = z.infer<typeof manualAccountInputSchema>;
export type AccountPatchInput = z.infer<typeof accountPatchSchema>;
export type PushRequestInput = z.infer<typeof pushRequestSchema>;
export type AutoReplenishRuleInput = z.infer<typeof autoReplenishRuleSchema>;
