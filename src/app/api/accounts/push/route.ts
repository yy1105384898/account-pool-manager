import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  addActivityLog,
  getAccountsByIds,
  getIntegrationById,
  markAccountsPushed,
  recordAccountsPushedToIntegration,
} from "@/lib/server/db";
import { pushRequestSchema } from "@/lib/types";
import { pushAccountsToIntegration } from "@/lib/server/connectors";

export async function POST(request: Request) {
  try {
    const payload = pushRequestSchema.parse(await request.json());
    const integration = getIntegrationById(payload.integrationId);
    if (!integration) {
      return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
    }

    const accounts = getAccountsByIds(payload.accountIds);
    if (accounts.length === 0) {
      return NextResponse.json({ ok: false, error: "未找到可推送账号" }, { status: 404 });
    }

    const result = await pushAccountsToIntegration(integration, accounts, {
      targetGroups: payload.targetGroups ?? [],
      cloneAccountId: payload.cloneAccountId || null,
      pushNotes: payload.pushNotes || null,
    });
    markAccountsPushed(accounts.map((item) => item.id));
    recordAccountsPushedToIntegration(
      integration.id,
      accounts.map((item) => item.id),
    );
    addActivityLog(
      "account_push",
      "success",
      "账号推送完成",
      `${integration.name}: ${result.message}`,
      { integrationId: integration.id, pushed: result.pushed },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "推送失败";
    addActivityLog(
      "account_push",
      "error",
      "账号推送失败",
      message,
    );
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
