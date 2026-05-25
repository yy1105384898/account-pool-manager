import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { checkAccountById } from "@/lib/server/account-check";
import { addActivityLog, getAccountsByIds } from "@/lib/server/db";
import { accountBulkTestSchema } from "@/lib/types";

type DetectionResult = {
  id: string;
  ok: boolean;
  message: string;
};

async function checkAccounts(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
  const existingIds = new Set(getAccountsByIds(uniqueIds).map((account) => account.id));
  const results: DetectionResult[] = [];

  for (const id of uniqueIds) {
    if (!existingIds.has(id)) {
      results.push({ id, ok: false, message: "账号不存在" });
      continue;
    }

    try {
      const result = await checkAccountById(id, { silent: true });
      results.push({ id, ok: true, message: result.message });
    } catch (error) {
      results.push({
        id,
        ok: false,
        message: error instanceof Error ? error.message : "账号检测失败",
      });
    }
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const payload = accountBulkTestSchema.parse(await request.json());
    const results = await checkAccounts(payload.accountIds);
    const successCount = results.filter((item) => item.ok).length;
    const errorCount = results.length - successCount;

    addActivityLog(
      "account_test",
      errorCount > 0 ? "info" : "success",
      "账号批量检测",
      `已检测 ${results.length} 个账号，可用结果 ${successCount} 个，异常 ${errorCount} 个`,
      {
        requested: payload.accountIds.length,
        successCount,
        errorCount,
        failedIds: results.filter((item) => !item.ok).map((item) => item.id),
      },
    );
    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      checked: results.length,
      successCount,
      errorCount,
      results,
      message: `已检测 ${results.length} 个账号，成功 ${successCount} 个，异常 ${errorCount} 个`,
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "参数不合法"
        : error instanceof Error
          ? error.message
          : "批量检测失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
