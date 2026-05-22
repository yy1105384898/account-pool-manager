import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProxyById, updateProxy } from "@/lib/server/db";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProxyGeoPayload = {
  success?: boolean;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
};

function readGeoLocation(payload: ProxyGeoPayload | null) {
  if (!payload?.success) return { ip: null, location: null };
  const location = [payload.country, payload.region, payload.city]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
  return {
    ip: payload.ip ?? null,
    location: location || null,
  };
}

async function detectProxyGeo(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  try {
    const response = await fetchViaProxy("https://ipwho.is/?lang=zh-CN", {
      cache: "no-store",
    }, proxy);
    if (!response.ok) return { ip: null, location: null };
    const payload = (await response.json().catch(() => null)) as ProxyGeoPayload | null;
    return readGeoLocation(payload);
  } catch {
    return { ip: null, location: null };
  }
}

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
    const geo = ok ? await detectProxyGeo(proxy) : { ip: null, location: null };
    updateProxy(id, {
      lastTestStatus: ok ? "success" : "error",
      lastTestMessage: geo.location
        ? `OpenAI 返回 ${response.status}，出口 ${geo.location}`
        : `OpenAI 返回 ${response.status}`,
      lastLatencyMs: latency,
      lastTestIp: geo.ip,
      lastTestLocation: geo.location,
    });
    revalidatePath("/");
    return NextResponse.json({
      ok,
      latencyMs: latency,
      ip: geo.ip,
      location: geo.location,
      message: ok
        ? `代理可用，${geo.location ?? "地区未返回"}，延迟 ${latency}ms`
        : `代理异常，OpenAI 返回 ${response.status}`,
    }, { status: ok ? 200 : 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    const message = `代理连接失败：${detail}`;
    updateProxy(id, {
      lastTestStatus: "error",
      lastTestMessage: message,
      lastLatencyMs: Date.now() - started,
      lastTestIp: null,
      lastTestLocation: null,
    });
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
