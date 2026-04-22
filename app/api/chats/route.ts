import { NextResponse } from "next/server";
import { createChat, listChats } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const chats = await listChats();
  return NextResponse.json({ chats });
}

export async function POST(request: Request) {
  let payload: { title?: unknown } = {};

  try {
    payload = (await request.json()) as { title?: unknown };
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : undefined;
  const chat = await createChat(title);
  return NextResponse.json({ chat }, { status: 201 });
}
