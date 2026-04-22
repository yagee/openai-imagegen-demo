import { NextResponse } from "next/server";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_QUALITY_OPTIONS,
  OPENAI_IMAGE_SIZE,
} from "@/lib/constants";
import type { AspectRatioOption, ImageQualityOption } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RequestPayload = {
  prompt?: unknown;
  aspectRatio?: unknown;
  quality?: unknown;
  previousImageDataUrl?: unknown;
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

function getOutputSize(aspectRatio: AspectRatioOption) {
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "1:1") return "1024x1024";
  if (aspectRatio === "9:16") return "1024x1536";
  return OPENAI_IMAGE_SIZE;
}

function getMimeType(outputFormat: unknown) {
  const format = typeof outputFormat === "string" ? outputFormat.toLowerCase() : "png";
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

async function readOpenAiError(response: Response) {
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

export async function POST(request: Request) {
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
  const previousImageDataUrl =
    typeof payload.previousImageDataUrl === "string" && payload.previousImageDataUrl.startsWith("data:image/")
      ? payload.previousImageDataUrl
      : null;

  if (!prompt) {
    return NextResponse.json(
      { error: { message: "Prompt is required." } },
      { status: 400 },
    );
  }

  const endpointBase = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const endpoint = previousImageDataUrl
    ? `${endpointBase.replace(/\/$/, "")}/images/edits`
    : `${endpointBase.replace(/\/$/, "")}/images/generations`;

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
      model: OPENAI_IMAGE_MODEL,
      prompt: buildEffectivePrompt(prompt, aspectRatio),
      quality,
      size: getOutputSize(aspectRatio),
      output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
      ...(previousImageDataUrl
        ? {
            images: [{ image_url: previousImageDataUrl }],
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const message = await readOpenAiError(response);
    return NextResponse.json({ error: { message } }, { status: response.status });
  }

  const responsePayload = (await response.json()) as {
    data?: Array<{
      b64_json?: string;
      output_format?: string;
      revised_prompt?: string;
    }>;
  };

  const imageResult = responsePayload.data?.[0];

  if (!imageResult?.b64_json) {
    return NextResponse.json(
      { error: { message: "Model returned no image." } },
      { status: 502 },
    );
  }

  const mimeType = getMimeType(imageResult.output_format ?? OPENAI_IMAGE_OUTPUT_FORMAT);

  return NextResponse.json({
    imageDataUrl: `data:${mimeType};base64,${imageResult.b64_json}`,
    revisedPrompt: imageResult.revised_prompt?.trim() || "Generated image.",
    quality,
    aspectRatio,
  });
}
