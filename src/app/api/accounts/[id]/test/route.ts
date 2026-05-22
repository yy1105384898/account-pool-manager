import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addActivityLog, getAccountById, updateAccountTestResult } from "@/lib/server/db";
import { fetchViaProxy } from "@/lib/server/proxy-fetch";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const account = getAccountById(id);
  if (!account) {
    return NextResponse.json({ ok: false, error: "账号不存在" }, { status: 404 });
  }

  if (account.accessToken.startsWith("refresh:")) {
    updateAccountTestResult(id, {
      status: "unknown",
      remoteStatus: "need_access_token",
      metadata: { lastCheckMessage: "只有 Refresh Token，需先刷新 Access Token 后测试" },
    });
    revalidatePath("/");
    return NextResponse.json(
      { ok: false, error: "只有 Refresh Token，需先刷新 Access Token 后测试" },
      { status: 400 },
    );
  }

  const baseUrl = readMetadataString(account.metadata, "baseUrl") || "https://api.openai.com";
  const started = Date.now();
  try {
    const response = await fetchViaProxy(`${baseUrl.replace(/\/+$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    const payload = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }>; error?: { message?: string } } | null;
    const modelCount = Array.isArray(payload?.data) ? payload.data.length : 0;

    if (!response.ok) {
      const remoteStatus = response.status === 401 || response.status === 403 ? "unauthorized" : `http_${response.status}`;
      const message = payload?.error?.message ?? `OpenAI 返回 ${response.status}`;
      updateAccountTestResult(id, {
        status: "error",
        remoteStatus,
        metadata: { lastCheckMessage: message, lastCheckLatencyMs: latencyMs },
      });
      addActivityLog("account_test", "error", "账号测试失败", message, { accountId: id, status: response.status });
      revalidatePath("/");
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    updateAccountTestResult(id, {
      status: "active",
      remoteStatus: "active",
      metadata: { lastCheckMessage: `模型 ${modelCount} 个`, lastCheckLatencyMs: latencyMs, modelCount },
    });
    addActivityLog("account_test", "success", "账号测试成功", `模型 ${modelCount} 个，延迟 ${latencyMs}ms`, { accountId: id, modelCount });
    revalidatePath("/");
    return NextResponse.json({ ok: true, message: `账号可用，模型 ${modelCount} 个，延迟 ${latencyMs}ms` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "账号测试失败";
    updateAccountTestResult(id, {
      status: "error",
      remoteStatus: "network_error",
      metadata: { lastCheckMessage: message, lastCheckLatencyMs: Date.now() - started },
    });
    addActivityLog("account_test", "error", "账号测试失败", message, { accountId: id });
    revalidatePath("/");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
