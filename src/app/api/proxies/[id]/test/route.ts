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

const CODEX_TARGET_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_TRACE_URL = "https://chatgpt.com/cdn-cgi/trace";

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

function parseTrace(body: string) {
  const fields = Object.fromEntries(
    body
      .split(/\r?\n/)
      .flatMap((line) => {
        const separator = line.indexOf("=");
        return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
      }),
  );
  const ip = fields.ip?.trim() || null;
  const location = [fields.loc, fields.colo].filter(Boolean).join("-");
  return { ip, location: location || null };
}

async function detectCodexLatency(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  const started = Date.now();
  const response = await fetchViaProxy(
    CODEX_TARGET_URL,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer proxy-connectivity-test",
        "Content-Type": "application/json",
        "User-Agent": "codex_cli_rs/0.132.0",
        Originator: "codex_cli_rs",
      },
      body: JSON.stringify({ model: "gpt-5.2", input: [], stream: false, store: false }),
      signal: AbortSignal.timeout(15000),
    },
    proxy,
  );
  if (response.status >= 500) {
    throw new Error(`Codex 目标返回 ${response.status}`);
  }
  return Date.now() - started;
}

async function detectProxyGeo(proxy: NonNullable<ReturnType<typeof getProxyById>>) {
  try {
    const response = await fetchViaProxy(
      CODEX_TRACE_URL,
      {
        cache: "no-store",
        headers: { "User-Agent": "codex_cli_rs/0.132.0" },
        signal: AbortSignal.timeout(10000),
      },
      proxy,
    );
    if (response.ok) {
      const trace = parseTrace(await response.text());
      if (trace.ip) return trace;
    }
  } catch {
    // Fall back to public IP services only for location metadata.
  }

  for (const url of [
    "https://ipinfo.io/json",
    "https://ipwho.is/?lang=zh-CN",
    "http://ip-api.com/json/?lang=zh-CN",
    "https://ipapi.co/json/",
    "https://api64.ipify.org?format=json",
  ]) {
    try {
      const response = await fetchViaProxy(
        url,
        {
          cache: "no-store",
          headers: { "User-Agent": "account-pool-manager/1.0" },
          signal: AbortSignal.timeout(15000),
        },
        proxy,
      );
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json().catch(() => null)) as ProxyGeoPayload | null;
      const result = readGeoLocation(payload);
      if (result.ip) return result;
    } catch {
      // Location failure must not override an available Codex target.
    }
  }
  return { ip: null, location: null };
}

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const proxy = getProxyById(id);
  if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });

  try {
    const latencyMs = await detectCodexLatency(proxy);
    const geo = await detectProxyGeo(proxy);
    updateProxy(id, {
      lastTestStatus: "success",
      lastTestMessage: geo.location ? `Codex 可用，出口 ${geo.location}` : "Codex 目标可用",
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
      message: `Codex 目标可用，${geo.location ?? "地区未返回"}，延迟 ${latencyMs}ms`,
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
