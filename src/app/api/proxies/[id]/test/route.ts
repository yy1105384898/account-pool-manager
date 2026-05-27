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
  origin?: string;
  country?: string;
  country_name?: string;
  region?: string;
  regionName?: string;
  city?: string;
  message?: string;
};

function withinTimeout<T>(request: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    request.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function readGeoLocation(payload: ProxyGeoPayload | null) {
  if (!payload) return { ip: null, location: null };
  if (payload.success === false || payload.status === "fail") {
    return { ip: null, location: null };
  }
  const ip = payload.ip ?? payload.query ?? payload.origin?.split(",")[0]?.trim() ?? null;
  const location = [payload.country_name ?? payload.country, payload.regionName ?? payload.region, payload.city]
    .filter((item): item is string => Boolean(item))
    .join("·");
  return {
    ip,
    location: location || null,
  };
}

async function detectProxyGeo(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  const started = Date.now();
  const response = await withinTimeout(
    fetchViaProxy(
      "http://ip-api.com/json/?lang=zh-CN",
      {
        cache: "no-store",
        headers: { "User-Agent": "account-pool-manager/1.0" },
        timeoutMs: 5000,
        signal: AbortSignal.timeout(5000),
      },
      proxy,
    ),
    5000,
    "地区检测超时",
  );
  if (!response.ok) {
    throw new Error(`地区接口返回 ${response.status}`);
  }
  const payload = (await response.json().catch(() => null)) as ProxyGeoPayload | null;
  const result = readGeoLocation(payload);
  if (!result.ip) {
    throw new Error(payload?.message || "地区接口未返回出口 IP");
  }
  return { ...result, latencyMs: Date.now() - started };
}

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const proxy = getProxyById(id);
  if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });

  try {
    const geo = await detectProxyGeo(proxy);
    updateProxy(id, {
      lastTestStatus: "success",
      lastTestMessage: geo.location ? `出口 ${geo.location}` : "已获取出口 IP",
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
      message: `地区已识别，${geo.location ?? "地区未返回"}，延迟 ${geo.latencyMs}ms`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    const message = `地区检测失败：${detail}`;
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
