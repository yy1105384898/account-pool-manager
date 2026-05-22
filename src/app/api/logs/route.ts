import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { clearActivityLogs } from "@/lib/server/db";

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const keepLatest = Number(url.searchParams.get("keepLatest") ?? 0);
  clearActivityLogs({ keepLatest });
  revalidatePath("/");
  return NextResponse.json({
    ok: true,
    message: keepLatest > 0 ? `已清理日志，仅保留最新 ${keepLatest} 条` : "日志已清空",
  });
}
