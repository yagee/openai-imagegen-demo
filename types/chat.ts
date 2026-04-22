export type AspectRatioOption = "16:9" | "9:16" | "1:1" | null;

export interface ChatImage {
  fileName: string;
  mimeType: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  prompt: string;
  createdAt: string;
  aspectRatio: AspectRatioOption;
  image: ChatImage | null;
  responseId: string | null;
}

export interface ChatRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  latestResponseId: string | null;
  messages: ChatMessage[];
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
}
