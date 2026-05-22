"use client";

import { useDeferredValue, useRef, useState, useTransition } from "react";
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
  Gauge,
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
  DashboardData,
  IntegrationType,
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

const platformCards = [
  {
    value: "sub2api" as IntegrationType,
    title: "sub2api",
    subtitle: "账户数据 / codex-session 导入",
  },
  {
    value: "cpa" as IntegrationType,
    title: "CPA",
    subtitle: "兼容 codexproxy 接口",
  },
  {
    value: "codexproxy" as IntegrationType,
    title: "codexproxy",
    subtitle: "codex2api 项目",
  },
];

const importModeLabels: Record<"refresh" | "access" | "apiKey" | "oauth" | "json", string> = {
  refresh: "Refresh Token",
  access: "Access Token",
  apiKey: "API Key",
  oauth: "OAuth 授权",
  json: "JSON 导入",
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

export default function DashboardClient({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | AccountViewModel["sourceType"]>("all");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showIntegrationForm, setShowIntegrationForm] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<IntegrationType>("sub2api");
  const [accountImportMode, setAccountImportMode] = useState<"refresh" | "access" | "apiKey" | "oauth" | "json">("refresh");
  const [accountImportText, setAccountImportText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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
    const payload = {
      name: String(formData.get("name") || ""),
      type: String(formData.get("type") || selectedPlatform) as IntegrationType,
      baseUrl: String(formData.get("baseUrl") || ""),
      authMode: "bearer" as const,
      authValue: String(formData.get("authValue") || ""),
      authHeaderName: "",
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-7 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <nav className="command-bar sticky top-4 z-30 flex flex-col gap-3 rounded-[1.6rem] px-4 py-3 text-sm text-slate-200 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.20)]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">
                Command Center
              </p>
              <p className="text-sm font-medium text-white">号池控制台 · Docker / Cloud Ready</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-cyan-100">
              <Network className="h-3.5 w-3.5" /> 端口 3015
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-blue-100">
              <PlugZap className="h-3.5 w-3.5" /> sub2api · CPA · codexproxy
            </span>
            <span className="command-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-amber-100">
              <Activity className="h-3.5 w-3.5" /> 风险 {warningRate}%
            </span>
          </div>
        </nav>

        <header className="cyber-card matrix-glow relative rounded-[2.4rem] p-5 sm:p-7 lg:p-9">
          <div className="hero-orb" />
          <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(500px,0.92fr)] xl:items-stretch">
            <div className="flex min-h-[320px] flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-3 rounded-full border border-cyan-200/28 bg-cyan-300/14 px-4 py-2.5 text-xs text-cyan-100 shadow-[0_0_45px_rgba(34,211,238,0.18)]">
                  <Sparkles className="h-4 w-4 text-cyan-200" />
                  <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
                  <span className="font-mono uppercase tracking-[0.24em]">Account Pool Control</span>
                </div>

                <div className="space-y-4">
                  <h1 className="laser-text max-w-4xl text-5xl font-semibold tracking-[-0.085em] sm:text-6xl lg:text-7xl">
                    号池管理系统
                  </h1>
                  <p className="max-w-3xl text-base leading-8 text-slate-200 sm:text-lg">
                    以本地号池为核心，统一接入 <code className="font-mono text-cyan-100">sub2api</code>、<code className="font-mono text-cyan-100">CPA</code> 与 <code className="font-mono text-cyan-100">codexproxy</code>（codex2api 源码项目），完成账号导入、状态巡检、筛选选择与远端推送。界面已升级为深色科技感控制台，更适合云服务器与 Docker 部署场景。
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MiniStatus label="server port" value="3015" />
                <MiniStatus label="data volume" value="/app/data" />
                <MiniStatus label="proxy ready" value="Lucky" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                extra="codexproxy(codex2api) / sub2api / CPA"
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
                label="部署形态"
                value="Docker"
                extra="云端稳定运行"
                tone="bg-teal-400/25"
              />
            </div>
          </div>
        </header>

        {notice ? (
          <div
            className={clsx(
              "rounded-[1.3rem] border px-4 py-3 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur",
              notice.type === "success"
                ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                : "border-rose-300/25 bg-rose-400/12 text-rose-100",
            )}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="grid gap-6 2xl:grid-cols-[430px_minmax(0,1fr)]">
          <aside className="space-y-6 2xl:sticky 2xl:top-28 2xl:self-start">
            <section className={panelClass}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className={sectionTitleClass}>Auto Refill</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">
                    自动补池连接设置
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    只维护一套当前生效连接，保存后提取推送和自动补池都会使用。
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
                    name="name"
                    placeholder="连接名称，可不填"
                    defaultValue={selectedPlatform === "sub2api" ? "sub2api" : selectedPlatform === "cpa" ? "CPA" : "codexproxy"}
                    className={inputClass}
                  />
                  <input
                    name="baseUrl"
                    placeholder="服务器地址，例如 http://127.0.0.1:8080"
                    className={inputClass}
                  />
                  <input
                    name="authValue"
                    placeholder="管理员 Key / API Key / 密码"
                    className={inputClass}
                  />
                  <textarea name="notes" placeholder="备注，可不填" rows={2} className={inputClass} />
                  <button disabled={isPending} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-950 transition hover:bg-cyan-100 disabled:opacity-60">
                    保存连接
                  </button>
                </form>
              ) : null}

              <div className="space-y-3">
                {data.integrations.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-cyan-200/14 bg-white/[0.025] px-4 py-6 text-sm text-slate-400">
                    先添加一个远端连接。支持 sub2api、CPA、codexproxy（codex2api 源码项目），系统会在这里显示连通状态、鉴权方式和同步时间。
                  </div>
                ) : null}

                {data.integrations.map((integration) => (
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
                      <p>最近同步: {formatTime(integration.lastSyncedAt)}</p>
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
                        onClick={() =>
                          runTask(() =>
                            callApi(`/api/integrations/${integration.id}/sync`, {
                              method: "POST",
                            }),
                          )
                        }
                        className={primaryButton}
                      >
                        导入
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
                  </article>
                ))}
              </div>
            </section>

            <section className={panelClass}>
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
          </aside>

          <main className="space-y-6">
            <section className={panelClass}>
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

            <section className={panelClass}>
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
          </main>
        </div>

        <footer className="cyber-card matrix-glow grid gap-3 rounded-[1.8rem] p-5 text-sm text-slate-400 md:grid-cols-4">
          <div className="rounded-[1.2rem] border border-cyan-200/12 bg-slate-950/34 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/62">
              codexproxy
            </p>
            <p>codex2api 项目的平台类型就是 codexproxy。</p>
            <p>导入 <code className="font-mono text-cyan-100">/auth/accounts/export?format=full</code>，推送 <code className="font-mono text-cyan-100">/auth/accounts/import</code>。</p>
          </div>
          <div className="rounded-[1.2rem] border border-cyan-200/12 bg-slate-950/34 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/62">
              CPA
            </p>
            <p>按 codexproxy 兼容接口读取和推送账号。</p>
            <p>适合 CPA 管理地址与 Management Key。</p>
          </div>
          <div className="rounded-[1.2rem] border border-cyan-200/12 bg-slate-950/34 p-4">
            <p>导入用 <code className="font-mono text-cyan-100">/api/v1/admin/accounts/data</code>。</p>
            <p>推送用 <code className="font-mono text-cyan-100">/api/v1/admin/accounts/import/codex-session</code>。</p>
          </div>
          <div className="rounded-[1.2rem] border border-cyan-200/12 bg-slate-950/34 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/62">
              cloud
            </p>
            <p>Docker 已预留数据卷和独立端口。</p>
            <p>现有 Lucky 可直接做反代。</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
