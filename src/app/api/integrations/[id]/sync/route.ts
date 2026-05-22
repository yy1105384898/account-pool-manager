import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  addActivityLog,
  getIntegrationById,
  upsertImportedAccounts,
} from "@/lib/server/db";
import { importAccountsFromIntegration } from "@/lib/server/connectors";

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
    const remoteAccounts = await importAccountsFromIntegration(integration);
    const summary = upsertImportedAccounts(integration, remoteAccounts);
    addActivityLog(
      "integration_sync",
      "success",
      "导入完成",
      `${integration.name}: 新增 ${summary.created}，更新 ${summary.updated}，跳过 ${summary.skipped}`,
      { integrationId: id, ...summary },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    addActivityLog(
      "integration_sync",
      "error",
      "导入失败",
      `${integration.name}: ${message}`,
      { integrationId: id },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
