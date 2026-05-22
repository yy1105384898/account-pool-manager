import { NextResponse } from "next/server";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
  const baseUrl = typeof payload.baseUrl === "string" && payload.baseUrl.trim()
    ? payload.baseUrl.trim().replace(/\/+$/, "")
    : "https://api.openai.com";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "API Key 不能为空" }, { status: 400 });
  }

  const response = await fetchViaProxy(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: "读取 /v1/models 失败" }, { status: response.status });
  }

  const models = Array.isArray(data?.data)
    ? data.data.flatMap((item) => (typeof item.id === "string" ? [item.id] : []))
    : [];

  return NextResponse.json({ ok: true, models, message: `已读取 ${models.length} 个模型` });
}
