import { NextResponse } from "next/server";
import { getIntegrationById } from "@/lib/server/db";
import { readIntegrationAccountTemplate } from "@/lib/server/connectors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const integration = getIntegrationById(id);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
  }

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "请填写模板账号 ID" }, { status: 400 });
  }

  try {
    const template = await readIntegrationAccountTemplate(integration, accountId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "未找到模板账号，或该中转站暂不支持读取模板" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取模板失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
