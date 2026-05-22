"use client";

import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CloudUpload,
  Fingerprint,
  KeyRound,
  Cpu,
  Database,
  type LucideIcon,
  Network,
  PlugZap,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  LogOut,
  Pencil,
  Play,
  Power,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  AccountStatus,
  AccountViewModel,
  AutoReplenishRuleRecord,
  AutoReplenishRunRecord,
  DashboardData,
  IntegrationType,
  IntegrationViewModel,
  PlanGroupMap,
  RemoteStatusSummary,
} from "@/lib/types";

const statusTone: Record<AccountStatus, string> = {
  active: "text-emerald-200 bg-emerald-400/12 border-emerald-300/25 shadow-[0_0_24px_rgba(52,211,153,0.10)]",
  inactive: "text-slate-300 bg-slate-400/10 border-slate-300/15",
  disabled: "text-slate-300 bg-slate-400/10 border-slate-300/15",
  expired: "text-amber-100 bg-amber-400/12 border-amber-300/25 shadow-[0_0_24px_rgba(251,191,36,0.10)]",
  banned: "text-rose-100 bg-rose-400/12 border-rose-300/25 shadow-[0_0_24px_rgba(251,113,133,0.10)]",
  error: "text-rose-100 bg-rose-400/12 border-rose-300/25 shadow-[0_0_24px_rgba(251,113,133,0.10)]",
  quota_exhausted: "text-orange-100 bg-orange-400/12 border-orange-300/25 shadow-[0_0_24px_rgba(251,146,60,0.10)]",
  refreshing: "text-cyan-100 bg-cyan-400/12 border-cyan-300/25 shadow-[0_0_24px_rgba(34,211,238,0.10)]",
  unknown: "text-slate-300 bg-slate-400/10 border-slate-300/15",
};

const accountStatusLabels: Record<AccountStatus, string> = {
  active: "可用",
  inactive: "未启用",
  disabled: "已停用",
  expired: "已过期",
  banned: "已封禁",
  error: "异常",
  quota_exhausted: "额度耗尽",
  refreshing: "刷新中",
  unknown: "未知",
};

const accountSourceLabels: Record<AccountViewModel["sourceType"], string> = {
  manual: "手动导入",
  codexproxy: "codexproxy",
  sub2api: "sub2api",
  cpa: "CPA",
};

const remoteStatusLabels: Record<string, string> = {
  active: "可用",
  available: "可用",
  subscription_checked: "可用",
  normal: "正常",
  inactive: "未启用",
  disabled: "已停用",
  expired: "已过期",
  banned: "已封禁",
  error: "异常",
  invalid: "失效",
  unauthorized: "鉴权失败",
  subscription_unavailable: "订阅未返回",
  check_error: "检测失败",
  quota_exhausted: "额度耗尽",
  exhausted: "额度耗尽",
  rate_limited: "限流",
  refreshing: "刷新中",
  unknown: "未知",
};

const sectionTitleClass =
  "text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/70";
const panelClass = "cyber-card matrix-glow rounded-[1.8rem] p-5 sm:p-6";
const inputClass =
  "neon-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-slate-500";
const hiddenInputClass =
  "hidden";
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition duration-200 disabled:opacity-55";
const secondaryButton =
  `${buttonBase} border border-cyan-200/15 bg-white/[0.045] text-slate-200 hover:border-cyan-200/30 hover:bg-cyan-300/10 hover:text-cyan-50`;
const primaryButton =
  `${buttonBase} border border-cyan-200/40 bg-cyan-300/90 text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] hover:bg-cyan-200`;
const dangerButton =
  `${buttonBase} border border-rose-300/25 bg-rose-400/12 text-rose-100 hover:bg-rose-400/18`;
const iconActionButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/14 bg-white/[0.045] text-slate-300 transition hover:border-cyan-200/35 hover:bg-cyan-300/10 hover:text-cyan-50 disabled:opacity-55";
const dangerIconActionButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/22 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/18 disabled:opacity-55";
const quotaCriticalRemainingPercent = 5;

const importModeLabels: Record<"refresh" | "access" | "apiKey" | "oauth" | "json", string> = {
  refresh: "Refresh Token",
  access: "Access Token",
  apiKey: "API Key",
  oauth: "OAuth 授权",
  json: "JSON 导入",
};

const importModeTabs: Array<{ value: AccountImportMode; label: string; icon: LucideIcon }> = [
  { value: "refresh", label: "Refresh Token", icon: RefreshCw },
  { value: "access", label: "Access Token", icon: Fingerprint },
  { value: "apiKey", label: "API Key", icon: KeyRound },
  { value: "oauth", label: "OAuth 授权", icon: KeyRound },
  { value: "json", label: "JSON 导入", icon: Database },
];

const autoRunStatusTone: Record<NonNullable<AutoReplenishRuleRecord["lastStatus"]>, string> = {
  success: "border-emerald-300/25 bg-emerald-400/12 text-emerald-100",
  error: "border-rose-300/25 bg-rose-400/12 text-rose-100",
  skipped: "border-cyan-200/18 bg-cyan-300/10 text-cyan-100",
};

const autoRunStatusLabels: Record<NonNullable<AutoReplenishRuleRecord["lastStatus"]>, string> = {
  success: "成功",
  error: "失败",
  skipped: "跳过",
};

const credentialFilterLabels: Record<AutoReplenishRuleRecord["credentialFilter"], string> = {
  all: "全部账号",
  has_refresh_token: "仅 Refresh Token",
  access_only: "仅 Access Token",
};

const planFilterLabels: Record<AutoReplenishRuleRecord["planFilters"][number], string> = {
  plus: "Plus",
  free: "Free",
  pro: "Pro",
};

const planGroupKeys = ["plus", "free", "pro", "default"] as const;
type PlanGroupKey = (typeof planGroupKeys)[number];

const planGroupLabels: Record<PlanGroupKey, string> = {
  plus: "Plus 组",
  free: "Free 组",
  pro: "Pro 组",
  default: "默认组",
};

function formatPlanFilters(planFilters: AutoReplenishRuleRecord["planFilters"]) {
  return planFilters.length
    ? planFilters.map((item) => planFilterLabels[item]).join(" / ")
    : "全部套餐";
}

function parseGroupText(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[\n,，|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatGroupText(groups?: string[]) {
  return groups?.join("\n") ?? "";
}

function hasPlanGroupMap(planGroupMap?: PlanGroupMap | null) {
  return planGroupKeys.some((key) => (planGroupMap?.[key] ?? []).length > 0);
}

function formatGroupRouting(rule: AutoReplenishRuleRecord) {
  if (hasPlanGroupMap(rule.planGroupMap)) {
    return planGroupKeys
      .flatMap((key) => {
        const groups = rule.planGroupMap[key] ?? [];
        return groups.length ? [`${planGroupLabels[key]} -> ${groups.join("/")}`] : [];
      })
      .join("；");
  }
  return rule.targetGroups.length ? rule.targetGroups.join(" / ") : "未设置";
}

type WorkspaceView = "overview" | "connections" | "proxies" | "add-account" | "inventory" | "activity";

const workspaceNavItems: Array<{
  view: WorkspaceView;
  label: string;
  icon: LucideIcon;
  meta: string;
}> = [
  { view: "overview", label: "监控概览", icon: Sparkles, meta: "只读" },
  { view: "connections", label: "中转管理", icon: PlugZap, meta: "配置/补池" },
  { view: "proxies", label: "代理管理", icon: Network, meta: "OpenAI" },
  { view: "add-account", label: "账号导入", icon: CloudUpload, meta: "入池" },
  { view: "inventory", label: "库存推送", icon: Database, meta: "筛选/推送" },
  { view: "activity", label: "运行日志", icon: Activity, meta: "追踪" },
];

const workspaceViewMeta: Record<
  WorkspaceView,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "Monitor",
    title: "监控概览",
    description: "只看状态，不放操作入口。集中监视本地号池、远端中转、额度窗口和最近异常。",
  },
  connections: {
    eyebrow: "Relay Target",
    title: "中转站管理",
    description: "可添加多个 codexproxy / sub2api / CPA 中转站，每个中转站独立检测、补池、推送。",
  },
  proxies: {
    eyebrow: "Proxy",
    title: "代理管理",
    description: "代理只用于直连 OpenAI 官网/API 的请求，例如库存账号检测、OAuth、API Key 模型读取；中转站接口不走代理。",
  },
  "add-account": {
    eyebrow: "Add Account",
    title: "账号导入",
    description: "批量导入 Refresh Token、Access Token、API Key 或 JSON。",
  },
  inventory: {
    eyebrow: "Pool",
    title: "库存推送",
    description: "筛选、选择、停用和删除本地号池账号，再推送到中转站。",
  },
  activity: {
    eyebrow: "Activity",
    title: "运行日志",
    description: "查看导入、推送、检测、自动补池的执行记录。",
  },
};

function isWorkspaceView(value: string): value is WorkspaceView {
  return workspaceNavItems.some((item) => item.view === value);
}

function getWorkspaceViewFromHash(): WorkspaceView {
  if (typeof window === "undefined") return "overview";
  const hashView = window.location.hash.replace("#", "");
  return isWorkspaceView(hashView) ? hashView : "overview";
}

const integrationFormConfig: Record<
  IntegrationType,
  {
    defaultName: string;
    baseUrlPlaceholder: string;
    authPlaceholder: string;
    helperText: string;
  }
> = {
  sub2api: {
    defaultName: "sub2api",
    baseUrlPlaceholder: "服务器地址，例如 http://127.0.0.1:8000",
    authPlaceholder: "Bearer Token / Admin Token",
    helperText: "sub2api 默认按 Authorization Bearer 鉴权，读取 /api/v1/admin/*。",
  },
  cpa: {
    defaultName: "CPA",
    baseUrlPlaceholder: "服务器地址，例如 http://127.0.0.1:8080",
    authPlaceholder: "Management Key / API Key",
    helperText: "CPA 保留兼容模式，继续走现有 /auth/* 接口。",
  },
  codexproxy: {
    defaultName: "codexproxy",
    baseUrlPlaceholder: "管理地址，例如 https://yycodexapi.yangyangnj.top",
    authPlaceholder: "X-Admin-Key 管理密钥（必填）",
    helperText: "codexproxy 这类管理站必须填写 X-Admin-Key，否则无法读取账号和推送补号。",
  },
};

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!name || !domain) return value;
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskIdentifier(value?: string | null) {
  if (!value) return "-";
  if (value.includes("@")) return maskEmail(value);
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function maskSensitiveText(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => maskEmail(match))
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]+)\b/g, (match) => `${match.slice(0, 6)}…${match.slice(-4)}`)
    .replace(/\b(access_token|refresh_token|api_key|token|key|code)=([^&\s]+)/gi, "$1=***")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (match) => `${match.slice(0, 6)}…${match.slice(-4)}`);
}

function formatTime(value: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function read5hRemaining(summary?: RemoteStatusSummary | null) {
  return (
    summary?.quotaWindows.find((item) => item.label.toLowerCase() === "5h")
      ?.remainingPercent ?? null
  );
}

function isQuotaCritical(value: number | null) {
  return typeof value === "number" && value <= quotaCriticalRemainingPercent;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "未返回";
  return `${Math.round(value * 10) / 10}%`;
}

function formatPlanType(value?: string | null) {
  const text = value?.trim().toLowerCase();
  if (!text) return "未知";
  if (text.includes("plus")) return "Plus";
  if (text.includes("pro")) return "Pro";
  if (text.includes("team")) return "Team";
  if (text.includes("enterprise")) return "Enterprise";
  if (text.includes("free")) return "Free";
  return value?.trim() || "未知";
}

function formatAccountUsability(status: AccountStatus) {
  if (status === "active") return "可用";
  return accountStatusLabels[status];
}

function formatCheckMessage(value?: string | null) {
  if (!value) return "";
  const planMatch = value.match(/套餐\s*([A-Za-z\u4e00-\u9fa5]+)/);
  if (planMatch?.[1]) return `套餐 ${formatPlanType(planMatch[1])}`;
  return value;
}

function translateRemoteStatus(value?: string | null) {
  if (!value) return "未记录";
  return remoteStatusLabels[value.toLowerCase()] ?? value;
}

function translateAutoRunStatus(value?: AutoReplenishRuleRecord["lastStatus"] | null) {
  if (!value) return "待机";
  return autoRunStatusLabels[value] ?? value;
}

function normalizePlanType(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("plus")) return "plus";
  if (normalized.includes("pro")) return "pro";
  if (normalized.includes("free")) return "free";
  return null;
}

function accountMatchesAutoRule(account: AccountViewModel, rule: AutoReplenishRuleRecord) {
  if (account.status !== "active") return false;
  if (rule.credentialFilter === "has_refresh_token" && !account.hasRefreshToken) return false;
  if (rule.credentialFilter === "access_only" && account.hasRefreshToken) return false;
  if (rule.planFilters.length > 0) {
    const normalizedPlan = normalizePlanType(account.planType);
    if (!normalizedPlan || !rule.planFilters.includes(normalizedPlan)) return false;
  }
  return true;
}

type AccountExportFormat = "pool" | "sub2api" | "cpa" | "txt";
type AccountImportMode = "refresh" | "access" | "apiKey" | "oauth" | "json";
type InventoryPlanFilter = "all" | "plus" | "free" | "pro" | "unknown";
type InventoryAvailabilityFilter = "all" | "active" | "unavailable";
type InventoryPushFilter = "all" | "pushed" | "unpushed";
type InventorySortMode = "unpushed_first" | "pushed_first" | "updated_desc";

type Props = {
  data: DashboardData;
};

async function callApi(
  input: RequestInfo,
  init?: RequestInit,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; message?: string }
    | null;
  if (!response.ok || payload?.ok === false) {
    return { ok: false, error: payload?.error ?? "请求失败" };
  }
  return { ok: true, message: payload?.message };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  extra,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  extra: string;
  tone: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[1.65rem] border border-cyan-200/18 bg-slate-950/52 p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-200/45 hover:bg-slate-900/70 hover:shadow-[0_0_46px_rgba(34,211,238,0.18)]">
      <div className={clsx("absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition group-hover:opacity-100", tone)} />
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-2.5 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="h-5 w-5" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">
          live
        </span>
      </div>
      <p className="relative mt-5 text-[11px] uppercase tracking-[0.26em] text-slate-500">
        {label}
      </p>
      <div className="relative mt-2 flex items-end justify-between gap-3">
        <strong className="text-3xl font-semibold tracking-[-0.06em] text-white">
          {value}
        </strong>
        <span className="text-right text-xs text-slate-400">{extra}</span>
      </div>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="data-strip rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-cyan-100">{value}</p>
    </div>
  );
}

function ImportField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function RuleField({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="block rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
      <span className="block text-sm font-medium text-slate-100">{label}</span>
      <span className="mt-1 block text-[11px] leading-5 text-slate-500">{help}</span>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function AutoReplenishPanel({
  integration,
  autoRule,
  autoRuns,
  remoteStatus,
  isPending,
  onSave,
  onRun,
}: {
  integration: IntegrationViewModel;
  autoRule: AutoReplenishRuleRecord;
  autoRuns: AutoReplenishRunRecord[];
  remoteStatus?: RemoteStatusSummary | null;
  isPending: boolean;
  onSave: (formData: FormData) => void;
  onRun: () => void;
}) {
  const recentRuns = autoRuns.slice(0, 3);
  const [groupText, setGroupText] = useState(autoRule.targetGroups.join("\n"));
  const [planGroupText, setPlanGroupText] = useState<Record<PlanGroupKey, string>>(() => ({
    plus: formatGroupText(autoRule.planGroupMap.plus),
    free: formatGroupText(autoRule.planGroupMap.free),
    pro: formatGroupText(autoRule.planGroupMap.pro),
    default: formatGroupText(autoRule.planGroupMap.default),
  }));

  function updatePlanGroupText(key: PlanGroupKey, value: string) {
    setPlanGroupText((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mt-4 rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/38 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/60">
            自动监视
          </p>
          <h4 className="mt-2 text-base font-medium text-white">
            自动补池
          </h4>
          <p className="mt-1 text-xs leading-6 text-slate-400">
            监控 {integration.name} 远端状态，低于阈值时从本地号池自动补推。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRun} disabled={isPending} className={secondaryButton}>
            <RefreshCw className="h-4 w-4" />
            立即检测
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniStatus
          label="正常账号"
          value={
            remoteStatus
              ? `${remoteStatus.normalAccounts}/${remoteStatus.totalAccounts}`
              : "未检测"
          }
        />
        <MiniStatus
          label="5h 剩余"
          value={remoteStatus ? formatPercent(read5hRemaining(remoteStatus)) : "未检测"}
        />
        <MiniStatus
          label="上次检测"
          value={remoteStatus ? formatTime(remoteStatus.updatedAt) : "未检测"}
        />
        <MiniStatus
          label="下次检测"
          value={autoRule.nextRunAt ? formatTime(autoRule.nextRunAt) : "未安排"}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "rounded-full border px-2.5 py-1",
              autoRule.lastStatus
                ? autoRunStatusTone[autoRule.lastStatus]
                : "border-white/10 bg-white/[0.04] text-slate-300",
            )}
          >
            {translateAutoRunStatus(autoRule.lastStatus)}
          </span>
          <span>触发: {autoRule.triggerMode === "all" ? "缺号且额度低" : "缺号或额度低"}</span>
          <span>凭据: {credentialFilterLabels[autoRule.credentialFilter]}</span>
          <span>套餐: {formatPlanFilters(autoRule.planFilters)}</span>
          <span>分组: {formatGroupRouting(autoRule)}</span>
          <span>目标 {autoRule.targetUsableAccounts}</span>
          <span>单次上限 {autoRule.maxAccountsPerRun}</span>
        </div>
        <p className="mt-3 leading-6 text-slate-300">
          {autoRule.lastMessage ?? "还没有自动补池记录。"}
        </p>
      </div>

      <form action={onSave} className="mt-4 space-y-3">
        <div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/[0.045] px-3 py-2.5">
          <p className="text-sm font-medium text-cyan-50">补池规则设置</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            远端中转正常账号低于阈值，或 5h 剩余额度低于阈值时，从本地号池自动补推账号。
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
          <RuleField label="启用自动补池" help="按间隔自动检测并补号。">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={autoRule.enabled}
              className="h-4 w-4 accent-cyan-300"
            />
          </RuleField>
          <RuleField label="触发条件" help="判断远端中转站是否需要补号。">
            <select name="triggerMode" defaultValue={autoRule.triggerMode} className={inputClass}>
              <option value="any">缺号或额度低就补</option>
              <option value="all">缺号且额度低才补</option>
            </select>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              缺号：正常账号数低于阈值；额度低：5h 剩余额度低于阈值。
            </p>
          </RuleField>
          <RuleField label="可用账号范围" help="选择哪类账号推送。">
            <select
              name="credentialFilter"
              defaultValue={autoRule.credentialFilter}
              className={inputClass}
            >
              <option value="all">全部账号</option>
              <option value="has_refresh_token">仅 Refresh Token</option>
              <option value="access_only">仅 Access Token</option>
            </select>
          </RuleField>
          <RuleField label="推号套餐" help="可多选；都不选表示不限套餐。">
            <div className="grid gap-2 text-sm text-slate-300">
              {(["plus", "free", "pro"] as const).map((plan) => (
                <label key={plan} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                  <input
                    type="checkbox"
                    name="planFilters"
                    value={plan}
                    defaultChecked={autoRule.planFilters.includes(plan)}
                    className="h-4 w-4 accent-cyan-300"
                  />
                  {planFilterLabels[plan]}
                </label>
              ))}
            </div>
          </RuleField>
          <RuleField label="检查间隔（分钟）" help="多久检查一次状态。">
            <input
              type="number"
              min={1}
              max={1440}
              name="intervalMinutes"
              defaultValue={autoRule.intervalMinutes}
              className={inputClass}
            />
          </RuleField>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <RuleField label="最低正常账号数" help="低于此数认为缺号。">
            <input
              type="number"
              min={0}
              name="minUsableAccounts"
              defaultValue={autoRule.minUsableAccounts}
              className={inputClass}
            />
          </RuleField>
          <RuleField label="5h 最低剩余额度（%）" help="低于此值认为额度偏低。">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              name="min5hRemainingPercent"
              defaultValue={autoRule.min5hRemainingPercent}
              className={inputClass}
            />
          </RuleField>
          <RuleField label="目标正常账号数" help="补号后保持的数量。">
            <input
              type="number"
              min={0}
              name="targetUsableAccounts"
              defaultValue={autoRule.targetUsableAccounts}
              className={inputClass}
            />
          </RuleField>
          <RuleField label="单次最多补号" help="限制单次推送数量。">
            <input
              type="number"
              min={1}
              name="maxAccountsPerRun"
              defaultValue={autoRule.maxAccountsPerRun}
              className={inputClass}
            />
          </RuleField>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <RuleField label="额度不足补号数" help="额度低时额外补推数。">
            <input
              type="number"
              min={0}
              name="quotaLowPurchaseCount"
              defaultValue={autoRule.quotaLowPurchaseCount}
              className={inputClass}
            />
          </RuleField>
          <RuleField label="额度低时等待恢复" help="正常账号仍够用时不补，等额度自然恢复。">
            <input
              type="checkbox"
              name="respectRateLimitRecovery"
              defaultChecked={autoRule.respectRateLimitRecovery}
              className="h-4 w-4 accent-cyan-300"
            />
          </RuleField>
          <RuleField label="恢复等待（分钟）" help="保留为恢复策略参数；系统会优先判断现有账号是否够用。">
            <input
              type="number"
              min={0}
              max={1440}
              name="rateLimitRecoveryGraceMinutes"
              defaultValue={autoRule.rateLimitRecoveryGraceMinutes}
              className={inputClass}
            />
          </RuleField>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
          <RuleField label="目标分组策略" help="固定分组用于统一推送；套餐分组填写后优先按账号套餐进组。">
            <div className="grid gap-2">
              <div>
                <span className="mb-1 block text-[11px] text-slate-500">
                  固定分组（每行一个，套餐分组全空时使用）
                </span>
                <textarea
                  name="targetGroups"
                  value={groupText}
                  onChange={(event) => setGroupText(event.target.value)}
                  rows={3}
                  placeholder="例如：backup&#10;default-pool"
                  className={inputClass}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {planGroupKeys.map((key) => (
                  <div key={key}>
                    <span className="mb-1 block text-[11px] text-slate-500">
                      {planGroupLabels[key]}
                    </span>
                    <textarea
                      name={`planGroup_${key}`}
                      value={planGroupText[key]}
                      onChange={(event) => updatePlanGroupText(key, event.target.value)}
                      rows={2}
                      placeholder={key === "default" ? "未识别套餐进这里" : `例如：${key}|image`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-5 text-slate-500">
                每个套餐框可用 |、换行或逗号填多个组；例如 pro|image 就进 pro + image。未识别套餐走默认组。
              </p>
            </div>
          </RuleField>
          <RuleField label="推送备注" help="推送新账号时追加到备注，便于区分来源。">
            <textarea
              name="pushNotes"
              defaultValue={autoRule.pushNotes ?? ""}
              rows={4}
              placeholder="例如：号池自动补号"
              className={inputClass}
            />
            <button disabled={isPending} className={clsx(primaryButton, "mt-2 min-h-[52px] w-full")}>
              保存自动补池规则
            </button>
          </RuleField>
        </div>
      </form>

      <div className="mt-4 grid gap-3">
        {recentRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-4 text-sm text-slate-400">
            暂无自动补池检测记录。
          </div>
        ) : (
          recentRuns.map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span
                  className={clsx(
                    "rounded-full border px-2.5 py-1",
                    autoRunStatusTone[run.status],
                  )}
                >
                  {translateAutoRunStatus(run.status)}
                </span>
                <span>{run.triggerSource === "manual" ? "手动" : "定时"}</span>
                <span>{formatTime(run.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{run.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function DashboardClient({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState<InventoryPlanFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<InventoryAvailabilityFilter>("all");
  const [pushFilter, setPushFilter] = useState<InventoryPushFilter>("all");
  const [sortMode, setSortMode] = useState<InventorySortMode>("unpushed_first");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showIntegrationForm, setShowIntegrationForm] = useState(data.integrations.length === 0);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<IntegrationType>("sub2api");
  const [accountImportMode, setAccountImportMode] = useState<AccountImportMode>("refresh");
  const [accountImportText, setAccountImportText] = useState("");
  const [apiModelText, setApiModelText] = useState("");
  const [oauthAuthorizeUrl, setOauthAuthorizeUrl] = useState("");
  const [oauthVerifier, setOauthVerifier] = useState("");
  const [activityLimit, setActivityLimit] = useState(30);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [editingProxy, setEditingProxy] = useState<DashboardData["proxies"][number] | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountViewModel | null>(null);
  const [remoteStatusOverrides, setRemoteStatusOverrides] = useState<Record<string, RemoteStatusSummary>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedIntegrationConfig = integrationFormConfig[selectedPlatform];
  const integrationNameSuggestion = data.integrations.some(
    (item) => item.name === selectedIntegrationConfig.defaultName,
  )
    ? `${selectedIntegrationConfig.defaultName}-${data.integrations.length + 1}`
    : selectedIntegrationConfig.defaultName;
  const remoteStatusByIntegration = {
    ...Object.fromEntries(
      data.integrations.flatMap((item) =>
        item.lastStatusSummary ? [[item.id, item.lastStatusSummary]] : [],
      ),
    ),
    ...remoteStatusOverrides,
  };
  const autoRuleByIntegration = new Map(
    data.autoRules.map((item) => [item.integrationId, item] as const),
  );
  const autoRunsByIntegration = data.autoRuns.reduce<Record<string, AutoReplenishRunRecord[]>>(
    (acc, item) => {
      acc[item.integrationId] = [...(acc[item.integrationId] ?? []), item];
      return acc;
    },
    {},
  );

  const accounts = data.accounts
    .filter((item) => {
      const normalizedPlan = normalizePlanType(item.planType);
      const pushed = (item.pushCount ?? 0) > 0;
      const matchPlan =
        planTypeFilter === "all" ||
        (planTypeFilter === "unknown" ? !normalizedPlan : normalizedPlan === planTypeFilter);
      const matchAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "active" ? item.status === "active" : item.status !== "active");
      const matchPush =
        pushFilter === "all" ||
        (pushFilter === "pushed" ? pushed : !pushed);
      const haystack = [
        item.label,
        item.email,
        item.accountId,
        item.userId,
        item.planType,
        item.tokenPreview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchSearch = !deferredSearch || haystack.includes(deferredSearch);
      return matchPlan && matchAvailability && matchPush && matchSearch;
    })
    .sort((left, right) => {
      const leftPushed = (left.pushCount ?? 0) > 0 ? 1 : 0;
      const rightPushed = (right.pushCount ?? 0) > 0 ? 1 : 0;
      if (sortMode === "unpushed_first" && leftPushed !== rightPushed) return leftPushed - rightPushed;
      if (sortMode === "pushed_first" && leftPushed !== rightPushed) return rightPushed - leftPushed;
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });

  const activeRate = data.summary.totalAccounts
    ? Math.round((data.summary.activeAccounts / data.summary.totalAccounts) * 100)
    : 0;
  const warningRate = data.summary.totalAccounts
    ? Math.round((data.summary.warningAccounts / data.summary.totalAccounts) * 100)
    : 0;
  const enabledAutoRuleCount = data.autoRules.filter((item) => item.enabled).length;
  const remoteSummaries = data.integrations
    .map((item) => remoteStatusByIntegration[item.id])
    .filter((item): item is RemoteStatusSummary => Boolean(item));
  const remoteTotalAccounts = remoteSummaries.reduce(
    (total, item) => total + item.totalAccounts,
    0,
  );
  const remoteNormalAccounts = remoteSummaries.reduce(
    (total, item) => total + item.normalAccounts,
    0,
  );
  const remoteWarningAccounts = remoteSummaries.reduce(
    (total, item) => total + item.warningAccounts,
    0,
  );
  const remoteHealthRate = remoteTotalAccounts
    ? Math.round((remoteNormalAccounts / remoteTotalAccounts) * 100)
    : 0;
  const min5hRemaining = remoteSummaries.reduce<number | null>((minimum, item) => {
    const remaining = read5hRemaining(item);
    if (typeof remaining !== "number" || Number.isNaN(remaining)) return minimum;
    return minimum === null ? remaining : Math.min(minimum, remaining);
  }, null);
  const recentErrorLogs = data.logs.filter((item) => item.status === "error").slice(0, 4);
  const visibleLogs = data.logs.slice(0, activityLimit);
  const activePoolAccounts = data.accounts.filter((item) => item.status === "active");
  const refreshTokenAccounts = activePoolAccounts.filter((item) => item.hasRefreshToken);
  const accessOnlyAccounts = activePoolAccounts.filter((item) => !item.hasRefreshToken);
  const selectedAccounts = data.accounts.filter((item) => selectedIds.includes(item.id));
  const selectedActiveAccounts = selectedAccounts.filter((item) => item.status === "active");
  const allVisibleSelected = accounts.length > 0 && accounts.every((item) => selectedIds.includes(item.id));
  const importLineCount = accountImportText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  const relayReplenishPlans = data.integrations.map((integration) => {
    const remoteStatus = remoteStatusByIntegration[integration.id];
    const autoRule = autoRuleByIntegration.get(integration.id);
    const matchedPoolAccounts = autoRule
      ? data.accounts.filter((account) => accountMatchesAutoRule(account, autoRule))
      : activePoolAccounts;
    const remaining5h = read5hRemaining(remoteStatus);
    const normalLow = Boolean(
      remoteStatus && autoRule && remoteStatus.normalAccounts < autoRule.minUsableAccounts,
    );
    const quotaLow =
      typeof remaining5h === "number" && autoRule
        ? remaining5h < autoRule.min5hRemainingPercent
        : false;
    const quotaCritical = isQuotaCritical(remaining5h);
    const shouldTrigger = Boolean(
      autoRule &&
        remoteStatus &&
        (quotaCritical ||
          (autoRule.triggerMode === "all" ? normalLow && quotaLow : normalLow || quotaLow)),
    );
    const desiredByNormal =
      normalLow && remoteStatus && autoRule
        ? Math.max(autoRule.targetUsableAccounts - remoteStatus.normalAccounts, 0)
        : 0;
    const desiredByQuota =
      quotaLow && autoRule && (!autoRule.respectRateLimitRecovery || normalLow || quotaCritical)
        ? autoRule.quotaLowPurchaseCount
        : 0;
    const shortage = shouldTrigger ? desiredByNormal : 0;
    const warningAccounts = remoteStatus?.warningAccounts ?? 0;
    const desiredPushCount = shouldTrigger
      ? Math.min(Math.max(desiredByNormal, desiredByQuota, 0), autoRule?.maxAccountsPerRun ?? 0)
      : 0;
    const recommendedPushCount = Math.min(matchedPoolAccounts.length, desiredPushCount);

    return {
      integration,
      autoRule,
      remoteStatus,
      matchedPoolCount: matchedPoolAccounts.length,
      normalLow,
      quotaCritical,
      shortage,
      quotaLow,
      warningAccounts,
      remaining5h,
      recommendedPushCount,
    };
  });
  const relayNeedPushCount = relayReplenishPlans.filter(
    (item) => item.recommendedPushCount > 0 || !item.remoteStatus,
  ).length;
  const recommendedPushTotal = relayReplenishPlans.reduce(
    (total, item) => total + item.recommendedPushCount,
    0,
  );
  const [activeView, setActiveView] = useState<WorkspaceView>(() => getWorkspaceViewFromHash());
  const activeViewRef = useRef<WorkspaceView>(activeView);
  const activeViewMeta = workspaceViewMeta[activeView];

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    function syncFromHash() {
      setActiveView(getWorkspaceViewFromHash());
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (activeView !== "activity") return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeView, router]);

  function toggleSelection(accountId: string) {
    setSelectedIds((current) =>
      current.includes(accountId)
        ? current.filter((item) => item !== accountId)
        : [...current, accountId],
    );
  }

  function selectAllVisible() {
    setSelectedIds(accounts.map((item) => item.id));
  }

  function clearVisibleSelection() {
    const visibleIds = new Set(accounts.map((item) => item.id));
    setSelectedIds((current) => current.filter((item) => !visibleIds.has(item)));
  }

  function selectActiveVisible() {
    setSelectedIds(accounts.filter((item) => item.status === "active").map((item) => item.id));
  }

  function changeWorkspaceView(view: WorkspaceView) {
    setActiveView(view);
    if (typeof window === "undefined") return;

    const hash = `#${view}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function runTask(task: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const viewBeforeTask = activeViewRef.current;
      setNotice(null);
      const result = await task();
      setNotice(
        result.ok
          ? { type: "success", text: result.message ?? "操作成功" }
          : { type: "error", text: result.error ?? "操作失败" },
      );
      if (typeof window !== "undefined") {
        const hash = `#${viewBeforeTask}`;
        if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
      }
      setActiveView(viewBeforeTask);
      router.refresh();
    });
  }

  async function exportAccounts(format: AccountExportFormat) {
    const ids = selectedIds.length > 0 ? selectedIds : accounts.map((item) => item.id);
    if (ids.length === 0) {
      setNotice({ type: "error", text: "没有可导出的账号" });
      return;
    }

    const query = new URLSearchParams({ format, ids: ids.join(",") });
    const response = await fetch(`/api/accounts/export?${query.toString()}`);
    if (!response.ok) {
      setNotice({ type: "error", text: "导出失败" });
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `account-pool-${format}-${new Date().toISOString().slice(0, 10)}.${format === "txt" ? "txt" : "json"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", text: `已导出 ${ids.length} 个账号` });
  }

  async function exportOneAccount(format: AccountExportFormat, accountId: string) {
    const query = new URLSearchParams({ format, ids: accountId });
    const response = await fetch(`/api/accounts/export?${query.toString()}`);
    if (!response.ok) {
      setNotice({ type: "error", text: "导出失败" });
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `account-${accountId.slice(0, 8)}-${format}.${format === "txt" ? "txt" : "json"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", text: "账号已导出" });
  }

  function submitIntegration(formData: FormData) {
    const type = String(formData.get("type") || selectedPlatform) as IntegrationType;
    const authPreset =
      type === "codexproxy"
        ? { authMode: "header" as const, authHeaderName: "X-Admin-Key" }
        : { authMode: "bearer" as const, authHeaderName: "" };

    const payload = {
      name: String(formData.get("name") || ""),
      type,
      baseUrl: String(formData.get("baseUrl") || ""),
      authMode: authPreset.authMode,
      authValue: String(formData.get("authValue") || ""),
      authHeaderName: authPreset.authHeaderName,
      notes: String(formData.get("notes") || ""),
      testAfterCreate: true,
    };

    runTask(async () => {
      const result = await callApi("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (result.ok) setShowIntegrationForm(false);
      return result;
    });
  }

  function submitProxy(formData: FormData) {
    runTask(() =>
      callApi("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          url: String(formData.get("url") || ""),
          enabled: formData.get("enabled") !== "off",
        }),
      }),
    );
  }

  function updateProxyState(id: string, enabled: boolean) {
    runTask(() =>
      callApi(`/api/proxies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }),
    );
  }

  function saveProxyEdit(formData: FormData) {
    if (!editingProxy) return;
    runTask(async () => {
      const result = await callApi(`/api/proxies/${editingProxy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          url: String(formData.get("url") || ""),
          enabled: formData.get("enabled") === "on",
        }),
      });
      if (result.ok) setEditingProxy(null);
      return result;
    });
  }

  function testProxy(id: string) {
    runTask(() => callApi(`/api/proxies/${id}/test`, { method: "POST" }));
  }

  function testAllProxies() {
    runTask(async () => {
      if (data.proxies.length === 0) return { ok: false, error: "没有可测试的代理" };
      const results = await Promise.all(
        data.proxies.map((proxy) => callApi(`/api/proxies/${proxy.id}/test`, { method: "POST" })),
      );
      const successCount = results.filter((item) => item.ok).length;
      const errorCount = results.length - successCount;
      return {
        ok: successCount > 0,
        error: `已测试 ${results.length} 个，可用 ${successCount} 个，异常 ${errorCount} 个`,
        message: `已测试 ${results.length} 个，可用 ${successCount} 个，异常 ${errorCount} 个`,
      };
    });
  }

  function disableFailedProxies() {
    runTask(async () => {
      const failed = data.proxies.filter((proxy) => proxy.lastTestStatus === "error");
      if (failed.length === 0) return { ok: false, error: "没有异常代理需要停用" };
      const results = await Promise.all(
        failed.map((proxy) =>
          callApi(`/api/proxies/${proxy.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false }),
          }),
        ),
      );
      const count = results.filter((item) => item.ok).length;
      return {
        ok: count > 0,
        error: "停用异常代理失败",
        message: `已停用 ${count} 个异常代理`,
      };
    });
  }

  function deleteProxy(id: string) {
    runTask(() => callApi(`/api/proxies/${id}`, { method: "DELETE" }));
  }

  function deleteFailedProxies() {
    const failed = data.proxies.filter((proxy) => proxy.lastTestStatus === "error");
    if (failed.length === 0) {
      setNotice({ type: "error", text: "没有异常代理可清理" });
      return;
    }
    if (!window.confirm(`确认删除 ${failed.length} 个异常代理？`)) return;
    runTask(async () => {
      const results = await Promise.all(
        failed.map((proxy) => callApi(`/api/proxies/${proxy.id}`, { method: "DELETE" })),
      );
      const count = results.filter((item) => item.ok).length;
      return {
        ok: count > 0,
        error: "删除异常代理失败",
        message: `已删除 ${count} 个异常代理`,
      };
    });
  }

  function updateProxyPoolEnabled(enabled: boolean) {
    runTask(() =>
      callApi("/api/proxies/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }),
    );
  }

  function saveAccountEdit(formData: FormData) {
    if (!editingAccount) return;
    runTask(async () => {
      const result = await callApi(`/api/accounts/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: String(formData.get("label") || ""),
          planType: String(formData.get("planType") || ""),
          status: String(formData.get("status") || editingAccount.status),
          notes: String(formData.get("notes") || ""),
        }),
      });
      if (result.ok) setEditingAccount(null);
      return result;
    });
  }

  function deleteAccountWithConfirm(account: AccountViewModel) {
    const name = account.label || account.email || account.id.slice(0, 8);
    if (!window.confirm(`确认删除账号 ${maskSensitiveText(name)}？`)) return;
    runTask(() => callApi(`/api/accounts/${account.id}`, { method: "DELETE" }));
  }

  function deleteSelectedAccounts() {
    if (selectedIds.length === 0) {
      setNotice({ type: "error", text: "先勾选要删除的账号" });
      return;
    }
    if (!window.confirm(`确认删除已选 ${selectedIds.length} 个账号？`)) return;
    runTask(async () => {
      const result = await callApi("/api/accounts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: selectedIds }),
      });
      if (result.ok) setSelectedIds([]);
      return result;
    });
  }

  function updateSelectedAccountStatus(status: "active" | "disabled") {
    if (selectedIds.length === 0) {
      setNotice({ type: "error", text: "先勾选账号" });
      return;
    }
    const action = status === "active" ? "启用" : "停用";
    if (!window.confirm(`确认${action}已选 ${selectedIds.length} 个账号？`)) return;
    runTask(() =>
      callApi("/api/accounts/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: selectedIds, status }),
      }),
    );
  }

  function refreshRemoteStatus(integrationId: string) {
    runTask(async () => {
      const response = await fetch(`/api/integrations/${integrationId}/status`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; summary?: RemoteStatusSummary }
        | null;
      if (!response.ok || payload?.ok === false || !payload?.summary) {
        return { ok: false, error: payload?.error ?? "读取远端状态失败" };
      }
      setRemoteStatusOverrides((current) => ({
        ...current,
        [integrationId]: payload.summary as RemoteStatusSummary,
      }));
      return { ok: true, message: `已读取远端账号 ${payload.summary.totalAccounts} 个` };
    });
  }

  function saveAutoReplenishRule(integrationId: string, formData: FormData) {
    const payload = {
      enabled: formData.get("enabled") === "on",
      triggerMode: String(formData.get("triggerMode") || "any"),
      credentialFilter: String(formData.get("credentialFilter") || "all"),
      planFilters: formData.getAll("planFilters").map((item) => String(item)),
      targetGroups: parseGroupText(formData.get("targetGroups")),
      planGroupMap: {
        plus: parseGroupText(formData.get("planGroup_plus")),
        free: parseGroupText(formData.get("planGroup_free")),
        pro: parseGroupText(formData.get("planGroup_pro")),
        default: parseGroupText(formData.get("planGroup_default")),
      },
      cloneAccountId: "",
      pushNotes: String(formData.get("pushNotes") || ""),
      intervalMinutes: Number(formData.get("intervalMinutes") || 5),
      minUsableAccounts: Number(formData.get("minUsableAccounts") || 0),
      min5hRemainingPercent: Number(formData.get("min5hRemainingPercent") || 0),
      targetUsableAccounts: Number(formData.get("targetUsableAccounts") || 0),
      quotaLowPurchaseCount: Number(formData.get("quotaLowPurchaseCount") || 0),
      maxAccountsPerRun: Number(formData.get("maxAccountsPerRun") || 1),
      respectRateLimitRecovery: formData.get("respectRateLimitRecovery") === "on",
      rateLimitRecoveryGraceMinutes: Number(
        formData.get("rateLimitRecoveryGraceMinutes") || 0,
      ),
    };

    runTask(() =>
      callApi(`/api/integrations/${integrationId}/auto-replenish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  }

  function runAutoReplenish(integrationId: string) {
    runTask(() =>
      callApi(`/api/integrations/${integrationId}/auto-replenish/run`, {
        method: "POST",
      }),
    );
  }

  function clearLogs(keepLatest = 0) {
    runTask(() =>
      callApi(`/api/logs?keepLatest=${keepLatest}`, {
        method: "DELETE",
      }),
    );
  }

  function logout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    });
  }

  function changeAdminPassword(formData: FormData) {
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      setNotice({ type: "error", text: "两次新密码不一致" });
      return;
    }

    runTask(async () => {
      const result = await callApi("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(formData.get("currentPassword") || ""),
          newPassword,
        }),
      });
      if (result.ok) setShowPasswordForm(false);
      return result;
    });
  }

  async function readFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const readableFiles = Array.from(files).filter((file) => /\.(txt|json)$/i.test(file.name));
    const chunks = await Promise.all(
      readableFiles.map(async (file) => {
        const text = await file.text();
        return {
          name: file.name,
          isJson: /\.json$/i.test(file.name),
          text: text.trim(),
        };
      }),
    );
    if (chunks.length === 0) {
      setNotice({ type: "error", text: "请选择 .txt 或 .json 文件" });
      return;
    }
    const hasJson = chunks.some((file) => file.isJson);
    if (hasJson) setAccountImportMode("json");
    setAccountImportText((current) =>
      [current, ...chunks.map((file) => file.text)].filter(Boolean).join("\n"),
    );
    setNotice({
      type: "success",
      text: `已读取 ${chunks.length} 个文件，其中 JSON ${chunks.filter((file) => file.isJson).length} 个`,
    });
  }

  function submitManualAccount(formData: FormData) {
    const bulkText = accountImportText || String(formData.get("bulkText") || "");
    const basePayload = {
      label: String(formData.get("label") || ""),
      proxyUrl: String(formData.get("proxyUrl") || ""),
      baseUrl: String(formData.get("baseUrl") || ""),
      models: apiModelText,
    };

    runTask(async () => {
      let payload: Record<string, unknown> = bulkText.trim()
        ? {
            importMode: accountImportMode,
            bulkText,
            ...basePayload,
          }
        : {
            ...basePayload,
            email: String(formData.get("email") || ""),
            accountId: String(formData.get("accountId") || ""),
            userId: String(formData.get("userId") || ""),
            planType: String(formData.get("planType") || ""),
            accessToken: String(formData.get("accessToken") || ""),
            refreshToken: String(formData.get("refreshToken") || ""),
            status: String(formData.get("status") || "active"),
            notes: String(formData.get("notes") || ""),
            models: apiModelText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
          };

      if (accountImportMode === "oauth" && bulkText.trim() && oauthVerifier) {
        const tokenResponse = await fetch("/api/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: bulkText, verifier: oauthVerifier }),
        });
        const tokenPayload = (await tokenResponse.json().catch(() => null)) as
          | { ok?: boolean; error?: string; accessToken?: string; refreshToken?: string }
          | null;
        if (!tokenResponse.ok || tokenPayload?.ok === false || !tokenPayload?.accessToken) {
          return { ok: false, error: tokenPayload?.error ?? "OAuth 换取 token 失败" };
        }
        payload = {
          ...basePayload,
          importMode: "access",
          bulkText: tokenPayload.accessToken,
          refreshToken: tokenPayload.refreshToken ?? "",
          notes: "OAuth 授权导入",
        };
      }

      const result = await callApi("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (result.ok) {
        setShowAccountForm(false);
        setAccountImportText("");
        setApiModelText("");
        setOauthAuthorizeUrl("");
        setOauthVerifier("");
      }
      return result;
    });
  }

  function generateOAuthLink(formData: FormData) {
    runTask(async () => {
      const result = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: String(formData.get("label") || ""),
          proxyUrl: String(formData.get("proxyUrl") || ""),
        }),
      });
      const payload = (await result.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string; authorizeUrl?: string; verifier?: string }
        | null;
      if (!result.ok || payload?.ok === false || !payload?.authorizeUrl) {
        return { ok: false, error: payload?.error ?? "生成授权链接失败" };
      }
      setOauthAuthorizeUrl(payload.authorizeUrl);
      setOauthVerifier(payload.verifier ?? "");
      window.open(payload.authorizeUrl, "_blank", "noopener,noreferrer");
      return { ok: true, message: payload.message ?? "授权链接已生成" };
    });
  }

  function fetchOpenAIModels(formData: FormData) {
    runTask(async () => {
      const result = await fetch("/api/openai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: accountImportText.trim(),
          baseUrl: String(formData.get("baseUrl") || ""),
        }),
      });
      const payload = (await result.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string; models?: string[] }
        | null;
      if (!result.ok || payload?.ok === false) {
        return { ok: false, error: payload?.error ?? "读取模型失败" };
      }
      setApiModelText((payload?.models ?? []).join("\n"));
      return { ok: true, message: payload?.message ?? "模型已读取" };
    });
  }

  return (
    <div className="cyber-shell min-h-screen text-slate-100">
      <div className="min-h-screen w-full lg:pl-[260px]">
        <nav className="command-bar z-30 flex flex-col gap-5 rounded-none border-x-0 border-t-0 px-4 py-5 text-sm text-slate-200 lg:fixed lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[260px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-cyan-200/14">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.20)]">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">
                  RefillOps
                </p>
                <p className="text-sm font-medium text-white">杨洋的补号系统</p>
              </div>
            </div>

            <div className="grid gap-2">
              {workspaceNavItems.map(({ view, label, icon: Icon, meta }) => {
                const active = activeView === view;
                return (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeWorkspaceView(view)}
                    className={clsx(
                      "group flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition",
                      active
                        ? "border-cyan-200/35 bg-cyan-300/14 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.13)]"
                        : "border-transparent text-slate-300 hover:border-cyan-200/18 hover:bg-cyan-300/10 hover:text-cyan-50",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        className={clsx(
                          "h-4 w-4 transition",
                          active ? "text-cyan-100" : "text-cyan-200/70 group-hover:text-cyan-100",
                        )}
                      />
                      <span>{label}</span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {meta}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-h-[116px] rounded-[1.35rem] border border-cyan-200/14 bg-slate-950/34 p-3 text-xs">
              <p className="font-mono uppercase tracking-[0.24em] text-cyan-200/60">
                当前页面
              </p>
              <p className="mt-2 text-sm font-medium text-white">{activeViewMeta.title}</p>
              <p className="mt-2 line-clamp-3 leading-5 text-slate-400">{activeViewMeta.description}</p>
            </div>

            <div className="rounded-[1.35rem] border border-cyan-200/14 bg-slate-950/34 p-3 text-xs">
              <p className="font-mono uppercase tracking-[0.24em] text-cyan-200/60">
                补号流程
              </p>
              <div className="mt-3 grid gap-2">
                {["导入账号入池", "检测中转状态", "选择可用账号", "推送补充中转"].map((item, index) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-slate-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10 font-mono text-[10px] text-cyan-100">
                      {index + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto grid gap-2 text-xs">
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100">
              <Network className="h-3.5 w-3.5" /> {data.summary.totalAccounts} 个账号
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-blue-100">
              <PlugZap className="h-3.5 w-3.5" /> {data.summary.integrationCount} 个中转站
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100">
              <Network className="h-3.5 w-3.5" /> {data.summary.proxyCount} 个代理
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-amber-100">
              <Activity className="h-3.5 w-3.5" /> 风险 {warningRate}%
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-emerald-100">
              <ShieldCheck className="h-3.5 w-3.5" /> 待补 {relayNeedPushCount} 个中转
            </span>
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
            >
              <KeyRound className="h-3.5 w-3.5" /> 修改密码
            </button>
            <button
              type="button"
              onClick={logout}
              className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-rose-100 transition hover:border-rose-300/30 hover:bg-rose-400/10"
            >
              <LogOut className="h-3.5 w-3.5" /> 退出登录
            </button>
          </div>
        </nav>

        <div className="min-w-0 px-4 py-5 sm:px-6 lg:px-7 lg:py-7">
          <header className="mx-auto flex max-w-[1280px] flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={sectionTitleClass}>{activeViewMeta.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-white">
                {activeViewMeta.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {activeViewMeta.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100">
                <PlugZap className="h-3.5 w-3.5" /> {data.summary.integrationCount} 个中转
              </span>
              <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-emerald-100">
                <ShieldCheck className="h-3.5 w-3.5" /> {data.summary.activeAccounts} 个可用
              </span>
              <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-amber-100">
                <Activity className="h-3.5 w-3.5" /> 风险 {warningRate}%
              </span>
            </div>
          </header>

          {notice ? (
            <div
              className={clsx(
                "mx-auto mt-5 max-w-[1280px] rounded-[1.3rem] border px-4 py-3 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur",
                notice.type === "success"
                  ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                  : "border-rose-300/25 bg-rose-400/12 text-rose-100",
              )}
            >
              {notice.text}
            </div>
          ) : null}

          <main className="mx-auto mt-5 max-w-[1280px] space-y-5">
            {activeView === "overview" ? (
              <section id="overview" className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={ShieldCheck}
                    label="本地可用"
                    value={`${data.summary.activeAccounts}/${data.summary.totalAccounts}`}
                    extra={`健康度 ${activeRate}%`}
                    tone="bg-cyan-400/25"
                  />
                  <MetricCard
                    icon={PlugZap}
                    label="远端正常"
                    value={
                      remoteTotalAccounts
                        ? `${remoteNormalAccounts}/${remoteTotalAccounts}`
                        : "未检测"
                    }
                    extra={`${remoteSummaries.length}/${data.summary.integrationCount} 个中转已检测`}
                    tone="bg-blue-400/25"
                  />
                  <MetricCard
                    icon={AlertCircle}
                    label="异常告警"
                    value={data.summary.warningAccounts + remoteWarningAccounts}
                    extra={`本地 ${data.summary.warningAccounts} · 远端 ${remoteWarningAccounts}`}
                    tone="bg-amber-400/25"
                  />
                  <MetricCard
                    icon={Activity}
                    label="5h 最低余额"
                    value={formatPercent(min5hRemaining)}
                    extra={`远端健康度 ${remoteHealthRate}%`}
                    tone="bg-teal-400/25"
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                  <section className={panelClass}>
                    <div className="mb-4">
                      <p className={sectionTitleClass}>中转监视</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">中转监视矩阵</h2>
                      <p className="mt-2 text-sm text-slate-400">
                        这里只显示检测结果。连接配置、自动补池和手动检测放到“中转管理”页。
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {data.integrations.length === 0 ? (
                        <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                          还没有配置中转站。
                        </div>
                      ) : null}
                      {data.integrations.map((integration) => {
                        const remoteStatus = remoteStatusByIntegration[integration.id];
                        return (
                          <article
                            key={integration.id}
                            className="rounded-2xl border border-cyan-200/12 bg-slate-950/34 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-white">{integration.name}</p>
                                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-200/55">
                                  {integration.type}
                                </p>
                              </div>
                              <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-100">
                                {remoteStatus
                                  ? `${remoteStatus.normalAccounts}/${remoteStatus.totalAccounts} 正常`
                                  : "未检测"}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-4">
                              <MiniStatus
                                label="连接"
                                value={
                                  integration.lastTestStatus === "success"
                                    ? "已连通"
                                    : integration.lastTestStatus === "error"
                                      ? "异常"
                                      : "未测试"
                                }
                              />
                              <MiniStatus
                                label="延迟"
                                value={remoteStatus ? `${remoteStatus.latencyMs}ms` : "未检测"}
                              />
                              <MiniStatus
                                label="5h 剩余"
                                value={remoteStatus ? formatPercent(read5hRemaining(remoteStatus)) : "未检测"}
                              />
                              <MiniStatus
                                label="上次检测"
                                value={remoteStatus ? formatTime(remoteStatus.updatedAt) : "未检测"}
                              />
                            </div>
                            {remoteStatus ? (
                              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                                  style={{
                                    width: `${remoteStatus.totalAccounts ? Math.round((remoteStatus.normalAccounts / remoteStatus.totalAccounts) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <div className="grid gap-5">
                    <section className={panelClass}>
                      <p className={sectionTitleClass}>自动补池监视</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">自动补池状态</h2>
                      <div className="mt-4 grid gap-3">
                        <MiniStatus label="启用规则" value={`${enabledAutoRuleCount}/${data.autoRules.length}`} />
                        <MiniStatus label="已检测中转" value={`${remoteSummaries.length}/${data.summary.integrationCount}`} />
                        <MiniStatus label="远端异常" value={remoteWarningAccounts} />
                        <MiniStatus label="待补中转" value={relayNeedPushCount} />
                      </div>
                      <div className="mt-4 grid gap-3">
                        {data.autoRules.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-4 text-sm text-slate-400">
                            还没有自动补池规则。
                          </div>
                        ) : null}
                        {data.autoRules.slice(0, 3).map((rule) => (
                          <div
                            key={rule.id}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={clsx(
                                  "rounded-full border px-2.5 py-1 text-xs",
                                  rule.enabled
                                    ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                                    : "border-white/10 bg-white/[0.04] text-slate-300",
                                )}
                              >
                                {rule.enabled ? "启用" : "停用"}
                              </span>
                              <span className="text-xs text-slate-500">
                                下次: {rule.nextRunAt ? formatTime(rule.nextRunAt) : "未安排"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-300">
                              目标 {rule.targetUsableAccounts} · 单次 {rule.maxAccountsPerRun} · {translateAutoRunStatus(rule.lastStatus)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className={panelClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={sectionTitleClass}>最近告警</p>
                          <h2 className="mt-2 text-xl font-semibold text-white">最近异常</h2>
                        </div>
                        {recentErrorLogs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => clearLogs()}
                            className="rounded-full border border-rose-300/25 bg-rose-400/12 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-400/18"
                          >
                            清理
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3">
                        {recentErrorLogs.length === 0 ? (
                          <div className="rounded-2xl border border-emerald-300/18 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
                            当前没有错误日志。
                          </div>
                        ) : null}
                        {recentErrorLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-rose-50">{maskSensitiveText(log.title)}</p>
                              <span className="font-mono text-xs text-rose-100/70">
                                {formatTime(log.createdAt)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-rose-100/75">{maskSensitiveText(log.detail)}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </section>
            ) : null}

            {activeView === "connections" ? (
              <section id="connections" className={panelClass}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Relay Target</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    中转站列表
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    支持多个中转站。每个中转站独立检测远端账号状态、配置自动补池、接收本地号池推送。
                  </p>
                </div>
                <button
                  onClick={() => setShowIntegrationForm((value) => !value)}
                  className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3.5 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/16"
                >
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
                    {showIntegrationForm ? "收起新增" : `新增中转站 · 已有 ${data.integrations.length} 个`}
                  </span>
                </button>
              </div>

              {showIntegrationForm ? (
                <form
                  action={submitIntegration}
                  className="mb-5 space-y-3 rounded-[1.45rem] border border-white/10 bg-zinc-950/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <select
                    name="type"
                    value={selectedPlatform}
                    onChange={(event) => setSelectedPlatform(event.target.value as IntegrationType)}
                    className={inputClass}
                  >
                    <option value="sub2api">sub2api</option>
                    <option value="cpa">CPA</option>
                    <option value="codexproxy">codexproxy（codex2api 项目）</option>
                  </select>
                  <input
                    key={`integration-name-${selectedPlatform}`}
                    name="name"
                    placeholder="连接名称，可不填"
                    defaultValue={integrationNameSuggestion}
                    className={inputClass}
                  />
                  <input
                    name="baseUrl"
                    placeholder={selectedIntegrationConfig.baseUrlPlaceholder}
                    className={inputClass}
                  />
                  <input
                    name="authValue"
                    placeholder={selectedIntegrationConfig.authPlaceholder}
                    required={selectedPlatform === "codexproxy"}
                    type="password"
                    className={inputClass}
                  />
                  <p className="px-1 text-xs leading-6 text-slate-500">
                    {selectedIntegrationConfig.helperText}
                  </p>
                  <textarea name="notes" placeholder="备注，可不填" rows={2} className={inputClass} />
                  <button disabled={isPending} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-950 transition hover:bg-cyan-100 disabled:opacity-60">
                    保存连接
                  </button>
                </form>
              ) : null}

              <div className="space-y-3">
                {data.integrations.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                    先添加一个中转站连接。后续可以继续新增多个中转站，每个中转独立显示连通、账号状态、自动补池规则。
                  </div>
                ) : null}

                {data.integrations.map((integration) => {
                  const remoteStatus = remoteStatusByIntegration[integration.id];
                  const autoRule = autoRuleByIntegration.get(integration.id);
                  const autoRuns = autoRunsByIntegration[integration.id] ?? [];
                  const normalPercent = remoteStatus?.totalAccounts
                    ? Math.round((remoteStatus.normalAccounts / remoteStatus.totalAccounts) * 100)
                    : 0;
                  return (
                  <article
                    key={integration.id}
                    className="group rounded-[1.45rem] border border-cyan-200/12 bg-slate-950/36 p-4 transition hover:border-cyan-200/25 hover:bg-slate-900/46"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium tracking-[-0.035em] text-white">
                          {integration.name}
                        </h3>
                        <p className="mt-1 font-mono text-xs uppercase tracking-[0.22em] text-cyan-200/55">
                          {integration.type}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          "rounded-full border px-2.5 py-1 text-[11px]",
                          integration.lastTestStatus === "success"
                            ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                            : integration.lastTestStatus === "error"
                              ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
                              : "border-white/10 bg-white/5 text-slate-300",
                        )}
                      >
                        {integration.lastTestStatus === "success"
                          ? "已连通"
                          : integration.lastTestStatus === "error"
                            ? "异常"
                            : "未测试"}
                      </span>
                    </div>
                    <p className="mt-3 break-all font-mono text-xs leading-6 text-slate-300">
                      {maskSensitiveText(integration.baseUrl)}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500">
                      <p>鉴权: {integration.authMode}</p>
                      <p>凭据: {maskSensitiveText(integration.authPreview) || "未配置"}</p>
                      <p>连通结果: {maskSensitiveText(integration.lastTestMessage) || "未记录"}</p>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        disabled={isPending}
                        onClick={() =>
                          runTask(() =>
                            callApi(`/api/integrations/${integration.id}/test`, {
                              method: "POST",
                            }),
                          )
                        }
                        className={secondaryButton}
                      >
                        测试
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => refreshRemoteStatus(integration.id)}
                        className={secondaryButton}
                      >
                        刷新状态
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() =>
                          runTask(() =>
                            callApi(`/api/integrations/${integration.id}`, {
                              method: "DELETE",
                            }),
                          )
                        }
                        className={dangerButton}
                      >
                        删除
                      </button>
                    </div>
                    {remoteStatus ? (
                      <div className="mt-4 rounded-[1.2rem] border border-cyan-200/12 bg-white/[0.025] p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-slate-500">服务状态</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{remoteStatus.totalAccounts} 个账号</p>
                            <p className="mt-1 text-xs text-slate-500">{remoteStatus.latencyMs}ms · {formatTime(remoteStatus.updatedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">正常账号</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{remoteStatus.normalAccounts}/{remoteStatus.totalAccounts}</p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${normalPercent}%` }} />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">额度概览</p>
                            <p className="mt-1 text-2xl font-semibold text-white">
                              {remoteStatus.quotaWindows[0]?.usedPercent ?? "未刷新"}{typeof remoteStatus.quotaWindows[0]?.usedPercent === "number" ? "%" : ""}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">5h 使用率</p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                              <span>状态分布</span>
                              <span>{remoteStatus.warningAccounts} 异常</span>
                            </div>
                            {Object.entries(remoteStatus.statusDistribution).map(([key, value]) => (
                              <div key={key} className="mb-2 last:mb-0">
                                <div className="mb-1 flex justify-between text-xs text-slate-300"><span>{translateRemoteStatus(key)}</span><span>{value}</span></div>
                                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${remoteStatus.totalAccounts ? Math.round((value / remoteStatus.totalAccounts) * 100) : 0}%` }} /></div>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                            <div className="mb-2 text-xs text-slate-500">额度窗口</div>
                            {remoteStatus.quotaWindows.map((window) => (
                              <div key={window.label} className="mb-2 last:mb-0">
                                <div className="mb-1 flex justify-between text-xs text-slate-300"><span>{window.label}</span><span>{window.usedPercent ?? "未返回"}{typeof window.usedPercent === "number" ? "%" : ""}</span></div>
                                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${window.usedPercent ?? 0}%` }} /></div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
                          <p>平台/套餐：{Object.entries(remoteStatus.platformDistribution).map(([key, value]) => `${key} ${value}`).join(" / ")}</p>
                          <p>类型分布：{Object.entries(remoteStatus.typeDistribution).map(([key, value]) => `${key} ${value}`).join(" / ")}</p>
                        </div>
                      </div>
                    ) : null}
                    {selectedIds.length > 0 ? (
                      <button
                        disabled={isPending}
                        onClick={() =>
                          runTask(() =>
                            callApi("/api/accounts/push", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                integrationId: integration.id,
                                accountIds: selectedIds,
                                targetGroups: autoRule?.targetGroups ?? [],
                                planGroupMap: autoRule?.planGroupMap ?? {},
                                pushNotes: autoRule?.pushNotes ?? "",
                              }),
                            }),
                          )
                        }
                        className={clsx(primaryButton, "mt-3 w-full")}
                      >
                        <CloudUpload className="h-4 w-4" />
                        推送已选 {selectedIds.length} 个账号
                      </button>
                    ) : null}
                    {autoRule ? (
                      <AutoReplenishPanel
                        key={`${integration.id}-${autoRule.updatedAt ?? "new"}`}
                        integration={integration}
                        autoRule={autoRule}
                        autoRuns={autoRuns}
                        remoteStatus={remoteStatus}
                        isPending={isPending}
                        onSave={(formData) => saveAutoReplenishRule(integration.id, formData)}
                        onRun={() => runAutoReplenish(integration.id)}
                      />
                    ) : null}
                  </article>
                  );
                })}
              </div>
              </section>
            ) : null}

            {activeView === "proxies" ? (
              <section id="proxies" className={panelClass}>
                <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className={sectionTitleClass}>Proxy Pool</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                      代理管理
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      启用代理池后，直连 OpenAI 的库存检测、OAuth、API Key 请求会按启用代理轮询；中转站检测和推送不走代理。
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MiniStatus label="总代理" value={data.proxies.length} />
                      <MiniStatus label="启用" value={data.proxies.filter((item) => item.enabled).length} />
                      <MiniStatus label="轮询" value={data.proxyPoolEnabled ? "已启用" : "已停用"} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        disabled={isPending || (data.proxies.length === 0 && !data.proxyPoolEnabled)}
                        onClick={() => updateProxyPoolEnabled(!data.proxyPoolEnabled)}
                        className={data.proxyPoolEnabled ? secondaryButton : primaryButton}
                      >
                        {data.proxyPoolEnabled ? "停用轮询" : "启用轮询"}
                      </button>
                      <button type="button" disabled={isPending || data.proxies.length === 0} onClick={testAllProxies} className={secondaryButton}>
                        全部测试
                      </button>
                      <button type="button" disabled={isPending || data.proxies.every((item) => item.lastTestStatus !== "error")} onClick={disableFailedProxies} className={secondaryButton}>
                        停用异常
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" disabled={isPending || data.proxies.every((item) => item.lastTestStatus !== "error")} onClick={deleteFailedProxies} className={dangerButton}>
                        清理异常
                      </button>
                      <div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/8 px-4 py-3 text-xs leading-5 text-slate-300">
                        当前策略：{data.proxyPoolEnabled ? "按启用代理顺序轮询" : "直连 OpenAI，不使用代理池"}
                      </div>
                    </div>
                  </div>
                </div>

                <form action={submitProxy} className="grid gap-3 rounded-[1.45rem] border border-cyan-200/12 bg-slate-950/36 p-4 lg:grid-cols-[180px_1fr_96px_auto]">
                  <input name="name" placeholder="名称，例如 新加坡 1" className={inputClass} />
                  <input name="url" placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7891" className={inputClass} />
                  <label className="inline-flex min-w-24 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-cyan-200/12 bg-white/[0.035] px-4 py-3 text-sm text-slate-300">
                    <input name="enabled" type="checkbox" defaultChecked className="accent-cyan-300" />
                    启用
                  </label>
                  <button disabled={isPending} className={primaryButton}>
                    添加代理
                  </button>
                </form>

                <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-cyan-200/12 bg-slate-950/34">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1040px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[280px]" />
                        <col className="w-[96px]" />
                        <col className="w-[190px]" />
                        <col className="w-[140px]" />
                        <col className="w-[90px]" />
                        <col className="w-[180px]" />
                        <col className="w-[110px]" />
                        <col className="w-[150px]" />
                      </colgroup>
                      <thead className="bg-cyan-950/80 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                        <tr>
                          <th className="px-4 py-3">代理</th>
                          <th className="px-4 py-3">状态</th>
                          <th className="px-4 py-3">地区</th>
                          <th className="px-4 py-3">出口 IP</th>
                          <th className="px-4 py-3">延迟</th>
                          <th className="px-4 py-3">测试结果</th>
                          <th className="px-4 py-3">最后检测</th>
                          <th className="px-4 py-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.proxies.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                              还没有代理。库存账号检测 OpenAI 时会直连，建议先添加代理。
                            </td>
                          </tr>
                        ) : null}
                        {data.proxies.map((proxy) => (
                          <tr key={proxy.id} className="border-t border-cyan-200/[0.075]">
                            <td className="px-4 py-4">
                              <p className="font-medium text-white">{proxy.name}</p>
                              <p className="mt-1 break-all font-mono text-xs text-slate-500">{maskSensitiveText(proxy.url)}</p>
                            </td>
                            <td className="px-4 py-4">
                              <span className={clsx(
                                "inline-flex w-[64px] justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs leading-none",
                                proxy.enabled
                                  ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                                  : "border-white/10 bg-white/5 text-slate-400",
                              )}>
                                {proxy.enabled ? "启用" : "停用"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-300">
                              {proxy.lastTestLocation ? (
                                <span className="inline-flex rounded-full border border-cyan-200/14 bg-cyan-300/8 px-2.5 py-1">
                                  {proxy.lastTestLocation}
                                </span>
                              ) : (
                                <span className="text-slate-500">未测试</span>
                              )}
                            </td>
                            <td className="px-4 py-4 font-mono text-xs text-slate-400">
                              {proxy.lastTestIp ?? "-"}
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {proxy.lastLatencyMs === null ? "未测试" : `${proxy.lastLatencyMs}ms`}
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-400">
                              <p>{proxy.lastTestStatus === "success" ? "可用" : proxy.lastTestStatus === "error" ? "异常" : "未测试"}</p>
                              <p className="mt-1">{maskSensitiveText(proxy.lastTestMessage)}</p>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-400">
                              {formatTime(proxy.lastTestedAt)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={isPending} onClick={() => setEditingProxy(proxy)} className={iconActionButton} title="编辑/改名" aria-label="编辑/改名">
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button type="button" disabled={isPending} onClick={() => testProxy(proxy.id)} className={iconActionButton} title="测试" aria-label="测试">
                                  <Play className="h-4 w-4" />
                                </button>
                                <button type="button" disabled={isPending} onClick={() => updateProxyState(proxy.id, !proxy.enabled)} className={iconActionButton} title={proxy.enabled ? "停用" : "启用"} aria-label={proxy.enabled ? "停用" : "启用"}>
                                  <Power className="h-4 w-4" />
                                </button>
                                <button type="button" disabled={isPending} onClick={() => deleteProxy(proxy.id)} className={dangerIconActionButton} title="删除" aria-label="删除">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {editingProxy ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm">
                <form
                  action={saveProxyEdit}
                  className="cyber-card w-full max-w-[560px] overflow-hidden rounded-[1.6rem] border border-cyan-200/18 bg-slate-950/95 shadow-[0_30px_120px_rgba(0,0,0,0.58)]"
                >
                  <div className="flex items-center justify-between border-b border-cyan-200/12 px-5 py-4">
                    <div>
                      <p className={sectionTitleClass}>Proxy Settings</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">编辑代理</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProxy(null)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/[0.08]"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="grid gap-4 p-5">
                    <ImportField label="代理地址">
                      <input
                        name="url"
                        defaultValue={editingProxy.url}
                        placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7891"
                        className={inputClass}
                      />
                    </ImportField>
                    <ImportField label="标签 / 名称">
                      <input
                        name="name"
                        defaultValue={editingProxy.name}
                        placeholder="例如 新加坡 socks5"
                        className={inputClass}
                      />
                    </ImportField>
                    <label className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200/12 bg-white/[0.035] px-4 py-3 text-sm text-slate-300">
                      <input name="enabled" type="checkbox" defaultChecked={editingProxy.enabled} className="accent-cyan-300" />
                      启用这个代理
                    </label>
                    <div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/8 px-4 py-3 text-xs leading-6 text-slate-400">
                      代理池启用后，这个代理会参与直连 OpenAI 请求轮询；中转站检测/推送不经过这里。
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-cyan-200/12 px-5 py-4">
                    <button type="button" onClick={() => testProxy(editingProxy.id)} disabled={isPending} className={secondaryButton}>
                      先测试
                    </button>
                    <button type="button" onClick={() => setEditingProxy(null)} className={secondaryButton}>
                      取消
                    </button>
                    <button disabled={isPending} className={primaryButton}>
                      保存
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeView === "add-account" ? (
              <section id="add-account" className={panelClass}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Add Account</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    导入到号池
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    支持 GPT 登录后拿到的 Refresh Token / Access Token / API Key，也支持粘贴 JSON。
                  </p>
                </div>
                <button
                  onClick={() => setShowAccountForm((value) => !value)}
                  className="rounded-full border border-blue-200/25 bg-blue-300/10 px-3.5 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-300/16"
                >
                  {showAccountForm ? "收起" : "新增账号"}
                </button>
              </div>

              <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm leading-7 text-slate-400">
                点击“新增账号”后按类型填写。Refresh Token 支持自动续期；Access Token/API Key 属于直连凭据；JSON 可导入 sub2api、CPA、codexproxy 导出内容。
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-3">
                <div className="rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/36 p-4">
                  <p className={sectionTitleClass}>导入预检</p>
                  <div className="mt-4 grid gap-3">
                    <MiniStatus label="待导入行" value={importLineCount} />
                    <MiniStatus label="当前模式" value={importModeLabels[accountImportMode]} />
                    <MiniStatus label="本地可用" value={activePoolAccounts.length} />
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/36 p-4">
                  <p className={sectionTitleClass}>补号库存</p>
                  <div className="mt-4 grid gap-3">
                    <MiniStatus label="可续期账号" value={refreshTokenAccounts.length} />
                    <MiniStatus label="仅 AT/API" value={accessOnlyAccounts.length} />
                    <MiniStatus label="待补中转" value={relayNeedPushCount} />
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/36 p-4">
                  <p className={sectionTitleClass}>导入后动作</p>
                  <div className="mt-4 grid gap-3">
                    <button
                      type="button"
                      onClick={() => changeWorkspaceView("inventory")}
                      className={primaryButton}
                    >
                      去库存选择推送
                    </button>
                    <button
                      type="button"
                      onClick={() => changeWorkspaceView("connections")}
                      className={secondaryButton}
                    >
                      查看中转缺口
                    </button>
                  </div>
                </div>
              </div>
              </section>
            ) : null}

            {showAccountForm ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
                <form
                  action={submitManualAccount}
                  className="cyber-card max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[1.6rem] border border-cyan-200/18 bg-slate-950/95 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex items-center justify-between border-b border-cyan-200/12 px-5 py-4">
                    <h3 className="text-xl font-semibold tracking-[-0.04em] text-white">添加账号</h3>
                    <button
                      type="button"
                      onClick={() => setShowAccountForm(false)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/[0.08]"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="grid gap-2 rounded-2xl border border-cyan-200/14 bg-slate-900/70 p-1 sm:grid-cols-5">
                      {importModeTabs.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAccountImportMode(value)}
                          className={clsx(
                            "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                            accountImportMode === value
                              ? "border border-cyan-200/45 bg-cyan-300/15 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.16)]"
                              : "text-slate-400 hover:bg-cyan-300/8 hover:text-slate-100",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {accountImportMode === "access" ? (
                      <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        AT 模式账号无法自动刷新，过期后需要手动更新。
                      </div>
                    ) : null}

                    {accountImportMode === "apiKey" ? (
                      <div className="rounded-2xl border border-cyan-200/14 bg-cyan-300/8 px-4 py-3 text-sm leading-6 text-slate-300">
                        <strong className="text-cyan-50">OpenAI Responses API</strong>
                        <br />
                        使用 Base URL + API Key 直连 OpenAI Responses API，仅用于 /v1/responses。
                      </div>
                    ) : null}

                    {accountImportMode === "oauth" ? (
                      <div className="rounded-2xl border border-cyan-200/14 bg-cyan-300/8 px-4 py-3 text-sm leading-6 text-slate-300">
                        <strong className="text-cyan-50">第一步：生成授权链接</strong>
                        <br />
                        点击按钮生成专属授权链接，在浏览器中完成 OpenAI 账号登录。完成后把回调链接或 code 粘贴到下方导入。
                      </div>
                    ) : null}

                    <ImportField label="账号名称（可选）">
                      <input name="label" placeholder="留空则使用邮箱或导入序号作为名称" className={inputClass} />
                    </ImportField>

                    {accountImportMode === "apiKey" ? (
                      <>
                        <ImportField label="Base URL *">
                          <input name="baseUrl" defaultValue="https://api.openai.com" className={inputClass} />
                        </ImportField>
                        <ImportField label="API Key *">
                          <textarea
                            name="bulkText"
                            value={accountImportText}
                            onChange={(event) => setAccountImportText(event.target.value)}
                            placeholder="sk-proj-..."
                            rows={3}
                            className={inputClass}
                          />
                        </ImportField>
                        <ImportField label="模型列表 *">
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <textarea
                              value={apiModelText}
                              onChange={(event) => setApiModelText(event.target.value)}
                              placeholder="输入模型，例如 gpt-4.1，支持换行或逗号分隔"
                              rows={3}
                              className={inputClass}
                            />
                            <button type="submit" formAction={fetchOpenAIModels} className={secondaryButton}>
                              请求 /v1/models
                            </button>
                          </div>
                        </ImportField>
                      </>
                    ) : accountImportMode === "oauth" ? (
                      <>
                        <ImportField label="授权结果 / code *">
                          <textarea
                            name="bulkText"
                            value={accountImportText}
                            onChange={(event) => setAccountImportText(event.target.value)}
                            placeholder="粘贴 OpenAI 回调链接、code、或 OAuth JSON"
                            rows={5}
                            className={inputClass}
                          />
                        </ImportField>
                        {oauthAuthorizeUrl ? (
                          <div className="rounded-2xl border border-cyan-200/14 bg-slate-950/50 p-3 text-xs text-cyan-100 break-all">
                            {oauthAuthorizeUrl}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <ImportField
                        label={
                          accountImportMode === "json"
                            ? "JSON 内容 *"
                            : accountImportMode === "refresh"
                              ? "Refresh Token *"
                              : "Access Token *"
                        }
                      >
                        <textarea
                          name="bulkText"
                          value={accountImportText}
                          onChange={(event) => setAccountImportText(event.target.value)}
                          placeholder={
                            accountImportMode === "json"
                              ? "粘贴 sub2api / CPA / codexproxy JSON"
                              : accountImportMode === "refresh"
                                ? "每行一个 Refresh Token，支持批量粘贴"
                                : "每行一个 Access Token，支持批量粘贴"
                          }
                          rows={7}
                          className={inputClass}
                        />
                      </ImportField>
                    )}

                    <ImportField label="代理地址（可选）">
                      <input name="proxyUrl" placeholder="例如 http://127.0.0.1:7890" className={inputClass} />
                    </ImportField>

                    {accountImportMode === "refresh" || accountImportMode === "access" || accountImportMode === "json" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className={secondaryButton}>
                          选择 {accountImportMode === "json" ? "JSON" : "TXT"} 文件
                        </button>
                        <button type="button" onClick={() => folderInputRef.current?.click()} className={secondaryButton}>
                          选择文件夹
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.json,application/json,text/plain"
                          multiple
                          className={hiddenInputClass}
                          onChange={(event) => void readFiles(event.target.files)}
                        />
                        <input
                          ref={folderInputRef}
                          type="file"
                          multiple
                          className={hiddenInputClass}
                          {...({ webkitdirectory: "" } as Record<string, string>)}
                          onChange={(event) => void readFiles(event.target.files)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-2 border-t border-cyan-200/12 px-5 py-4">
                    <button type="button" onClick={() => setShowAccountForm(false)} className={secondaryButton}>
                      取消
                    </button>
                    {accountImportMode === "oauth" ? (
                      <button type="submit" formAction={generateOAuthLink} className={secondaryButton}>
                        生成授权链接
                      </button>
                    ) : null}
                    <button disabled={isPending} className={primaryButton}>
                      添加
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {showPasswordForm ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
                <form
                  action={changeAdminPassword}
                  className="cyber-card w-full max-w-[460px] rounded-[1.6rem] border border-cyan-200/18 bg-slate-950/95 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className={sectionTitleClass}>Security</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">修改管理员密码</h3>
                    </div>
                    <button type="button" onClick={() => setShowPasswordForm(false)} className={secondaryButton}>
                      关闭
                    </button>
                  </div>
                  <div className="grid gap-3">
                    <input name="currentPassword" type="password" placeholder="当前密码" className={inputClass} />
                    <input name="newPassword" type="password" placeholder="新密码" className={inputClass} />
                    <input name="confirmPassword" type="password" placeholder="确认新密码" className={inputClass} />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setShowPasswordForm(false)} className={secondaryButton}>
                      取消
                    </button>
                    <button disabled={isPending} className={primaryButton}>
                      保存新密码
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {editingAccount ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm">
                <form
                  action={saveAccountEdit}
                  className="cyber-card w-full max-w-[620px] overflow-hidden rounded-[1.6rem] border border-cyan-200/18 bg-slate-950/95 shadow-[0_30px_120px_rgba(0,0,0,0.58)]"
                >
                  <div className="flex items-center justify-between border-b border-cyan-200/12 px-5 py-4">
                    <div>
                      <p className={sectionTitleClass}>Account Settings</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">修改账号</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingAccount(null)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/[0.08]"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="grid gap-4 p-5">
                    <div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/8 px-4 py-3 text-xs leading-6 text-slate-400">
                      {maskSensitiveText(editingAccount.email || editingAccount.tokenPreview)}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ImportField label="标签">
                        <input name="label" defaultValue={editingAccount.label ?? ""} className={inputClass} />
                      </ImportField>
                      <ImportField label="计划">
                        <input name="planType" defaultValue={editingAccount.planType ?? ""} placeholder="Free / Plus / Pro" className={inputClass} />
                      </ImportField>
                    </div>
                    <ImportField label="状态">
                      <select name="status" defaultValue={editingAccount.status} className={inputClass}>
                        <option value="active">可用</option>
                        <option value="inactive">未启用</option>
                        <option value="disabled">已停用</option>
                        <option value="expired">已过期</option>
                        <option value="banned">已封禁</option>
                        <option value="error">异常</option>
                        <option value="quota_exhausted">额度耗尽</option>
                        <option value="refreshing">刷新中</option>
                        <option value="unknown">未知</option>
                      </select>
                    </ImportField>
                    <ImportField label="备注">
                      <textarea name="notes" defaultValue={editingAccount.notes ?? ""} rows={4} className={inputClass} />
                    </ImportField>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-cyan-200/12 px-5 py-4">
                    <button type="button" onClick={() => setEditingAccount(null)} className={secondaryButton}>
                      取消
                    </button>
                    <button disabled={isPending} className={primaryButton}>
                      保存
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeView === "inventory" ? (
              <section id="inventory" className={panelClass}>
              <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
                <div>
                  <p className={sectionTitleClass}>Pool</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    库存列表
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    当前显示 {accounts.length} / {data.accounts.length} 个账号，已选 {selectedIds.length} 个。后台会定时检测套餐和可用状态。
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_160px]">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索标签、邮箱、账号 ID"
                    className={inputClass}
                  />
                  <select
                    value={planTypeFilter}
                    onChange={(event) => setPlanTypeFilter(event.target.value as InventoryPlanFilter)}
                    className={inputClass}
                  >
                    <option value="all">全部套餐</option>
                    <option value="plus">Plus</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="unknown">未知套餐</option>
                  </select>
                  <select
                    value={availabilityFilter}
                    onChange={(event) => setAvailabilityFilter(event.target.value as InventoryAvailabilityFilter)}
                    className={inputClass}
                  >
                    <option value="all">全部可用性</option>
                    <option value="active">仅可用</option>
                    <option value="unavailable">仅不可用</option>
                  </select>
                  <select
                    value={pushFilter}
                    onChange={(event) => setPushFilter(event.target.value as InventoryPushFilter)}
                    className={inputClass}
                  >
                    <option value="all">全部推送状态</option>
                    <option value="unpushed">未推送</option>
                    <option value="pushed">已推送</option>
                  </select>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as InventorySortMode)}
                    className={inputClass}
                  >
                    <option value="unpushed_first">未推送优先</option>
                    <option value="pushed_first">已推送优先</option>
                    <option value="updated_desc">最近更新优先</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={allVisibleSelected ? clearVisibleSelection : selectAllVisible} className={secondaryButton}>
                    {allVisibleSelected ? "取消全选" : "全选当前"}
                  </button>
                  <button onClick={() => updateSelectedAccountStatus("active")} disabled={isPending || selectedIds.length === 0} className={secondaryButton}>
                    启用已选
                  </button>
                  <button onClick={() => updateSelectedAccountStatus("disabled")} disabled={isPending || selectedIds.length === 0} className={secondaryButton}>
                    停用已选
                  </button>
                  <button onClick={deleteSelectedAccounts} disabled={isPending || selectedIds.length === 0} className={dangerButton}>
                    删除已选
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/34 p-3">
                <span className="mr-1 text-xs text-slate-500">
                  导出 {selectedIds.length > 0 ? `已选 ${selectedIds.length} 个` : `当前列表 ${accounts.length} 个`}
                </span>
                <button type="button" onClick={() => void exportAccounts("pool")} className={secondaryButton}>
                  导出号池 JSON
                </button>
                <button type="button" onClick={() => void exportAccounts("sub2api")} className={secondaryButton}>
                  导出 sub2api
                </button>
                <button type="button" onClick={() => void exportAccounts("cpa")} className={secondaryButton}>
                  导出 CPA
                </button>
                <button type="button" onClick={() => void exportAccounts("txt")} className={secondaryButton}>
                  导出 TXT
                </button>
              </div>

              <div className="neon-divider mt-5 h-px" />

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">当前显示</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-white">{accounts.length}</p>
                </div>
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">已选择</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-white">{selectedIds.length}</p>
                </div>
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">排序</p>
                  <p className="mt-1 font-mono text-sm text-cyan-100">
                    {sortMode === "unpushed_first"
                      ? "未推送优先"
                      : sortMode === "pushed_first"
                        ? "已推送优先"
                        : "最近更新"}
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.6rem] border border-cyan-200/12 bg-slate-950/34">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-cyan-950/95 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                      <tr>
                        <th className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={accounts.length > 0 && accounts.every((item) => selectedIds.includes(item.id))}
                            onChange={(event) => {
                              if (event.target.checked) selectAllVisible();
                              else clearVisibleSelection();
                            }}
                            aria-label="全选当前列表"
                            className="h-4 w-4 rounded border-cyan-200/30 bg-slate-950/70 accent-cyan-300"
                          />
                        </th>
                        <th className="px-4 py-3">标签 / 邮箱</th>
                        <th className="px-4 py-3">来源</th>
                        <th className="px-4 py-3">计划</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">标识</th>
                        <th className="px-4 py-3">检测 / 推送</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                            没有匹配账号。
                          </td>
                        </tr>
                      ) : null}
                      {accounts.map((account) => {
                        const selected = selectedIds.includes(account.id);
                        return (
                          <tr
                            key={account.id}
                            className={clsx(
                              "border-t border-cyan-200/[0.075] transition duration-150",
                              selected ? "bg-cyan-300/[0.14] shadow-[inset_3px_0_0_rgba(34,211,238,0.9)]" : "hover:bg-cyan-300/[0.055]",
                            )}
                          >
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelection(account.id)}
                                className="h-4 w-4 rounded border-cyan-200/30 bg-slate-950/70 accent-cyan-300"
                              />
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1">
                                <p className="font-medium tracking-[-0.025em] text-slate-100">
                                  {account.label || account.email || "未命名账号"}
                                </p>
                                <p className="text-xs text-slate-500">{account.email || "无邮箱"}</p>
                                {account.notes ? (
                                  <p className="max-w-[260px] text-xs text-slate-500">{maskSensitiveText(account.notes)}</p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1">
                                <span className="inline-flex rounded-full border border-cyan-200/14 bg-cyan-300/8 px-2.5 py-1 font-mono text-xs text-cyan-100">
                                  {accountSourceLabels[account.sourceType]}
                                </span>
                                <p className="text-xs text-slate-500">
                                  {account.hasRefreshToken ? "支持续期" : "无续期凭据"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className="inline-flex rounded-lg border border-blue-300/25 bg-blue-400/12 px-2.5 py-1 text-xs font-semibold text-blue-100">
                                {formatPlanType(account.planType)}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-2">
                                <span
                                  className={clsx(
                                    "inline-flex rounded-full border px-2.5 py-1 text-xs",
                                    statusTone[account.status],
                                  )}
                                >
                                  {formatAccountUsability(account.status)}
                                </span>
                                <p className="text-xs text-slate-500">检测: {translateRemoteStatus(account.remoteStatus)}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1 font-mono text-xs text-slate-400">
                                <p>acc: {maskIdentifier(account.accountId)}</p>
                                <p>user: {maskIdentifier(account.userId)}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-2 text-xs text-slate-500">
                                <p>检测: {formatTime(account.lastStatusCheckedAt)}</p>
                                {(account.pushCount ?? 0) > 0 ? (
                                  <div className="inline-flex flex-col gap-1 rounded-2xl border border-amber-300/35 bg-amber-400/14 px-3 py-2 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.10)]">
                                    <span className="font-semibold">已推送 {account.pushCount} 次</span>
                                    <span className="text-[11px] text-amber-100/70">最后 {formatTime(account.lastPushedAt)}</span>
                                  </div>
                                ) : (
                                  <span className="inline-flex rounded-full border border-slate-300/15 bg-slate-400/10 px-2.5 py-1 text-slate-400">
                                    未推送
                                  </span>
                                )}
                                {account.lastCheckMessage ? (
                                  <p className="max-w-[220px] text-cyan-100">
                                    检测: {formatCheckMessage(account.lastCheckMessage)}
                                  </p>
                                ) : null}
                                {account.modelCount !== null ? <p>模型 {account.modelCount}</p> : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => setEditingAccount(account)}
                                  className="rounded-full border border-cyan-200/14 bg-white/[0.045] px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-200/28 hover:bg-cyan-300/10 disabled:opacity-60"
                                >
                                  修改
                                </button>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => void exportOneAccount("pool", account.id)}
                                  className="rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-xs text-blue-100 transition hover:bg-blue-400/18 disabled:opacity-60"
                                >
                                  导出
                                </button>
                                <button
                                  disabled={isPending}
                                  onClick={() =>
                                    runTask(() =>
                                      callApi(`/api/accounts/${account.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          status: account.status === "disabled" ? "active" : "disabled",
                                        }),
                                      }),
                                    )
                                  }
                                  className="rounded-full border border-cyan-200/14 bg-white/[0.045] px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-200/28 hover:bg-cyan-300/10 disabled:opacity-60"
                                >
                                  {account.status === "disabled" ? "启用" : "停用"}
                                </button>
                                <button
                                  disabled={isPending}
                                  onClick={() => deleteAccountWithConfirm(account)}
                                  className="rounded-full border border-rose-300/25 bg-rose-400/12 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-400/18 disabled:opacity-60"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
                <section className="rounded-[1.45rem] border border-cyan-200/12 bg-slate-950/36 p-4">
                  <p className={sectionTitleClass}>推送准备</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">本地补号队列</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniStatus label="已选账号" value={selectedIds.length} />
                    <MiniStatus label="可推账号" value={selectedActiveAccounts.length} />
                    <MiniStatus label="本地可用" value={activePoolAccounts.length} />
                    <MiniStatus label="建议补号" value={recommendedPushTotal} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={selectActiveVisible} className={secondaryButton}>
                      全选可用账号
                    </button>
                    <button
                      type="button"
                      onClick={() => changeWorkspaceView("add-account")}
                      className={secondaryButton}
                    >
                      导入更多账号
                    </button>
                  </div>
                  <p className="mt-4 text-xs leading-6 text-slate-500">
                    推送前建议只选择“可用”账号；如果中转站缺口大于本地可用数，先去账号导入页补充号池。
                  </p>
                </section>

                <section className="rounded-[1.45rem] border border-cyan-200/12 bg-slate-950/36 p-4">
                  <p className={sectionTitleClass}>中转补号建议</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">发现异常后直接补推</h3>
                  <div className="mt-4 grid gap-3">
                    {relayReplenishPlans.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-4 text-sm text-slate-400">
                        还没有中转站，先到中转管理页添加。
                      </div>
                    ) : null}
                    {relayReplenishPlans.map((plan) => {
                      const needAttention =
                        !plan.remoteStatus ||
                        plan.recommendedPushCount > 0 ||
                        plan.warningAccounts > 0 ||
                        plan.quotaLow;
                      return (
                        <article
                          key={plan.integration.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-medium text-white">
                                  {plan.integration.name}
                                </h4>
                                <span
                                  className={clsx(
                                    "rounded-full border px-2.5 py-1 text-xs",
                                    needAttention
                                      ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
                                      : "border-emerald-300/25 bg-emerald-400/12 text-emerald-100",
                                  )}
                                >
                                  {needAttention ? "需要关注" : "状态正常"}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-6 text-slate-400">
                                目标 {plan.autoRule?.targetUsableAccounts ?? 0} · 正常{" "}
                                {plan.remoteStatus
                                  ? `${plan.remoteStatus.normalAccounts}/${plan.remoteStatus.totalAccounts}`
                                  : "未检测"}{" "}
                                · 异常 {plan.warningAccounts} · 5h 剩余{" "}
                                {formatPercent(plan.remaining5h)}
                              </p>
                              <p className="mt-1 text-xs leading-6 text-slate-500">
                                规则 {plan.autoRule?.triggerMode === "all" ? "缺号且额度低" : "缺号或额度低"}
                                {" · "}
                                {plan.autoRule ? credentialFilterLabels[plan.autoRule.credentialFilter] : "全部账号"}
                                {" · "}
                                {plan.autoRule ? formatPlanFilters(plan.autoRule.planFilters) : "全部套餐"}
                                {plan.quotaCritical ? " · 额度耗尽保护" : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isPending || selectedIds.length === 0}
                              onClick={() =>
                                runTask(() =>
                                  callApi("/api/accounts/push", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      integrationId: plan.integration.id,
                                      accountIds: selectedIds,
                                      targetGroups: plan.autoRule?.targetGroups ?? [],
                                      planGroupMap: plan.autoRule?.planGroupMap ?? {},
                                      pushNotes: plan.autoRule?.pushNotes ?? "",
                                    }),
                                  }),
                                )
                              }
                              className={primaryButton}
                            >
                              推送已选 {selectedIds.length} 个
                            </button>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <MiniStatus label="缺口" value={plan.shortage} />
                            <MiniStatus label="建议补号" value={plan.recommendedPushCount} />
                            <MiniStatus label="可推库存" value={plan.matchedPoolCount} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
              </section>
            ) : null}

            {activeView === "activity" ? (
              <section id="activity" className={panelClass}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className={sectionTitleClass}>Activity</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    运行日志
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    页面每 15 秒自动刷新；写入新日志时自动保留最新 200 条。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activityLimit}
                    onChange={(event) => setActivityLimit(Number(event.target.value))}
                    className="neon-input rounded-2xl px-3 py-2 text-xs"
                  >
                    <option value={20}>显示 20 条</option>
                    <option value={50}>显示 50 条</option>
                    <option value={100}>显示 100 条</option>
                  </select>
                  <button type="button" onClick={() => router.refresh()} className={secondaryButton}>
                    刷新
                  </button>
                  <button type="button" onClick={() => clearLogs(20)} className={secondaryButton}>
                    保留 20 条
                  </button>
                  <button type="button" onClick={() => clearLogs()} className={dangerButton}>
                    清空日志
                  </button>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-400">
                    {isPending ? <RefreshCw className="h-4 w-4 animate-spin text-cyan-200" /> : null}
                    <span>{isPending ? "处理中" : "自动刷新"}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStatus label="当前显示" value={`${visibleLogs.length}/${data.logs.length}`} />
                <MiniStatus label="错误日志" value={data.logs.filter((item) => item.status === "error").length} />
                <MiniStatus label="自动清理" value="最新 200 条" />
              </div>
              <div className="mt-5 grid gap-3">
                {data.logs.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                    还没有操作记录。
                  </div>
                ) : null}
                {visibleLogs.map((log) => (
                  <article
                    key={log.id}
                    className="flex flex-col gap-3 rounded-[1.4rem] border border-cyan-200/12 bg-slate-950/34 p-4 transition hover:border-cyan-200/25 hover:bg-slate-900/42 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="flex gap-3">
                      <div
                        className={clsx(
                          "mt-1 rounded-2xl border p-2.5",
                          log.status === "success"
                            ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                            : log.status === "error"
                              ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
                              : "border-cyan-200/14 bg-cyan-300/8 text-cyan-100",
                        )}
                      >
                        {log.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : log.status === "error" ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <ServerCog className="h-4 w-4" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-medium text-slate-100">{maskSensitiveText(log.title)}</h3>
                        <p className="text-sm text-slate-400">{maskSensitiveText(log.detail)}</p>
                        <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-600">
                          {log.kind}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
                      <ArrowUpRight className="h-4 w-4" />
                      {formatTime(log.createdAt)}
                    </div>
                  </article>
                ))}
              </div>
              </section>
            ) : null}
        </main>

      </div>
      </div>
    </div>
  );
}
