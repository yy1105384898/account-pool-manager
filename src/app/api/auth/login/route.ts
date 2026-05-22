import { NextResponse } from "next/server";
import { authCookieName, getAdminPassword, getAdminSessionToken } from "@/lib/server/auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const password = typeof payload.password === "string" ? payload.password : "";

  if (password !== getAdminPassword()) {
    return NextResponse.json({ ok: false, error: "管理员密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, message: "登录成功" });
  response.cookies.set(authCookieName, getAdminSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
