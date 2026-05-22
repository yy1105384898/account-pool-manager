import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProxyById, updateProxy } from "@/lib/server/db";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const proxy = getProxyById(id);
  if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });

  const started = Date.now();
  try {
    const response = await fetchViaProxy("https://api.openai.com/v1/models", {
      headers: { Authorization: "Bearer invalid-proxy-test-key" },
      cache: "no-store",
    }, proxy);
    const latency = Date.now() - started;
    const ok = response.status === 401 || response.status === 403 || response.status === 200;
    updateProxy(id, {
      lastTestStatus: ok ? "success" : "error",
      lastTestMessage: `OpenAI 返回 ${response.status}`,
      lastLatencyMs: latency,
    });
    revalidatePath("/");
    return NextResponse.json({
      ok,
      latencyMs: latency,
      message: ok ? `代理可用，延迟 ${latency}ms` : `代理异常，OpenAI 返回 ${response.status}`,
    }, { status: ok ? 200 : 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    const message = `代理连接失败：${detail}`;
    updateProxy(id, { lastTestStatus: "error", lastTestMessage: message, lastLatencyMs: Date.now() - started });
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
