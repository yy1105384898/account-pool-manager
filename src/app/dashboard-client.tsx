"use client";

import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CloudUpload,
  Cpu,
  Database,
  type LucideIcon,
  Network,
  PlugZap,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AccountStatus,
  AccountViewModel,
  AutoReplenishRuleRecord,
  AutoReplenishRunRecord,
  DashboardData,
  IntegrationType,
  IntegrationViewModel,
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

const importModeLabels: Record<"refresh" | "access" | "apiKey" | "oauth" | "json", string> = {
  refresh: "Refresh Token",
  access: "Access Token",
  apiKey: "API Key",
  oauth: "OAuth 授权",
  json: "JSON 导入",
};

const autoRunStatusTone: Record<NonNullable<AutoReplenishRuleRecord["lastStatus"]>, string> = {
  success: "border-emerald-300/25 bg-emerald-400/12 text-emerald-100",
  error: "border-rose-300/25 bg-rose-400/12 text-rose-100",
  skipped: "border-cyan-200/18 bg-cyan-300/10 text-cyan-100",
};

const credentialFilterLabels: Record<AutoReplenishRuleRecord["credentialFilter"], string> = {
  all: "全部账号",
  has_refresh_token: "仅 Refresh Token",
  access_only: "仅 Access Token",
};

type WorkspaceView = "overview" | "connections" | "add-account" | "inventory" | "activity";

const workspaceNavItems: Array<{
  view: WorkspaceView;
  label: string;
  icon: LucideIcon;
  meta: string;
}> = [
  { view: "overview", label: "概览", icon: Sparkles, meta: "总览" },
  { view: "connections", label: "中转管理", icon: PlugZap, meta: "推送/监控" },
  { view: "add-account", label: "提取推送", icon: CloudUpload, meta: "导入" },
  { view: "inventory", label: "库存", icon: Database, meta: "筛选/选择" },
  { view: "activity", label: "最近动作", icon: Activity, meta: "日志" },
];

const workspaceViewMeta: Record<
  WorkspaceView,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "Workspace",
    title: "号池管理系统",
    description: "查看本地号池、中转连接、风险账号和自动补池运行状态。",
  },
  connections: {
    eyebrow: "Relay Target",
    title: "中转站管理",
    description: "配置 codexproxy / sub2api / CPA，检测远端账号状态并执行补池规则。",
  },
  "add-account": {
    eyebrow: "Add Account",
    title: "添加账号",
    description: "批量导入 Refresh Token、Access Token、API Key 或 JSON。",
  },
  inventory: {
    eyebrow: "Pool",
    title: "账号库存",
    description: "筛选、选择、停用和删除本地号池账号，再推送到中转站。",
  },
  activity: {
    eyebrow: "Activity",
    title: "最近动作",
    description: "查看导入、推送、检测、自动补池的执行记录。",
  },
};

function isWorkspaceView(value: string): value is WorkspaceView {
  return workspaceNavItems.some((item) => item.view === value);
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
    authPlaceholder: "X-Admin-Key 管理密钥",
    helperText: "codexproxy 自动使用请求头 X-Admin-Key，并连接 /api/admin/*。",
  },
};

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

function formatPercent(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "未返回";
  return `${Math.round(value * 10) / 10}%`;
}

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

  return (
    <div className="mt-4 rounded-[1.35rem] border border-cyan-200/12 bg-slate-950/38 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/60">
            Auto Replenish
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
            立即执行
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniStatus
          label="normal"
          value={
            remoteStatus
              ? `${remoteStatus.normalAccounts}/${remoteStatus.totalAccounts}`
              : "未检测"
          }
        />
        <MiniStatus
          label="5h remain"
          value={remoteStatus ? formatPercent(read5hRemaining(remoteStatus)) : "未检测"}
        />
        <MiniStatus
          label="last check"
          value={remoteStatus ? formatTime(remoteStatus.updatedAt) : "未检测"}
        />
        <MiniStatus
          label="next run"
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
            {autoRule.lastStatus ?? "idle"}
          </span>
          <span>触发: {autoRule.triggerMode === "all" ? "全部满足" : "任一触发"}</span>
          <span>凭据: {credentialFilterLabels[autoRule.credentialFilter]}</span>
          <span>目标 {autoRule.targetUsableAccounts}</span>
          <span>单次上限 {autoRule.maxAccountsPerRun}</span>
        </div>
        <p className="mt-3 leading-6 text-slate-300">
          {autoRule.lastMessage ?? "还没有自动补池记录。"}
        </p>
      </div>

      <form action={onSave} className="mt-4 grid gap-3">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={autoRule.enabled}
              className="h-4 w-4 accent-cyan-300"
            />
            启用自动补池
          </label>
          <select name="triggerMode" defaultValue={autoRule.triggerMode} className={inputClass}>
            <option value="any">任一触发</option>
            <option value="all">全部满足</option>
          </select>
          <select
            name="credentialFilter"
            defaultValue={autoRule.credentialFilter}
            className={inputClass}
          >
            <option value="all">全部账号</option>
            <option value="has_refresh_token">仅 Refresh Token</option>
            <option value="access_only">仅 Access Token</option>
          </select>
          <input
            type="number"
            min={1}
            max={1440}
            name="intervalMinutes"
            defaultValue={autoRule.intervalMinutes}
            placeholder="检查间隔(分钟)"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            type="number"
            min={0}
            name="minUsableAccounts"
            defaultValue={autoRule.minUsableAccounts}
            placeholder="最少正常账号"
            className={inputClass}
          />
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            name="min5hRemainingPercent"
            defaultValue={autoRule.min5hRemainingPercent}
            placeholder="5h 最低剩余额度%"
            className={inputClass}
          />
          <input
            type="number"
            min={0}
            name="targetUsableAccounts"
            defaultValue={autoRule.targetUsableAccounts}
            placeholder="目标正常账号"
            className={inputClass}
          />
          <input
            type="number"
            min={0}
            name="quotaLowPurchaseCount"
            defaultValue={autoRule.quotaLowPurchaseCount}
            placeholder="额度不足补号数"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            type="number"
            min={1}
            name="maxAccountsPerRun"
            defaultValue={autoRule.maxAccountsPerRun}
            placeholder="单次最多补号"
            className={inputClass}
          />
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              name="respectRateLimitRecovery"
              defaultChecked={autoRule.respectRateLimitRecovery}
              className="h-4 w-4 accent-cyan-300"
            />
            额度低时恢复等待
          </label>
          <input
            type="number"
            min={0}
            max={1440}
            name="rateLimitRecoveryGraceMinutes"
            defaultValue={autoRule.rateLimitRecoveryGraceMinutes}
            placeholder="恢复等待(分钟)"
            className={inputClass}
          />
          <button disabled={isPending} className={primaryButton}>
            保存自动补池规则
          </button>
        </div>
      </form>

      <div className="mt-4 grid gap-3">
        {recentRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-4 text-sm text-slate-400">
            暂无自动补池执行记录。
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
                  {run.status}
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
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | AccountViewModel["sourceType"]>("all");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showIntegrationForm, setShowIntegrationForm] = useState(data.integrations.length === 0);
  const [showAccountForm, setShowAccountForm] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<IntegrationType>("sub2api");
  const [accountImportMode, setAccountImportMode] = useState<"refresh" | "access" | "apiKey" | "oauth" | "json">("refresh");
  const [accountImportText, setAccountImportText] = useState("");
  const [remoteStatusOverrides, setRemoteStatusOverrides] = useState<Record<string, RemoteStatusSummary>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedIntegrationConfig = integrationFormConfig[selectedPlatform];
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

  const accounts = data.accounts.filter((item) => {
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    const matchSource = sourceFilter === "all" || item.sourceType === sourceFilter;
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
    return matchStatus && matchSource && matchSearch;
  });

  const activeRate = data.summary.totalAccounts
    ? Math.round((data.summary.activeAccounts / data.summary.totalAccounts) * 100)
    : 0;
  const warningRate = data.summary.totalAccounts
    ? Math.round((data.summary.warningAccounts / data.summary.totalAccounts) * 100)
    : 0;
  const enabledAutoRuleCount = data.autoRules.filter((item) => item.enabled).length;
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const activeViewMeta = workspaceViewMeta[activeView];

  useEffect(() => {
    function syncFromHash() {
      const hashView = window.location.hash.replace("#", "");
      if (isWorkspaceView(hashView)) setActiveView(hashView);
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

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

  function changeWorkspaceView(view: WorkspaceView) {
    setActiveView(view);
    if (typeof window === "undefined") return;

    const hash = `#${view}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function runTask(task: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      setNotice(null);
      const result = await task();
      setNotice(
        result.ok
          ? { type: "success", text: result.message ?? "操作成功" }
          : { type: "error", text: result.error ?? "操作失败" },
      );
      router.refresh();
    });
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

  async function readFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chunks = await Promise.all(
      Array.from(files)
        .filter((file) => /\.(txt|json)$/i.test(file.name))
        .map((file) => file.text()),
    );
    if (chunks.length === 0) {
      setNotice({ type: "error", text: "请选择 .txt 或 .json 文件" });
      return;
    }
    const hasJson = Array.from(files).some((file) => /\.json$/i.test(file.name));
    if (hasJson) setAccountImportMode("json");
    setAccountImportText((current) => [current, ...chunks].filter(Boolean).join("\n"));
  }

  function submitManualAccount(formData: FormData) {
    const bulkText = accountImportText || String(formData.get("bulkText") || "");
    const payload = bulkText.trim()
      ? {
          importMode: accountImportMode,
          bulkText,
        }
      : {
          label: String(formData.get("label") || ""),
          email: String(formData.get("email") || ""),
          accountId: String(formData.get("accountId") || ""),
          userId: String(formData.get("userId") || ""),
          planType: String(formData.get("planType") || ""),
          accessToken: String(formData.get("accessToken") || ""),
          refreshToken: String(formData.get("refreshToken") || ""),
          status: String(formData.get("status") || "active"),
          notes: String(formData.get("notes") || ""),
        };

    runTask(async () => {
      const result = await callApi("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (result.ok) {
        setShowAccountForm(false);
        setAccountImportText("");
      }
      return result;
    });
  }

  return (
    <div className="cyber-shell min-h-screen text-slate-100">
      <div className="grid min-h-screen w-full lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="command-bar z-30 flex flex-col gap-5 rounded-none border-x-0 border-t-0 px-4 py-5 text-sm text-slate-200 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-cyan-200/14">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.20)]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">
                NexusPool
              </p>
              <p className="text-sm font-medium text-white">号池管理系统</p>
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

          <div className="mt-auto grid gap-2 text-xs">
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100">
              <Network className="h-3.5 w-3.5" /> {data.summary.totalAccounts} 个账号
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-blue-100">
              <PlugZap className="h-3.5 w-3.5" /> {data.summary.integrationCount} 个中转站
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-amber-100">
              <Activity className="h-3.5 w-3.5" /> 风险 {warningRate}%
            </span>
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
                    icon={Database}
                    label="本地账号"
                    value={data.summary.totalAccounts}
                    extra={`${data.summary.activeAccounts} 个可用 · ${activeRate}%`}
                    tone="bg-cyan-400/25"
                  />
                  <MetricCard
                    icon={PlugZap}
                    label="远端连接"
                    value={data.summary.integrationCount}
                    extra="codexproxy / sub2api / CPA"
                    tone="bg-blue-400/25"
                  />
                  <MetricCard
                    icon={AlertCircle}
                    label="需处理"
                    value={data.summary.warningAccounts}
                    extra={`风险占比 ${warningRate}%`}
                    tone="bg-amber-400/25"
                  />
                  <MetricCard
                    icon={ShieldCheck}
                    label="自动补池"
                    value={enabledAutoRuleCount}
                    extra={`规则总数 ${data.autoRules.length}`}
                    tone="bg-teal-400/25"
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
                  <section className={panelClass}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className={sectionTitleClass}>Relay Snapshot</p>
                        <h2 className="mt-2 text-xl font-semibold text-white">中转状态快览</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => changeWorkspaceView("connections")}
                        className={secondaryButton}
                      >
                        管理中转
                      </button>
                    </div>
                    <div className="grid gap-3">
                      {data.integrations.length === 0 ? (
                        <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                          还没有配置中转站。
                        </div>
                      ) : null}
                      {data.integrations.slice(0, 4).map((integration) => {
                        const remoteStatus = remoteStatusByIntegration[integration.id];
                        return (
                          <div
                            key={integration.id}
                            className="rounded-2xl border border-cyan-200/12 bg-slate-950/34 px-4 py-3"
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
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className={panelClass}>
                    <p className={sectionTitleClass}>Shortcuts</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">常用操作</h2>
                    <div className="mt-4 grid gap-3">
                      <button
                        type="button"
                        onClick={() => changeWorkspaceView("add-account")}
                        className={primaryButton}
                      >
                        <CloudUpload className="h-4 w-4" />
                        导入账号
                      </button>
                      <button
                        type="button"
                        onClick={() => changeWorkspaceView("inventory")}
                        className={secondaryButton}
                      >
                        <Database className="h-4 w-4" />
                        选择库存推送
                      </button>
                      <button
                        type="button"
                        onClick={() => changeWorkspaceView("activity")}
                        className={secondaryButton}
                      >
                        <Activity className="h-4 w-4" />
                        查看运行记录
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniStatus label="visible" value={accounts.length} />
                      <MiniStatus label="selected" value={selectedIds.length} />
                      <MiniStatus label="auto rules" value={enabledAutoRuleCount} />
                      <MiniStatus label="active rate" value={`${activeRate}%`} />
                    </div>
                  </section>
                </div>
              </section>
            ) : null}

            {activeView === "connections" ? (
              <section id="connections" className={panelClass}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Relay Target</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    中转站连接设置
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    只维护当前生效中转站。号池向中转站推送账号，并读取中转站状态，不反向导回本地。
                  </p>
                </div>
                <button
                  onClick={() => setShowIntegrationForm((value) => !value)}
                  className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3.5 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/16"
                >
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
                    {data.integrations.length > 0 ? "已连接" : "未配置"}
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
                    defaultValue={selectedIntegrationConfig.defaultName}
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
                    先添加一个中转站连接。支持 sub2api、CPA、codexproxy（codex2api 管理端），系统会在这里显示连通状态、鉴权方式和账号状态概览。
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
                      {integration.baseUrl}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500">
                      <p>鉴权: {integration.authMode}</p>
                      <p>凭据: {integration.authPreview ?? "未配置"}</p>
                      <p>连通结果: {integration.lastTestMessage ?? "未记录"}</p>
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
                                <div className="mb-1 flex justify-between text-xs text-slate-300"><span>{key}</span><span>{value}</span></div>
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

            {activeView === "add-account" ? (
              <section id="add-account" className={panelClass}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Add Account</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    添加账号
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

              {showAccountForm ? (
                <form action={submitManualAccount} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["refresh", "Refresh Token"],
                      ["access", "Access Token"],
                      ["apiKey", "API Key"],
                      ["oauth", "OAuth 授权"],
                      ["json", "JSON 导入"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAccountImportMode(value as typeof accountImportMode)}
                        className={clsx(
                          "rounded-2xl border px-3 py-2 text-sm transition",
                          accountImportMode === value
                            ? "border-cyan-300/55 bg-cyan-300/12 text-cyan-50"
                            : "border-white/10 bg-slate-950/30 text-slate-300 hover:border-cyan-200/25",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    name="bulkText"
                    value={accountImportText}
                    onChange={(event) => setAccountImportText(event.target.value)}
                    placeholder={
                      accountImportMode === "json"
                        ? "粘贴 GPT JSON / Sub2Api JSON / Cliproxy JSON"
                        : accountImportMode === "refresh"
                          ? "每行一个 Refresh Token，支持批量粘贴"
                          : accountImportMode === "access"
                            ? "每行一个 Access Token"
                            : accountImportMode === "apiKey"
                              ? "每行一个 API Key"
                              : "OAuth 授权结果可粘贴为 JSON 或 token"
                    }
                    rows={7}
                    className={inputClass}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={secondaryButton}
                    >
                      选择 TXT / JSON 文件
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className={secondaryButton}
                    >
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setAccountImportMode("json")}
                      className={secondaryButton}
                    >
                      当前模式：{importModeLabels[accountImportMode]}
                    </button>
                    <button disabled={isPending} className={primaryButton}>
                      添加到号池
                    </button>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">TXT 文件：每行一个 Refresh Token</div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">AT TXT：每行一个 Access Token</div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">JSON：兼容数组、accounts、credentials</div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">文件夹导入：自动读取其中的 .txt / .json</div>
                  </div>
                </form>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm leading-7 text-slate-400">
                  添加账号方式：登录 GPT 账号后获取 Refresh Token / Access Token / API Key，或者把 GPT JSON 内容粘贴进来批量导入。
                </div>
              )}
              </section>
            ) : null}

            {activeView === "inventory" ? (
              <section id="inventory" className={panelClass}>
              <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
                <div>
                  <p className={sectionTitleClass}>Pool</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    账号列表
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    当前显示 {accounts.length} / {data.accounts.length} 个账号，已选 {selectedIds.length} 个。
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto_auto]">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索标签、邮箱、账号 ID"
                    className={inputClass}
                  />
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                    className={inputClass}
                  >
                    <option value="all">全部状态</option>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="disabled">disabled</option>
                    <option value="expired">expired</option>
                    <option value="banned">banned</option>
                    <option value="error">error</option>
                    <option value="quota_exhausted">quota_exhausted</option>
                    <option value="refreshing">refreshing</option>
                    <option value="unknown">unknown</option>
                  </select>
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}
                    className={inputClass}
                  >
                    <option value="all">全部来源</option>
                    <option value="manual">manual</option>
                    <option value="codexproxy">codexproxy（codex2api 项目）</option>
                    <option value="cpa">CPA</option>
                    <option value="sub2api">sub2api</option>
                  </select>
                  <button onClick={selectAllVisible} className={secondaryButton}>
                    全选当前
                  </button>
                  <button onClick={() => setSelectedIds([])} className={secondaryButton}>
                    清空
                  </button>
                </div>
              </div>

              <div className="neon-divider mt-5 h-px" />

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">Visible</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-white">{accounts.length}</p>
                </div>
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">Selected</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-white">{selectedIds.length}</p>
                </div>
                <div className="data-strip rounded-2xl px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">Source</p>
                  <p className="mt-1 font-mono text-sm text-cyan-100">{sourceFilter === "all" ? "ALL" : sourceFilter}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.6rem] border border-cyan-200/12 bg-slate-950/34">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-cyan-950/95 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                      <tr>
                        <th className="px-4 py-3">选</th>
                        <th className="px-4 py-3">标签 / 邮箱</th>
                        <th className="px-4 py-3">来源</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">Token</th>
                        <th className="px-4 py-3">标识</th>
                        <th className="px-4 py-3">同步</th>
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
                                  <p className="max-w-[260px] text-xs text-slate-500">{account.notes}</p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1">
                                <span className="inline-flex rounded-full border border-cyan-200/14 bg-cyan-300/8 px-2.5 py-1 font-mono text-xs text-cyan-100">
                                  {account.sourceType}
                                </span>
                                <p className="text-xs text-slate-500">
                                  {account.hasRefreshToken ? "支持续期" : "无 refresh"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-2">
                                <span
                                  className={clsx(
                                    "inline-flex rounded-full border px-2.5 py-1 text-xs",
                                    statusTone[account.status],
                                  )}
                                >
                                  {account.status}
                                </span>
                                <p className="text-xs text-slate-500">远端: {account.remoteStatus || "未记录"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1">
                                <p className="font-mono text-xs text-slate-300">{account.tokenPreview}</p>
                                <p className="text-xs text-slate-500">{account.planType || "未知 plan"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1 font-mono text-xs text-slate-400">
                                <p>acc: {account.accountId || "-"}</p>
                                <p>user: {account.userId || "-"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1 text-xs text-slate-500">
                                <p>导入: {formatTime(account.lastImportedAt)}</p>
                                <p>状态: {formatTime(account.lastStatusCheckedAt)}</p>
                                <p>推送: {formatTime(account.lastPushedAt)}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex flex-wrap gap-2">
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
                                  onClick={() =>
                                    runTask(() =>
                                      callApi(`/api/accounts/${account.id}`, {
                                        method: "DELETE",
                                      }),
                                    )
                                  }
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
              </section>
            ) : null}

            {activeView === "activity" ? (
              <section id="activity" className={panelClass}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Activity</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    最近动作
                  </h2>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-400">
                  {isPending ? <RefreshCw className="h-4 w-4 animate-spin text-cyan-200" /> : null}
                  <span>{isPending ? "处理中" : "空闲"}</span>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {data.logs.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                    还没有操作记录。
                  </div>
                ) : null}
                {data.logs.map((log) => (
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
                        <h3 className="text-sm font-medium text-slate-100">{log.title}</h3>
                        <p className="text-sm text-slate-400">{log.detail}</p>
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
