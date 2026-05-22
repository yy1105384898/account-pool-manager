import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  await context.params;
  return NextResponse.json(
    { ok: false, error: "当前模式仅支持号池向中转站推送账号，不支持反向导入中转站账号" },
    { status: 400 },
  );
}
