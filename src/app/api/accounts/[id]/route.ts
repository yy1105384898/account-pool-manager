import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { accountPatchSchema } from "@/lib/types";
import { addActivityLog, deleteAccount, updateAccount } from "@/lib/server/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = accountPatchSchema.parse(await request.json());
    const result = updateAccount(id, payload);
    if (!result) {
      return NextResponse.json({ ok: false, error: "账号不存在" }, { status: 404 });
    }

    addActivityLog(
      "account_update",
      "info",
      "账号已更新",
      `账号 ${id} 的状态/备注已更新`,
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
