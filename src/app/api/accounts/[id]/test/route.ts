import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkAccountById } from "@/lib/server/account-check";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const result = await checkAccountById(id);
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (error) {
    revalidatePath("/");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "账号检测失败" },
      { status: 400 },
    );
  }
}
