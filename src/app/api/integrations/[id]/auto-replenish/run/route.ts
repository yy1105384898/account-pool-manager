import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getIntegrationById } from "@/lib/server/db";
import { runAutoReplenishForIntegration } from "@/lib/server/auto-replenish";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const integration = getIntegrationById(id);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
  }

  try {
    const result = await runAutoReplenishForIntegration(id, {
      force: true,
      triggerSource: "manual",
    });
    revalidatePath("/");
    return NextResponse.json({ ok: true, result, message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "执行失败";
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
