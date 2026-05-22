import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  addActivityLog,
  createIntegration,
  updateIntegrationHealth,
} from "@/lib/server/db";
import { integrationInputSchema } from "@/lib/types";
import { testIntegrationConnection } from "@/lib/server/connectors";

export async function POST(request: Request) {
  try {
    const rawPayload = (await request.json()) as { testAfterCreate?: boolean } & Record<string, unknown>;
    const payload = integrationInputSchema.parse(rawPayload);
    const integration = createIntegration(payload);
    if (!integration) {
      return NextResponse.json({ ok: false, error: "创建失败" }, { status: 400 });
    }

    let testMessage: string | null = null;
    if (rawPayload.testAfterCreate) {
      try {
        const testResult = await testIntegrationConnection(integration);
        testMessage = testResult.message;
        updateIntegrationHealth(integration.id, "success", testMessage);
      } catch (error) {
        testMessage = error instanceof Error ? error.message : "测试失败";
        updateIntegrationHealth(integration.id, "error", testMessage);
      }
    }

    addActivityLog(
      "integration_create",
      "success",
      "新增连接成功",
      `${payload.name} 已加入连接池${testMessage ? `；测试结果：${testMessage}` : ""}`,
      { type: payload.type, testMessage },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, integration, message: testMessage ?? undefined });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "创建失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
