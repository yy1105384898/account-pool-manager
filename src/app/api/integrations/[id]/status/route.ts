import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  addActivityLog,
  getAccountsByIds,
  getIntegrationById,
  listPushedAccountStatesByIntegration,
  updateIntegrationHealth,
  updateIntegrationRemoteStatusSummary,
} from "@/lib/server/db";
import { probeIntegrationAccounts, readIntegrationRemoteStatus } from "@/lib/server/connectors";
import { verifyPushedAccountsOnIntegration } from "@/lib/server/push-verification";

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
    const pushedAccounts = getAccountsByIds(
      listPushedAccountStatesByIntegration(integration.id).map((item) =>
        String(item.account_id),
      ),
    );
    const probe = await probeIntegrationAccounts(integration);
    if (pushedAccounts.length > 0) {
      await verifyPushedAccountsOnIntegration(integration, pushedAccounts);
    }
    const summary = await readIntegrationRemoteStatus(integration);
    updateIntegrationRemoteStatusSummary(integration.id, summary);
    updateIntegrationHealth(integration.id, "success", `读取成功，远端账号 ${summary.totalAccounts} 个`);
    addActivityLog(
      "integration_status",
      "success",
      "远端状态已刷新",
      `${integration.name}: ${probe.message}；账号 ${summary.totalAccounts}，正常 ${summary.normalAccounts}`,
      { integrationId: id, summary },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取状态失败";
    updateIntegrationHealth(integration.id, "error", message);
    addActivityLog(
      "integration_status",
      "error",
      "远端状态读取失败",
      `${integration.name}: ${message}`,
      { integrationId: id },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
