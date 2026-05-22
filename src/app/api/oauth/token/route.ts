import { NextResponse } from "next/server";

const clientId = "TdJIcbe16WoTHtN95nyywh5E4yOo6ItG";
const redirectUri = "com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback";

function extractCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code") ?? "";
  } catch {
    return trimmed;
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof payload.code === "string" ? extractCode(payload.code) : "";
  const verifier = typeof payload.verifier === "string" ? payload.verifier.trim() : "";

  if (!code || !verifier) {
    return NextResponse.json({ ok: false, error: "授权 code 或 verifier 为空" }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });

  const response = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || !data?.access_token) {
    return NextResponse.json(
      { ok: false, error: data?.error_description ?? data?.error ?? "OAuth 换取 token 失败" },
      { status: response.status || 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    idToken: data.id_token ?? "",
    message: "OAuth token 已获取",
  });
}
