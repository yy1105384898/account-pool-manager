import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addActivityLog, deleteIntegration, getIntegrationById } from "@/lib/server/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const integration = getIntegrationById(id);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
  }

  deleteIntegration(id);
  addActivityLog(
    "integration_delete",
    "info",
    "连接已删除",
    `${integration.name} 已从系统移除`,
    { type: integration.type },
  );
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
