import { NextResponse } from "next/server";
import { authCookieName, getAdminPassword, getAdminSessionToken } from "@/lib/server/auth";
import { setStoredAdminPassword } from "@/lib/server/db";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword.trim() : "";

  if (currentPassword !== getAdminPassword()) {
    return NextResponse.json({ ok: false, error: "当前密码错误" }, { status: 401 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "新密码至少 6 位" }, { status: 400 });
  }

  setStoredAdminPassword(newPassword);
  const response = NextResponse.json({ ok: true, message: "管理员密码已修改" });
  response.cookies.set(authCookieName, getAdminSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
