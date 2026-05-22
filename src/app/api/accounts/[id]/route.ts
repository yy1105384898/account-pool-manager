import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { accountPatchSchema } from "@/lib/types";
import { addActivityLog, deleteAccount, updateAccount } from "@/lib/server/db";
import type { AccountPatchInput } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const accountPatchFieldLabels: Record<keyof AccountPatchInput, string> = {
  label: "标签",
  planType: "套餐",
  notes: "备注",
  status: "状态",
};

function changedPatchKeys(payload: AccountPatchInput) {
  return (Object.keys(payload) as Array<keyof AccountPatchInput>).filter(
    (key) => payload[key] !== undefined,
  );
}

function buildAccountUpdateLog(id: string, payload: AccountPatchInput) {
  const changedKeys = changedPatchKeys(payload);
  const statusOnly = changedKeys.length === 1 && payload.status !== undefined;

  if (statusOnly) {
    if (payload.status === "disabled") {
      return {
        title: "账号已停用",
        detail: `账号 ${id} 已停用`,
      };
    }
    if (payload.status === "active") {
      return {
        title: "账号已启用",
        detail: `账号 ${id} 已启用`,
      };
    }
    return {
      title: "账号状态已更新",
      detail: `账号 ${id} 状态已更新为 ${payload.status}`,
    };
  }

  const changedFields = changedKeys.map((key) => accountPatchFieldLabels[key]).join("、");
  return {
    title: "账号资料已更新",
    detail: `账号 ${id} 已更新：${changedFields}`,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = accountPatchSchema.parse(await request.json());
    if (changedPatchKeys(payload).length === 0) {
      return NextResponse.json({ ok: false, error: "没有需要更新的内容" }, { status: 400 });
    }

    const result = updateAccount(id, payload);
    if (!result) {
      return NextResponse.json({ ok: false, error: "账号不存在" }, { status: 404 });
    }

    const log = buildAccountUpdateLog(id, payload);
    addActivityLog(
      "account_update",
      "info",
      log.title,
      log.detail,
      { accountId: id, status: payload.status ?? null },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "更新失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  deleteAccount(id);
  addActivityLog(
    "account_delete",
    "info",
    "账号已删除",
    `账号 ${id} 已从本地号池移除`,
    { accountId: id },
  );
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
