"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "登录失败");
        return;
      }
      router.replace(searchParams.get("next") || "/");
      router.refresh();
    });
  }

  return (
    <main className="cyber-shell flex min-h-screen items-center justify-center px-4 py-10 text-slate-100">
      <form
        onSubmit={submitLogin}
        className="cyber-card matrix-glow w-full max-w-[440px] rounded-[1.8rem] border border-cyan-200/18 bg-slate-950/78 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/15 text-cyan-100">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100/65">
              Admin
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.055em] text-white">
              管理员登录
            </h1>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-300">
          管理员密码
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/70" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoFocus
              className="neon-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm placeholder:text-slate-500"
              placeholder="请输入管理员密码"
            />
          </div>
        </label>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <button
          disabled={isPending || !password}
          className="mt-5 w-full rounded-2xl border border-cyan-200/40 bg-cyan-300/90 px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200 disabled:opacity-55"
        >
          {isPending ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
