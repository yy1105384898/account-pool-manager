import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";

function base64Url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const proxyUrl = typeof payload.proxyUrl === "string" ? payload.proxyUrl.trim() : "";
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(24));
  const redirectUri = "com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback";
  const authorizeUrl = new URL("https://auth.openai.com/authorize");

  authorizeUrl.searchParams.set("client_id", "TdJIcbe16WoTHtN95nyywh5E4yOo6ItG");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("audience", "https://api.openai.com/v1");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.json({
    ok: true,
    authorizeUrl: authorizeUrl.toString(),
    verifier,
    state,
    proxyUrl,
    message: "授权链接已生成，登录后把回调链接或 code 粘贴回来导入",
  });
}
