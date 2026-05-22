import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { deleteProxy, getProxyById, updateProxy } from "@/lib/server/db";
import { proxyInputSchema } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const input = proxyInputSchema.partial().parse(await request.json());
    const proxy = updateProxy(id, input);
    if (!proxy) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });
    revalidatePath("/");
    return NextResponse.json({ ok: true, proxy, message: "代理已更新" });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "更新失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getProxyById(id)) return NextResponse.json({ ok: false, error: "代理不存在" }, { status: 404 });
  deleteProxy(id);
  revalidatePath("/");
  return NextResponse.json({ ok: true, message: "代理已删除" });
}
