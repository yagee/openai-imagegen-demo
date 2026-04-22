"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, MessageSquarePlus, PencilLine, Ratio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AspectRatioOption, ChatRecord, ChatSummary } from "@/types/chat";

const ASPECT_RATIO_OPTIONS: Array<{
  label: string;
  value: AspectRatioOption;
}> = [
  { label: "Not set", value: null },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "1:1", value: "1:1" },
];

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } })?.error?.message ?? "Request failed.";
    throw new Error(message);
  }
  return payload;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HomePage() {
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatRecord | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages.length, isSending]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const chatsPayload = await readJson<{ chats: ChatSummary[] }>(
          await fetch("/api/chats", { cache: "no-store" }),
        );
        const chats = chatsPayload.chats;

        if (!isMounted) return;

        setChatSummaries(chats);

        if (!chats.length) {
          const created = await readJson<{ chat: ChatRecord }>(
            await fetch("/api/chats", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "New chat" }),
            }),
          );

          if (!isMounted) return;

          setActiveChat(created.chat);
          setTitleDraft(created.chat.title);
          setChatSummaries([
            {
              id: created.chat.id,
              title: created.chat.title,
              createdAt: created.chat.createdAt,
              updatedAt: created.chat.updatedAt,
              messageCount: 0,
              preview: null,
            },
          ]);
          return;
        }

        const firstChat = await readJson<{ chat: ChatRecord }>(
          await fetch(`/api/chats/${chats[0].id}`, { cache: "no-store" }),
        );

        if (!isMounted) return;

        setActiveChat(firstChat.chat);
        setTitleDraft(firstChat.chat.title);
      } catch (caughtError) {
        if (!isMounted) return;
        setError(
          caughtError instanceof Error ? caughtError.message : "Failed to load chats.",
        );
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshSummaries = async (preferredChat?: ChatRecord) => {
    const chatsPayload = await readJson<{ chats: ChatSummary[] }>(
      await fetch("/api/chats", { cache: "no-store" }),
    );
    setChatSummaries(chatsPayload.chats);
    if (preferredChat) {
      setTitleDraft(preferredChat.title);
    }
  };

  const loadChat = async (chatId: string) => {
    setError("");
    try {
      const payload = await readJson<{ chat: ChatRecord }>(
        await fetch(`/api/chats/${chatId}`, { cache: "no-store" }),
      );
      setActiveChat(payload.chat);
      setTitleDraft(payload.chat.title);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load chat.");
    }
  };

  const createNewChat = async () => {
    setError("");
    try {
      const payload = await readJson<{ chat: ChatRecord }>(
        await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New chat" }),
        }),
      );

      setActiveChat(payload.chat);
      setTitleDraft(payload.chat.title);
      await refreshSummaries(payload.chat);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create chat.");
    }
  };

  const renameChat = async () => {
    if (!activeChat) return;

    setIsRenaming(true);
    setError("");

    try {
      const payload = await readJson<{ chat: ChatRecord }>(
        await fetch(`/api/chats/${activeChat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: titleDraft }),
        }),
      );

      setActiveChat(payload.chat);
      await refreshSummaries(payload.chat);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Rename failed.");
    } finally {
      setIsRenaming(false);
    }
  };

  const submitPrompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChat || !draftPrompt.trim() || isSending) return;

    setIsSending(true);
    setError("");

    try {
      const payload = await readJson<{ chat: ChatRecord }>(
        await fetch(`/api/chats/${activeChat.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: draftPrompt,
            aspectRatio,
          }),
        }),
      );

      setActiveChat(payload.chat);
      setDraftPrompt("");
      await refreshSummaries(payload.chat);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Generation failed.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe3_0%,#f5f1ea_36%,#efe7db_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-3 md:p-5 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[28px] border border-black/10 bg-[#1f2937] text-white shadow-[0_30px_100px_rgba(15,23,42,0.28)]">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Image chats</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="font-mono text-2xl">Studio</h1>
                <p className="mt-1 text-sm text-white/70">Saved in `data/chats`.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="rounded-full bg-white text-slate-900 hover:bg-white/90"
                onClick={() => void createNewChat()}
              >
                <MessageSquarePlus />
                New
              </Button>
            </div>
          </div>

          <div className="max-h-[40vh] overflow-y-auto p-3 lg:max-h-[calc(100vh-180px)]">
            <div className="space-y-2">
              {chatSummaries.map((chat) => {
                const isActive = chat.id === activeChat?.id;

                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => void loadChat(chat.id)}
                    className={cn(
                      "w-full rounded-[22px] border px-4 py-3 text-left transition",
                      isActive
                        ? "border-white/30 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                        : "border-white/8 bg-white/5 hover:bg-white/9",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-1 text-sm font-semibold">{chat.title}</p>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                        {chat.messageCount}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-white/65">
                      {chat.preview ?? "Empty conversation"}
                    </p>
                    <p className="mt-3 text-xs text-white/45">{formatTime(chat.updatedAt)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[75vh] flex-col overflow-hidden rounded-[32px] border border-black/8 bg-white/75 shadow-[0_40px_120px_rgba(148,163,184,0.22)] backdrop-blur">
          <header className="border-b border-black/8 bg-[linear-gradient(135deg,rgba(247,244,238,0.98),rgba(255,255,255,0.82))] px-5 py-4 md:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Conversation</p>
                <h2 className="mt-2 font-mono text-3xl text-slate-900">
                  {activeChat?.title ?? "Loading"}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Multi-turn image generation. Next prompt can keep working from previous image.
                </p>
              </div>

              <div className="flex w-full max-w-xl gap-2">
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  placeholder="Rename chat"
                  className="h-11 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-slate-500"
                  disabled={!activeChat || isBooting}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full border-slate-300 bg-white px-4"
                  onClick={() => void renameChat()}
                  disabled={!activeChat || isRenaming || isBooting}
                >
                  {isRenaming ? <LoaderCircle className="animate-spin" /> : <PencilLine />}
                  Rename
                </Button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-7">
            {isBooting ? (
              <div className="flex h-full min-h-[360px] items-center justify-center">
                <div className="flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm text-white">
                  <LoaderCircle className="animate-spin" />
                  Loading chats
                </div>
              </div>
            ) : activeChat?.messages.length ? (
              <div className="space-y-5">
                {activeChat.messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "max-w-3xl rounded-[28px] border p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] md:p-5",
                      message.role === "user"
                        ? "ml-auto border-slate-900 bg-slate-900 text-white"
                        : "border-[#e6ddd2] bg-[#fffaf4]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.3em] opacity-60">
                        {message.role === "user" ? "Prompt" : "Image"}
                      </p>
                      <p className="text-xs opacity-60">{formatTime(message.createdAt)}</p>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 md:text-[15px]">
                      {message.prompt}
                    </p>

                    {message.aspectRatio ? (
                      <div
                        className={cn(
                          "mt-3 inline-flex rounded-full px-3 py-1 text-xs",
                          message.role === "user"
                            ? "bg-white/12 text-white/80"
                            : "bg-slate-900 text-white",
                        )}
                      >
                        Ratio {message.aspectRatio}
                      </div>
                    ) : null}

                    {message.image ? (
                      <div className="mt-4 overflow-hidden rounded-[24px] border border-black/10 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.image.url}
                          alt={message.prompt}
                          className="block h-auto w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </article>
                ))}

                {isSending ? (
                  <article className="max-w-3xl rounded-[28px] border border-[#e6ddd2] bg-[#fffaf4] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <LoaderCircle className="animate-spin" />
                      Generating image
                    </div>
                  </article>
                ) : null}

                <div ref={endRef} />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="max-w-xl rounded-[32px] border border-dashed border-slate-300 bg-[#fffaf4] p-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white">
                    <ImagePlus />
                  </div>
                  <h3 className="mt-5 font-mono text-2xl text-slate-900">Start first render</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Type prompt, pick optional ratio, generate image. Chat keeps history and saved files.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="border-t border-black/8 bg-[#fffdf9] px-4 py-4 md:px-7">
            <form onSubmit={submitPrompt} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                  <Ratio className="size-3.5" />
                  Aspect
                </div>

                {ASPECT_RATIO_OPTIONS.map((option) => {
                  const isSelected = option.value === aspectRatio;

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setAspectRatio(option.value)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition",
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {aspectRatio ? (
                <p className="text-sm text-slate-500">
                  Prompt append: <span className="font-mono">Aspect ratio: {aspectRatio}.</span>
                </p>
              ) : null}

              <div className="rounded-[30px] border border-slate-300 bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
                <textarea
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                  placeholder="Describe image or ask for change on previous result..."
                  className="min-h-32 w-full resize-none bg-transparent px-2 py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                  disabled={!activeChat || isBooting || isSending}
                />

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">
                    Images + chat JSON saved per conversation in{" "}
                    <code>data/chats/&lt;chat-id&gt;</code>.
                  </p>
                  <Button
                    type="submit"
                    className="h-11 rounded-full bg-[#b45309] px-6 text-white hover:bg-[#92400e]"
                    disabled={!activeChat || !draftPrompt.trim() || isBooting || isSending}
                  >
                    {isSending ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                    Generate image
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </form>
          </footer>
        </section>
      </div>
    </main>
  );
}
