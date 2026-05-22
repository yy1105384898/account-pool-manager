import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { accountBulkDeleteSchema } from "@/lib/types";
import { addActivityLog, deleteAccounts } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    const payload = accountBulkDeleteSchema.parse(await request.json());
    const deleted = deleteAccounts(payload.accountIds);
    addActivityLog(
      "account_delete",
      "info",
      "账号批量删除",
      `已从本地号池删除 ${deleted} 个账号`,
      { requested: payload.accountIds.length, deleted },
    );
    revalidatePath("/");
    return NextResponse.json({ ok: true, message: `已删除 ${deleted} 个账号`, deleted });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "批量删除失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
