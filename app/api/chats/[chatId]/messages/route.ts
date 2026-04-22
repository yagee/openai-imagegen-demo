import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  appendMessages,
  getChatImagePath,
  readChat,
  saveChatImage,
} from "@/lib/chat-store";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_QUALITY_OPTIONS,
  OPENAI_IMAGE_SIZE,
} from "@/lib/constants";
import type {
  AspectRatioOption,
  ChatMessage,
  ImageQualityOption,
} from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

type RequestPayload = {
  prompt?: unknown;
  aspectRatio?: unknown;
  quality?: unknown;
};

function normalizeAspectRatio(value: unknown): AspectRatioOption {
  return value === "16:9" || value === "9:16" || value === "1:1" ? value : null;
}

function normalizeQuality(value: unknown): ImageQualityOption {
  return typeof value === "string" &&
    OPENAI_IMAGE_QUALITY_OPTIONS.includes(value as ImageQualityOption)
    ? (value as ImageQualityOption)
    : OPENAI_IMAGE_QUALITY;
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

function getOutputSize(aspectRatio: AspectRatioOption) {
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "1:1") return "1024x1024";
  if (aspectRatio === "9:16") return "1024x1536";
  return OPENAI_IMAGE_SIZE;
}

async function getLatestAssistantImageDataUrl(chat: Awaited<ReturnType<typeof readChat>>) {
  const latestImageMessage = [...chat.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.image);

  if (!latestImageMessage?.image) return null;

  const filePath = getChatImagePath(chat.id, latestImageMessage.image.fileName);
  const bytes = await readFile(filePath);
  const base64 = bytes.toString("base64");
  return `data:${latestImageMessage.image.mimeType};base64,${base64}`;
}

type ImageApiPayload = {
  data?: Array<{
    b64_json?: string;
    output_format?: string;
    revised_prompt?: string;
  }>;
};

async function readImageApiError(response: Response) {
  let message = `OpenAI request failed (${response.status}).`;
  try {
    const errorPayload = (await response.json()) as { error?: { message?: string } };
    if (typeof errorPayload.error?.message === "string" && errorPayload.error.message) {
      message = errorPayload.error.message;
    }
  } catch {
    // Keep generic message.
  }
  return message;
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
  const quality = normalizeQuality(payload.quality);

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
  const effectivePrompt = buildEffectivePrompt(prompt, aspectRatio);
  const size = getOutputSize(aspectRatio);
  const latestImageDataUrl = await getLatestAssistantImageDataUrl(chat);

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

  const endpoint = latestImageDataUrl
    ? `${endpointBase.replace(/\/$/, "")}/images/edits`
    : `${endpointBase.replace(/\/$/, "")}/images/generations`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: effectivePrompt,
      quality,
      size,
      output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
      ...(latestImageDataUrl
        ? {
            images: [{ image_url: latestImageDataUrl }],
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const message = await readImageApiError(response);
    return NextResponse.json({ error: { message } }, { status: response.status });
  }

  const responsePayload = (await response.json()) as ImageApiPayload;
  const imageResult = responsePayload.data?.[0];

  if (!imageResult?.b64_json) {
    return NextResponse.json(
      { error: { message: "Model returned no image." } },
      { status: 502 },
    );
  }

  const mimeType = getMimeType(imageResult.output_format ?? OPENAI_IMAGE_OUTPUT_FORMAT);
  const savedImage = await saveChatImage(chatId, mimeType, imageResult.b64_json);
  const now = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    prompt,
    createdAt: now,
    aspectRatio,
    quality,
    image: null,
    responseId: null,
  };

  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    prompt: imageResult.revised_prompt?.trim() || "Generated image.",
    createdAt: now,
    aspectRatio,
    quality,
    image: {
      fileName: savedImage.fileName,
      mimeType,
      url: savedImage.url,
    },
    responseId: null,
  };

  const updatedChat = await appendMessages(
    chatId,
    [userMessage, assistantMessage],
    null,
  );

  return NextResponse.json({
    chat: updatedChat,
    appendedMessages: [userMessage, assistantMessage],
  });
}
