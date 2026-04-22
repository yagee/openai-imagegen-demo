import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getChatImagePath } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ chatId: string; fileName: string }>;
};

function getContentType(fileName: string) {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function GET(_request: Request, context: RouteContext) {
  const { chatId, fileName } = await context.params;

  try {
    const buffer = await readFile(getChatImagePath(chatId, fileName));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": getContentType(fileName),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: { message: "Image not found." } },
      { status: 404 },
    );
  }
}
