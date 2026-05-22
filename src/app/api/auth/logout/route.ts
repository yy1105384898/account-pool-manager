import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/server/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "已退出登录" });
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
