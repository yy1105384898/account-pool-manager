import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProxyById, updateProxy } from "@/lib/server/db";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProxyGeoPayload = {
  success?: boolean;
  status?: string;
  ip?: string;
  query?: string;
  country?: string;
  region?: string;
  regionName?: string;
  city?: string;
};

function readGeoLocation(payload: ProxyGeoPayload | null) {
  if (!payload?.success && payload?.status !== "success") {
    return { ip: null, location: null };
  }
  const location = [payload.country, payload.regionName ?? payload.region, payload.city]
    .filter((item): item is string => Boolean(item))
    .join("·");
  return {
    ip: payload.ip ?? payload.query ?? null,
    location: location || null,
  };
}

async function detectProxyGeo(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  let lastError = "代理出口检测失败";
  for (const url of [
    "http://ip-api.com/json/?lang=zh-CN",
    "https://ipinfo.io/json",
    "https://ipwho.is/?lang=zh-CN",
  ]) {
    const started = Date.now();
    try {
      const response = await fetchViaProxy(url, { cache: "no-store" }, proxy);
      if (!response.ok) {
        lastError = `出口检测返回 ${response.status}`;
        continue;
      }
      const payload = (await response.json().catch(() => null)) as ProxyGeoPayload | null;
      const result = readGeoLocation(payload);
      if (result.ip || result.location) {
        return { ...result, latencyMs: Date.now() - started };
      }
      lastError = "出口检测未返回地区";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "代理出口检测失败";
    }
  }
  throw new Error(lastError);
}

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const proxy = getProxyById(id);
  if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });

  try {
    const geo = await detectProxyGeo(proxy);
    updateProxy(id, {
      lastTestStatus: "success",
      lastTestMessage: geo.location ? `出口 ${geo.location}` : "代理可用",
      lastLatencyMs: geo.latencyMs,
      lastTestIp: geo.ip,
      lastTestLocation: geo.location,
    });
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      latencyMs: geo.latencyMs,
      ip: geo.ip,
      location: geo.location,
      message: `代理可用，${geo.location ?? "地区未返回"}，延迟 ${geo.latencyMs}ms`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    const message = `代理测试失败：${detail}`;
    updateProxy(id, {
      lastTestStatus: "error",
      lastTestMessage: message,
      lastLatencyMs: null,
      lastTestIp: null,
      lastTestLocation: null,
    });
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
