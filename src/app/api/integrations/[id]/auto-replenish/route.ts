import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { addActivityLog, getAutoReplenishRuleByIntegrationId, getIntegrationById, listAutoReplenishRuns } from "@/lib/server/db";
import { saveAutoReplenishRule } from "@/lib/server/auto-replenish";
import { autoReplenishRuleSchema } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const integration = getIntegrationById(id);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
  }

  const rule = getAutoReplenishRuleByIntegrationId(id);
  const runs = listAutoReplenishRuns(80).filter((item) => item.integrationId === id);
  return NextResponse.json({ ok: true, rule, runs });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const integration = getIntegrationById(id);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
  }

  try {
    const payload = autoReplenishRuleSchema.parse(await request.json());
    const rule = saveAutoReplenishRule(id, payload);
    const message = rule.enabled
      ? `规则已保存；不会立即执行，下次自动检查约在 ${rule.intervalMinutes} 分钟后。`
      : "自动补号已关闭。";

    addActivityLog(
      "auto_replenish_rule",
      "info",
      "自动补号规则已更新",
      `${integration.name}: ${message}`,
      { integrationId: id, rule },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, rule, message });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "保存失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
