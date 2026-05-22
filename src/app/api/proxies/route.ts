import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createProxy, listProxies } from "@/lib/server/db";
import { proxyInputSchema } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ ok: true, proxies: listProxies() });
}

export async function POST(request: Request) {
  try {
    const input = proxyInputSchema.parse(await request.json());
    const proxy = createProxy(input);
    revalidatePath("/");
    return NextResponse.json({ ok: true, proxy, message: "代理已添加" });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "添加失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
