import { NextResponse } from "next/server";
import { readChat, updateChatTitle } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { chatId } = await context.params;

  try {
    const chat = await readChat(chatId);
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json(
      { error: { message: "Chat not found." } },
      { status: 404 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { chatId } = await context.params;

  let payload: { title?: unknown };
  try {
    payload = (await request.json()) as { title?: unknown };
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request body." } },
      { status: 400 },
    );
  }

  if (typeof payload.title !== "string") {
    return NextResponse.json(
      { error: { message: "Title must be string." } },
      { status: 400 },
    );
  }

  try {
    const chat = await updateChatTitle(chatId, payload.title);
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json(
      { error: { message: "Chat not found." } },
      { status: 404 },
    );
  }
}
