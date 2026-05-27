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

const PROXY_HEALTH_CHECK_URL = "http://www.google.com/generate_204";

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

async function checkProxyHealth(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  const started = Date.now();
  const response = await withinTimeout(
    fetchViaProxy(
      PROXY_HEALTH_CHECK_URL,
      {
        method: "HEAD",
        cache: "no-store",
        headers: { "User-Agent": "account-pool-manager/1.0" },
        redirect: "manual",
        timeoutMs: 10000,
        signal: AbortSignal.timeout(10000),
      },
      proxy,
    ),
    10000,
    "代理健康检测超时",
  );
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`健康检测返回 ${response.status}`);
  }
  return Date.now() - started;
}

async function detectProxyGeo(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  try {
    const response = await withinTimeout(
      fetchViaProxy(
        "http://ip-api.com/json/?lang=zh-CN",
        {
          cache: "no-store",
          headers: { "User-Agent": "account-pool-manager/1.0" },
          timeoutMs: 2500,
          signal: AbortSignal.timeout(2500),
        },
        proxy,
      ),
      2500,
      "代理出口检测超时",
    );
    if (!response.ok) return { ip: null, location: null };
    const payload = (await response.json().catch(() => null)) as ProxyGeoPayload | null;
    return readGeoLocation(payload);
  } catch {
    // 地区/IP 只用于展示，不能覆盖 generate_204 的代理健康结果。
    return { ip: null, location: null };
  }
}

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const proxy = getProxyById(id);
  if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });

  try {
    const latencyMs = await checkProxyHealth(proxy);
    const geo = await detectProxyGeo(proxy);
    updateProxy(id, {
      lastTestStatus: "success",
      lastTestMessage: geo.location ? `出口 ${geo.location}` : "代理可用",
      lastLatencyMs: latencyMs,
      lastTestIp: geo.ip,
      lastTestLocation: geo.location,
    });
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      latencyMs,
      ip: geo.ip,
      location: geo.location,
      message: `代理可用，${geo.location ?? "地区未返回"}，延迟 ${latencyMs}ms`,
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
