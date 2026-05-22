import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { accountBulkStatusSchema } from "@/lib/types";
import { addActivityLog, updateAccountsStatus } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    const payload = accountBulkStatusSchema.parse(await request.json());
    const updated = updateAccountsStatus(payload.accountIds, payload.status);
    const enabled = payload.status === "active";
    addActivityLog(
      "account_update",
      "info",
      enabled ? "账号批量启用" : "账号批量停用",
      `已${enabled ? "启用" : "停用"} ${updated} 个账号`,
      { requested: payload.accountIds.length, updated, status: payload.status },
    );
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      message: `已${enabled ? "启用" : "停用"} ${updated} 个账号`,
      updated,
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "批量更新失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
