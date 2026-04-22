import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appendMessages, readChat, saveChatImage } from "@/lib/chat-store";
import type { AspectRatioOption, ChatMessage } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

type RequestPayload = {
  prompt?: unknown;
  aspectRatio?: unknown;
};

type ResponseImageOutput = {
  type: "image_generation_call";
  result: string;
  output_format?: string;
};

type ResponseTextContent = {
  type: "output_text";
  text: string;
};

type ResponseMessageOutput = {
  type: "message";
  content: ResponseTextContent[];
};

function normalizeAspectRatio(value: unknown): AspectRatioOption {
  return value === "16:9" || value === "9:16" || value === "1:1" ? value : null;
}

function buildEffectivePrompt(prompt: string, aspectRatio: AspectRatioOption) {
  const trimmedPrompt = prompt.trim();
  if (!aspectRatio) return trimmedPrompt;
  return `${trimmedPrompt}\n\nAspect ratio: ${aspectRatio}.`;
}

function getMimeType(outputFormat: unknown) {
  const format = typeof outputFormat === "string" ? outputFormat.toLowerCase() : "png";
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function isImageOutput(item: unknown): item is ResponseImageOutput {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "image_generation_call" &&
    "result" in item &&
    typeof item.result === "string" &&
    Boolean(item.result)
  );
}

function isMessageOutput(item: unknown): item is ResponseMessageOutput {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "message" &&
    "content" in item &&
    Array.isArray(item.content)
  );
}

function getImageResult(output: unknown[]) {
  return output.find(isImageOutput);
}

function getTextResult(output: unknown[]) {
  return output
    .filter(isMessageOutput)
    .flatMap((item) =>
      item.content
        .filter(
          (content): content is ResponseTextContent =>
            typeof content === "object" &&
            content !== null &&
            "type" in content &&
            content.type === "output_text" &&
            "text" in content &&
            typeof content.text === "string",
        )
        .map((content) => content.text),
    )
    .join("\n")
    .trim();
}

export async function POST(request: Request, context: RouteContext) {
  const { chatId } = await context.params;
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "OPENAI_API_KEY is not configured." } },
      { status: 500 },
    );
  }

  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const aspectRatio = normalizeAspectRatio(payload.aspectRatio);

  if (!prompt) {
    return NextResponse.json(
      { error: { message: "Prompt is required." } },
      { status: 400 },
    );
  }

  let chat;
  try {
    chat = await readChat(chatId);
  } catch {
    return NextResponse.json(
      { error: { message: "Chat not found." } },
      { status: 404 },
    );
  }

  const endpointBase = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const endpoint = `${endpointBase.replace(/\/$/, "")}/responses`;
  const effectivePrompt = buildEffectivePrompt(prompt, aspectRatio);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const organization = process.env.OPENAI_ORG_ID?.trim();
  if (organization) {
    headers["OpenAI-Organization"] = organization;
  }

  const project = process.env.OPENAI_PROJECT_ID?.trim();
  if (project) {
    headers["OpenAI-Project"] = project;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gpt-5.4",
      input: effectivePrompt,
      previous_response_id: chat.latestResponseId ?? undefined,
      tools: [{ type: "image_generation", action: "auto" }],
    }),
  });

  if (!response.ok) {
    let message = `OpenAI request failed (${response.status}).`;
    try {
      const errorPayload = (await response.json()) as { error?: { message?: string } };
      if (typeof errorPayload.error?.message === "string" && errorPayload.error.message) {
        message = errorPayload.error.message;
      }
    } catch {
      // Keep generic message.
    }

    return NextResponse.json({ error: { message } }, { status: response.status });
  }

  const responsePayload = (await response.json()) as {
    id?: string;
    output?: unknown[];
  };

  const output = Array.isArray(responsePayload.output) ? responsePayload.output : [];
  const imageResult = getImageResult(output);
  const assistantText = getTextResult(output);

  if (!imageResult) {
    return NextResponse.json(
      { error: { message: "Model returned no image." } },
      { status: 502 },
    );
  }

  const mimeType = getMimeType(imageResult.output_format);
  const savedImage = await saveChatImage(chatId, mimeType, imageResult.result);
  const now = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    prompt,
    createdAt: now,
    aspectRatio,
    image: null,
    responseId: null,
  };

  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    prompt: assistantText || "Generated image.",
    createdAt: now,
    aspectRatio,
    image: {
      fileName: savedImage.fileName,
      mimeType,
      url: savedImage.url,
    },
    responseId: typeof responsePayload.id === "string" ? responsePayload.id : null,
  };

  const updatedChat = await appendMessages(chatId, [userMessage, assistantMessage], assistantMessage.responseId);

  return NextResponse.json({
    chat: updatedChat,
    appendedMessages: [userMessage, assistantMessage],
  });
}
