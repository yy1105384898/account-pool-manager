import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  addActivityLog,
  getIntegrationById,
  updateIntegrationHealth,
} from "@/lib/server/db";
import { testIntegrationConnection } from "@/lib/server/connectors";

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
    const result = await testIntegrationConnection(integration);
    updateIntegrationHealth(id, "success", result.message);
    addActivityLog(
      "integration_test",
      "success",
      "连接测试成功",
      `${integration.name}: ${result.message}`,
      { integrationId: id },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接失败";
    updateIntegrationHealth(id, "error", message);
    addActivityLog(
      "integration_test",
      "error",
      "连接测试失败",
      `${integration.name}: ${message}`,
      { integrationId: id },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
