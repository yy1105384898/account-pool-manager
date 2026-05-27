import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  addActivityLog,
  getAccountsByIds,
  getIntegrationById,
  listPushedAccountStatesByIntegration,
  markAccountsPushed,
  recordAccountsPushedToIntegration,
} from "@/lib/server/db";
import { pushRequestSchema } from "@/lib/types";
import {
  ensureAccountsPlacementOnIntegration,
  pushAccountsToIntegration,
} from "@/lib/server/connectors";
import {
  splitAccountsByIntegrationPresence,
  verifyPushedAccountsOnIntegration,
} from "@/lib/server/push-verification";

function readPushContext(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const accountIds = Array.isArray(record.accountIds)
    ? record.accountIds.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    integrationId: typeof record.integrationId === "string" ? record.integrationId : undefined,
    accountIds,
  };
}

export async function POST(request: Request) {
  let pushContext: { integrationId?: string; accountIds?: string[] } = {};
  try {
    const rawPayload = await request.json();
    pushContext = readPushContext(rawPayload);
    const payload = pushRequestSchema.parse(rawPayload);
    pushContext = {
      integrationId: payload.integrationId,
      accountIds: payload.accountIds,
    };
    const integration = getIntegrationById(payload.integrationId);
    if (!integration) {
      addActivityLog("account_push", "error", "账号推送失败", "连接不存在，未执行推送", {
        integrationId: payload.integrationId,
        requested: payload.accountIds.length,
      });
      return NextResponse.json({ ok: false, error: "连接不存在" }, { status: 404 });
    }

    const accounts = getAccountsByIds(payload.accountIds);
    if (accounts.length === 0) {
      addActivityLog("account_push", "error", "账号推送失败", "未找到可推送账号", {
        integrationId: integration.id,
        requestedAccountIds: payload.accountIds,
      });
      return NextResponse.json({ ok: false, error: "未找到可推送账号" }, { status: 404 });
    }

    addActivityLog("account_push", "info", "账号推送开始", `${integration.name}: 准备推送 ${accounts.length} 个账号`, {
      integrationId: integration.id,
      requested: accounts.length,
    });

    const pushOptions = {
      targetGroups: payload.targetGroups ?? [],
      planGroupMap: payload.planGroupMap ?? {},
      cloneAccountId: payload.cloneAccountId || null,
      pushNotes: payload.pushNotes || null,
    };
    const pushedState = new Set(
      listPushedAccountStatesByIntegration(integration.id).map((item) =>
        String(item.account_id),
      ),
    );
    const duplicateAccounts = accounts.filter((item) => pushedState.has(item.id));
    const duplicateCount = duplicateAccounts.length;
    const inactiveCount = accounts.filter((item) => item.status !== "active").length;
    const locallyPushableAccounts = accounts.filter(
      (item) => item.status === "active" && !pushedState.has(item.id),
    );

    if (locallyPushableAccounts.length === 0) {
      if (duplicateAccounts.length > 0) {
        const placementResult = await ensureAccountsPlacementOnIntegration(
          integration,
          duplicateAccounts,
          pushOptions,
        );
        const verificationResult = await verifyPushedAccountsOnIntegration(
          integration,
          duplicateAccounts,
        );
        const message = `所选账号已推送过 ${integration.name}，未重复推送；${placementResult.message}，已同步中转站状态，${verificationResult.message}`;
        addActivityLog("account_push", "info", "账号状态已同步", message, {
          integrationId: integration.id,
          skippedDuplicate: duplicateCount,
        });
        revalidatePath("/");
        return NextResponse.json({ ok: true, result: { pushed: 0, message }, message });
      }
      const message = `所选 ${accounts.length} 个账号没有可推送的正常库存号，跳过非正常 ${inactiveCount} 个`;
      addActivityLog("account_push", "error", "账号推送失败", message, {
        integrationId: integration.id,
        requested: accounts.length,
        skippedInactive: inactiveCount,
      });
      return NextResponse.json({ ok: false, error: "所选账号没有可推送的正常库存号" }, { status: 400 });
    }

    if (duplicateAccounts.length > 0) {
      await verifyPushedAccountsOnIntegration(integration, duplicateAccounts);
    }

    const presence = await splitAccountsByIntegrationPresence(
      integration,
      locallyPushableAccounts,
    );
    if (presence.present.length > 0) {
      recordAccountsPushedToIntegration(
        integration.id,
        presence.present.map((item) => item.id),
      );
      await ensureAccountsPlacementOnIntegration(
        integration,
        presence.present,
        pushOptions,
      );
      await verifyPushedAccountsOnIntegration(integration, presence.present);
    }

    const pushableAccounts = presence.missing;
    if (pushableAccounts.length === 0) {
      const message = `${presence.message}，已阻止重复推送并同步中转站状态`;
      addActivityLog("account_push", "info", "账号已存在中转站", message, {
        integrationId: integration.id,
        skippedRemoteDuplicate: presence.present.length,
      });
      revalidatePath("/");
      return NextResponse.json({ ok: true, result: { pushed: 0, message }, message });
    }

    let result: Awaited<ReturnType<typeof pushAccountsToIntegration>>;
    try {
      result = await pushAccountsToIntegration(integration, pushableAccounts, pushOptions);
    } catch (error) {
      const pushErrorMessage = error instanceof Error ? error.message : "未知错误";
      const afterErrorPresence = await splitAccountsByIntegrationPresence(
        integration,
        pushableAccounts,
      ).catch(() => null);
      const pushedAfterError = afterErrorPresence?.present ?? [];
      if (pushedAfterError.length > 0) {
        markAccountsPushed(pushedAfterError.map((item) => item.id));
        recordAccountsPushedToIntegration(
          integration.id,
          pushedAfterError.map((item) => item.id),
        );
        const message = `${integration.name}: 已在中转站确认 ${pushedAfterError.length}/${pushableAccounts.length} 个账号，后续分组/校验失败：${pushErrorMessage}`;
        addActivityLog("account_push", "success", "账号推送部分完成", message, {
          integrationId: integration.id,
          pushed: pushedAfterError.length,
          requested: pushableAccounts.length,
          postPushError: pushErrorMessage,
        });
        revalidatePath("/");
        return NextResponse.json({
          ok: true,
          result: { pushed: pushedAfterError.length, message },
          message,
        });
      }
      throw error;
    }
    markAccountsPushed(pushableAccounts.map((item) => item.id));
    recordAccountsPushedToIntegration(
      integration.id,
      pushableAccounts.map((item) => item.id),
    );
    let verificationMessage = "推送后校验未执行";
    try {
      const verificationResult = await verifyPushedAccountsOnIntegration(
        integration,
        pushableAccounts,
      );
      verificationMessage = verificationResult.message;
    } catch (error) {
      verificationMessage = `推送后校验失败：${error instanceof Error ? error.message : "未知错误"}`;
      addActivityLog("account_push_verify", "error", "推送后校验失败", verificationMessage, {
        integrationId: integration.id,
        accountIds: pushableAccounts.map((item) => item.id),
      });
    }
    const skippedText = [
      duplicateCount ? `跳过重复 ${duplicateCount} 个` : "",
      presence.present.length ? `跳过中转站已存在 ${presence.present.length} 个` : "",
      inactiveCount ? `跳过非正常 ${inactiveCount} 个` : "",
    ].filter(Boolean).join("，");
    const message = `${integration.name}: ${result.message}，${verificationMessage}${skippedText ? `，${skippedText}` : ""}`;
    addActivityLog(
      "account_push",
      "success",
      "账号推送完成",
      message,
      {
        integrationId: integration.id,
        pushed: result.pushed,
        skippedDuplicate: duplicateCount,
        skippedInactive: inactiveCount,
      },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, result, message });
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
      {
        integrationId: pushContext.integrationId,
        requested: pushContext.accountIds?.length,
      },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
