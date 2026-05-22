import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProxyPoolEnabled, setProxyPoolEnabled } from "@/lib/server/db";

export async function GET() {
  return NextResponse.json({ ok: true, proxyPoolEnabled: getProxyPoolEnabled() });
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  const enabled = payload?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "代理池开关参数不正确" }, { status: 400 });
  }

  setProxyPoolEnabled(enabled);
  revalidatePath("/");
  return NextResponse.json({
    ok: true,
    proxyPoolEnabled: enabled,
    message: enabled ? "代理池轮询已启用" : "代理池已停用",
  });
}
