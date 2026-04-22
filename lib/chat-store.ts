import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatRecord, ChatSummary } from "@/types/chat";

const DATA_ROOT = path.join(process.cwd(), "data");
const CHATS_ROOT = path.join(DATA_ROOT, "chats");
const CHAT_FILE_NAME = "chat.json";
const IMAGE_DIR_NAME = "images";

function getChatDir(chatId: string) {
  return path.join(CHATS_ROOT, chatId);
}

function getChatFilePath(chatId: string) {
  return path.join(getChatDir(chatId), CHAT_FILE_NAME);
}

export function getChatImagePath(chatId: string, fileName: string) {
  return path.join(getChatDir(chatId), IMAGE_DIR_NAME, fileName);
}

async function ensureChatRoot() {
  await mkdir(CHATS_ROOT, { recursive: true });
}

async function ensureChatDir(chatId: string) {
  const chatDir = getChatDir(chatId);
  await mkdir(path.join(chatDir, IMAGE_DIR_NAME), { recursive: true });
  return chatDir;
}

function createChatTitle(title?: string) {
  const trimmed = title?.trim();
  return trimmed?.length ? trimmed : "New chat";
}

export async function createChat(title?: string) {
  await ensureChatRoot();

  const now = new Date().toISOString();
  const chat: ChatRecord = {
    id: randomUUID(),
    title: createChatTitle(title),
    createdAt: now,
    updatedAt: now,
    latestResponseId: null,
    messages: [],
  };

  await ensureChatDir(chat.id);
  await writeChat(chat);

  return chat;
}

export async function readChat(chatId: string) {
  const filePath = getChatFilePath(chatId);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as ChatRecord;
}

export async function writeChat(chat: ChatRecord) {
  await ensureChatDir(chat.id);
  const filePath = getChatFilePath(chat.id);
  await writeFile(filePath, `${JSON.stringify(chat, null, 2)}\n`, "utf8");
}

export async function updateChatTitle(chatId: string, title: string) {
  const chat = await readChat(chatId);
  chat.title = createChatTitle(title);
  chat.updatedAt = new Date().toISOString();
  await writeChat(chat);
  return chat;
}

export async function appendMessages(
  chatId: string,
  messages: ChatMessage[],
  latestResponseId: string | null,
) {
  const chat = await readChat(chatId);
  chat.messages.push(...messages);
  chat.updatedAt = new Date().toISOString();
  chat.latestResponseId = latestResponseId;

  if (chat.title === "New chat") {
    const firstUserMessage = chat.messages.find((message) => message.role === "user");
    if (firstUserMessage?.prompt.trim()) {
      chat.title = firstUserMessage.prompt.trim().slice(0, 48);
    }
  }

  await writeChat(chat);
  return chat;
}

export async function listChats() {
  await ensureChatRoot();
  const entries = await readdir(CHATS_ROOT, { withFileTypes: true });

  const chats = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const chat = await readChat(entry.name);
          const summary: ChatSummary = {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messageCount: chat.messages.length,
            preview:
              chat.messages.findLast((message) => message.role === "user")?.prompt ?? null,
          };
          return summary;
        } catch {
          return null;
        }
      }),
  );

  return chats
    .filter((chat): chat is ChatSummary => Boolean(chat))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveChatImage(chatId: string, mimeType: string, base64Data: string) {
  await ensureChatDir(chatId);

  const extension =
    mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = getChatImagePath(chatId, fileName);
  const buffer = Buffer.from(base64Data, "base64");

  await writeFile(filePath, buffer);

  return {
    fileName,
    url: `/api/chats/${chatId}/images/${fileName}`,
  };
}

export async function getChatImageStat(chatId: string, fileName: string) {
  return stat(getChatImagePath(chatId, fileName));
}

export async function renameLegacyChatDir(oldChatId: string, nextChatId: string) {
  if (oldChatId === nextChatId) return;
  await rename(getChatDir(oldChatId), getChatDir(nextChatId));
}
