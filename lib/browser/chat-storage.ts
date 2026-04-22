"use client";

import type { ChatRecord, ChatSummary } from "@/types/chat";

const DB_NAME = "imagegen-chat-demo";
const DB_VERSION = 1;
const STORE_NAME = "chats";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open browser database."));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function listStoredChats() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const chats = (await runRequest(tx.objectStore(STORE_NAME).getAll())) as ChatRecord[];

  return chats
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((chat): ChatSummary => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      preview: chat.messages.findLast((message) => message.role === "user")?.prompt ?? null,
    }));
}

export async function getStoredChat(chatId: string) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const chat = (await runRequest(tx.objectStore(STORE_NAME).get(chatId))) as
    | ChatRecord
    | undefined;
  return chat ?? null;
}

export async function putStoredChat(chat: ChatRecord) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await runRequest(tx.objectStore(STORE_NAME).put(chat));
}
