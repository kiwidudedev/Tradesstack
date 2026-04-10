"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./trade-pack-builder.module.css";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
}

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
}

interface ChatConversation {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string;
}

interface MessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface ConversationsPage {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  usage?: ChatUsage;
}

const CONVERSATIONS_FETCH_LIMIT = 50;
const MESSAGES_FETCH_LIMIT = 200;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatAssistantContent(content: string) {
  return content.replace(/^\s*-\s+/gm, "• ");
}

function extractAssistantHeading(content: string) {
  const lines = content.split("\n");
  const headingLine =
    lines.find((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("•");
    }) ?? "";
  return headingLine.trim().slice(0, 80);
}

function normalizeConversation(
  conversation: Partial<ChatConversation> & { id?: string; title?: string }
): ChatConversation | null {
  if (typeof conversation.id !== "string" || typeof conversation.title !== "string") {
    return null;
  }

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt,
  } satisfies ChatConversation;
}

function isConversation(value: ChatConversation | null): value is ChatConversation {
  return value !== null;
}

function normalizeMessage(message: { id?: string; role?: ChatRole; content?: string; createdAt?: string }): ChatMessage | null {
  if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
    return null;
  }

  const content = message.content.trim();
  if (!content) {
    return null;
  }

  return {
    id: message.id || generateId(),
    role: message.role,
    content,
    createdAt: typeof message.createdAt === "string" ? message.createdAt : undefined,
  } satisfies ChatMessage;
}

function isMessage(value: ChatMessage | null): value is ChatMessage {
  return value !== null;
}

function renderAssistantContent(content: string) {
  const lines = formatAssistantContent(content).split("\n");
  const firstHeadingLineIndex = lines.findIndex((line) => line.trim().length > 0 && !/^\s*•\s+/.test(line));

  return lines.map((line, index) => {
    const isHeading = index === firstHeadingLineIndex;
    const isBullet = /^\s*•\s+/.test(line);
    if (isHeading) {
      return (
        <p key={`${index}-${line}`} className="mb-3 whitespace-pre-wrap text-[17px] font-semibold leading-[1.4] text-[#0f2238]">
          {line}
        </p>
      );
    }

    return (
      <p
        key={`${index}-${line}`}
        className={
          isBullet
            ? "mb-2 whitespace-pre-wrap text-[15px] leading-[1.75] text-[#1b324f]"
            : "whitespace-pre-wrap text-[15px] leading-[1.75] text-[#1b324f]"
        }
      >
        {line}
      </p>
    );
  });
}

export function AiChatbotPanel({ projectSlug }: { projectSlug: string }) {
  const [inputValue, setInputValue] = useState("");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsCursor, setConversationsCursor] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const loadingOlderMessagesRef = useRef(false);
  const loadingMoreConversationsRef = useRef(false);
  const canSend = useMemo(() => inputValue.trim().length > 0 && !isLoading, [inputValue, isLoading]);
  const topicItems = useMemo(() => conversations, [conversations]);

  const fetchConversationsPage = async (cursor?: string): Promise<ConversationsPage> => {
    const searchParams = new URLSearchParams({
      projectSlug,
      limit: String(CONVERSATIONS_FETCH_LIMIT),
    });
    if (cursor) {
      searchParams.set("cursor", cursor);
    }
    const response = await fetch(`/api/chat/conversations?${searchParams.toString()}`, {
      method: "GET",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Failed to load chat history.");
    }

    const body = (await response.json()) as {
      conversations?: Array<{
        id: string;
        title: string;
        createdAt?: string;
        updatedAt?: string;
        lastMessageAt?: string;
      }>;
      activeConversationId?: string | null;
      hasMore?: boolean;
      nextCursor?: string | null;
      usage?: { used?: number; limit?: number; remaining?: number };
    };

    const conversations = Array.isArray(body.conversations)
      ? body.conversations.map(normalizeConversation).filter(isConversation)
      : [];
    const usage =
      typeof body.usage?.used === "number" &&
      typeof body.usage?.limit === "number" &&
      typeof body.usage?.remaining === "number"
        ? {
            used: body.usage.used,
            limit: body.usage.limit,
            remaining: body.usage.remaining,
          }
        : undefined;

    return {
      conversations,
      activeConversationId: typeof body.activeConversationId === "string" ? body.activeConversationId : null,
      hasMore: Boolean(body.hasMore),
      nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
      usage,
    };
  };

  const fetchConversationMessages = async (conversationId: string, cursor?: string): Promise<MessagesPage> => {
    const searchParams = new URLSearchParams({
      projectSlug,
      conversationId,
      limit: String(MESSAGES_FETCH_LIMIT),
    });
    if (cursor) {
      searchParams.set("cursor", cursor);
    }
    const response = await fetch(`/api/chat/messages?${searchParams.toString()}`, { method: "GET" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Failed to open conversation.");
    }

    const body = (await response.json()) as {
      messages?: Array<{ id?: string; role?: ChatRole; content?: string; createdAt?: string }>;
      hasMore?: boolean;
      nextCursor?: string | null;
    };

    return {
      messages: Array.isArray(body.messages) ? body.messages.map(normalizeMessage).filter(isMessage) : [],
      hasMore: Boolean(body.hasMore),
      nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
    };
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  };

  const resizeComposer = () => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "0px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 52), 180);
    element.style.height = `${nextHeight}px`;
  };

  const appendAssistantDelta = (assistantId: string, delta: string) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === assistantId ? { ...message, content: `${message.content}${delta}` } : message
      )
    );
  };

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setError(null);

      try {
        const page = await fetchConversationsPage();
        if (!isMounted) {
          return;
        }

        const nextConversations: ChatConversation[] = page.conversations;
        const initialConversationId =
          (typeof page.activeConversationId === "string" &&
          nextConversations.some((conversation) => conversation.id === page.activeConversationId)
            ? page.activeConversationId
            : "") ||
          nextConversations[0]?.id ||
          null;

        let historicalMessages: ChatMessage[] = [];
        if (initialConversationId) {
          const firstMessagesPage = await fetchConversationMessages(initialConversationId);
          historicalMessages = firstMessagesPage.messages;
          if (isMounted) {
            setHasMoreMessages(firstMessagesPage.hasMore);
            setMessagesCursor(firstMessagesPage.nextCursor);
          }
          if (!isMounted) {
            return;
          }
        } else if (isMounted) {
          setHasMoreMessages(false);
          setMessagesCursor(null);
        }

        setConversations(nextConversations);
        setHasMoreConversations(page.hasMore);
        setConversationsCursor(page.nextCursor);
        setActiveConversationId(initialConversationId);
        setMessages(historicalMessages);
        if (page.usage) {
          setUsage(page.usage);
        }
      } catch (caughtError) {
        if (isMounted) {
          const errorMessage =
            caughtError instanceof Error ? caughtError.message : "Failed to load chat history.";
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
          requestAnimationFrame(scrollToBottom);
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [projectSlug]);

  useEffect(() => {
    resizeComposer();
  }, [inputValue]);

  const handleSend = async (rawText?: string) => {
    const nextText = (rawText ?? inputValue).trim();
    if (!nextText || isLoading) {
      return;
    }

    setInputValue("");
    setError(null);
    setIsLoading(true);

    const userMessage: ChatMessage = { id: generateId(), role: "user", content: nextText };
    const assistantMessage: ChatMessage = { id: generateId(), role: "assistant", content: "" };
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    let didSendSucceed = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          conversationId: activeConversationId,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to get AI response.");
        setMessages((previous) => previous.filter((message) => message.id !== assistantMessage.id));
        return;
      }

      if (!response.body) {
        setError("No response stream available.");
        return;
      }
      didSendSucceed = true;
      const responseConversationId = response.headers.get("X-Conversation-Id");
      if (responseConversationId) {
        setActiveConversationId(responseConversationId);
        setConversations((previous) => {
          const nowIso = new Date().toISOString();
          const existing = previous.find((conversation) => conversation.id === responseConversationId);
          if (existing) {
            return [
              { ...existing, lastMessageAt: nowIso, updatedAt: nowIso },
              ...previous.filter((conversation) => conversation.id !== responseConversationId),
            ];
          }
          return [{ id: responseConversationId, title: "New Chat", lastMessageAt: nowIso, updatedAt: nowIso }, ...previous];
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantAccumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const dataLines = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());

          if (dataLines.length === 0) {
            continue;
          }

          const payloadText = dataLines.join("\n");
          if (!payloadText) {
            continue;
          }

          let payload: { type?: string; delta?: string; error?: string } | null = null;
          try {
            payload = JSON.parse(payloadText) as { type?: string; delta?: string; error?: string };
          } catch {
            continue;
          }

          if (payload?.type === "delta" && typeof payload.delta === "string") {
            assistantAccumulated += payload.delta;
            appendAssistantDelta(assistantMessage.id, payload.delta);
            requestAnimationFrame(scrollToBottom);
          }

          if (payload?.type === "error" && payload.error) {
            setError(payload.error);
          }
        }
      }

      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantMessage.id && message.content.trim().length === 0
            ? {
                ...message,
                content:
                  "I could not generate a response. Please try again with a more specific construction question.",
              }
            : message
        )
      );

      const headingTitle = extractAssistantHeading(assistantAccumulated);
      if (responseConversationId && headingTitle) {
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === responseConversationId && conversation.title === "New Chat"
              ? { ...conversation, title: headingTitle }
              : conversation
          )
        );
      }
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Unable to contact AI service.";
      setError(errorMessage);
      setMessages((previous) => previous.filter((message) => message.id !== assistantMessage.id));
    } finally {
      setIsLoading(false);
      if (didSendSucceed) {
        setUsage((previous) => {
          if (!previous) {
            return previous;
          }
          const used = previous.used + 1;
          const limit = previous.limit;
          return {
            used,
            limit,
            remaining: Math.max(limit - used, 0),
          };
        });
      }
      requestAnimationFrame(scrollToBottom);
    }
  };

  const openConversation = async (conversationId: string) => {
    if (activeConversationId === conversationId) {
      return;
    }

    const previousActiveConversationId = activeConversationId;
    setError(null);
    setIsLoadingHistory(true);
    setActiveConversationId(conversationId);
    try {
      const firstMessagesPage = await fetchConversationMessages(conversationId);
      setMessages(firstMessagesPage.messages);
      setHasMoreMessages(firstMessagesPage.hasMore);
      setMessagesCursor(firstMessagesPage.nextCursor);
      requestAnimationFrame(scrollToBottom);
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Failed to open conversation.";
      setError(errorMessage);
      setActiveConversationId(previousActiveConversationId);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setHasMoreMessages(false);
    setMessagesCursor(null);
    setError(null);
    setInputValue("");
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = 0;
    }
  };

  const deleteConversation = async (conversationId: string) => {
    setDeletingConversationId(conversationId);
    setError(null);
    try {
      const searchParams = new URLSearchParams({
        projectSlug,
        conversationId,
      });
      const response = await fetch(`/api/chat/conversations?${searchParams.toString()}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to delete chat.");
        return;
      }

      const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
      setConversations(remaining);

      if (activeConversationId === conversationId) {
        const nextConversationId = remaining[0]?.id ?? null;
        if (nextConversationId) {
          await openConversation(nextConversationId);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Unable to delete chat.";
      setError(errorMessage);
    } finally {
      setDeletingConversationId(null);
    }
  };

  const loadOlderMessages = async () => {
    if (
      !activeConversationId ||
      !hasMoreMessages ||
      !messagesCursor ||
      isLoadingMoreMessages ||
      isLoadingHistory ||
      loadingOlderMessagesRef.current
    ) {
      return;
    }

    const container = scrollContainerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;

    loadingOlderMessagesRef.current = true;
    setIsLoadingMoreMessages(true);
    try {
      const page = await fetchConversationMessages(activeConversationId, messagesCursor);
      if (page.messages.length > 0) {
        setMessages((previous) => [...page.messages, ...previous]);
      }
      setHasMoreMessages(page.hasMore);
      setMessagesCursor(page.nextCursor);

      requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) {
          return;
        }
        const nextHeight = nextContainer.scrollHeight;
        const delta = nextHeight - previousHeight;
        nextContainer.scrollTop = previousTop + delta;
      });
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Failed to load older messages.";
      setError(errorMessage);
    } finally {
      setIsLoadingMoreMessages(false);
      loadingOlderMessagesRef.current = false;
    }
  };

  const loadMoreConversations = async () => {
    if (!hasMoreConversations || !conversationsCursor || isLoadingMoreConversations || loadingMoreConversationsRef.current) {
      return;
    }
    loadingMoreConversationsRef.current = true;
    setIsLoadingMoreConversations(true);
    try {
      const page = await fetchConversationsPage(conversationsCursor);
      setConversations((previous) => [...previous, ...page.conversations]);
      setHasMoreConversations(page.hasMore);
      setConversationsCursor(page.nextCursor);
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Failed to load more chats.";
      setError(errorMessage);
    } finally {
      setIsLoadingMoreConversations(false);
      loadingMoreConversationsRef.current = false;
    }
  };

  return (
    <main className={`${styles.scope} -mb-8 space-y-[30px] py-1`}>
      <div className="mx-auto w-full max-w-[1240px]">
        <section className={styles.heroBlock}>
          <div>
            <h1 className={styles.heroTitle}>AI Assistant</h1>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[999px] bg-[#0B2E4D] px-5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
          </div>
        </section>
        <div className="mt-10 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="pt-1">
            <p className="px-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6B7C8F]">Recent</p>
            <div className="mt-2 space-y-1">
              {topicItems.length === 0 ? (
                <p className="px-2 py-2 text-[13px] text-[#7A899C]">No chat topics yet.</p>
              ) : (
                topicItems.map((topic) => (
                  <div
                    key={topic.id}
                    className={`group flex items-start gap-1 rounded-[12px] transition ${
                      activeConversationId === topic.id ? "bg-[#E8EDF3]" : "hover:bg-[#ECEFF3]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void openConversation(topic.id)}
                      className="min-w-0 flex-1 px-2.5 py-2 text-left text-[14px] font-normal text-[#223b57]"
                      title={topic.title}
                    >
                      <span className="line-clamp-2">{topic.title}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="mr-1 mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#5f7390] opacity-0 transition hover:bg-[#dde5ee] group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`More actions for ${topic.title}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[170px] rounded-[12px] border border-[#DCE3EC] bg-white p-1.5">
                        <DropdownMenuItem
                          onSelect={() => void deleteConversation(topic.id)}
                          disabled={deletingConversationId === topic.id}
                          className="cursor-pointer rounded-[8px] px-2 py-2 text-sm text-[#C0382B] focus:bg-[#FDECEC] focus:text-[#C0382B]"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingConversationId === topic.id ? "Deleting..." : "Delete chat"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
              {hasMoreConversations ? (
                <button
                  type="button"
                  onClick={() => void loadMoreConversations()}
                  disabled={isLoadingMoreConversations}
                  className="mt-1 w-full rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[#4e6380] transition hover:bg-[#ECEFF3] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMoreConversations ? "Loading..." : "Load more"}
                </button>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            const container = scrollContainerRef.current;
            if (!container) {
              return;
            }
            if (container.scrollTop <= 80) {
              void loadOlderMessages();
            }
          }}
          className="max-h-[calc(100vh-280px)] min-h-[420px] space-y-5 overflow-x-hidden overflow-y-auto pb-6 pr-2 [scrollbar-gutter:stable] sm:pr-3"
        >
          {isLoadingMoreMessages ? <p className="text-xs text-[#6d7f99]">Loading older messages…</p> : null}
          {isLoadingHistory ? (
            <p className="text-sm text-[#6d7f99]">Loading previous chat…</p>
          ) : (
            messages.map((message) => {
              if (message.role === "assistant" && message.content.trim().length === 0) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex w-full justify-end" : "flex w-full justify-start"}
                >
                  {message.role === "assistant" ? (
                    <div className="w-fit max-w-[82%] px-1 py-2 sm:max-w-[76%]">
                      <div className="min-w-0 max-w-full rounded-[24px] border border-[#E3E7EC] bg-white px-6 py-5">
                        <div className="break-words bg-transparent p-0 text-[#283D4D]">
                          {renderAssistantContent(message.content)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-auto flex w-fit max-w-[82%] flex-col items-end gap-1.5 sm:max-w-[76%]">
                      <div className="w-fit max-w-full break-words rounded-[18px] bg-[#0B2E4D] px-3.5 py-2 text-[15px] font-medium leading-[1.5] text-white">
                        <p className="whitespace-pre-wrap text-white">{message.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {isLoading ? (
            <div className="w-full">
              <div className="w-fit max-w-[82%] px-1 py-2 sm:max-w-[76%]">
                <div className="min-w-0 max-w-full rounded-[24px] border border-[#E3E7EC] bg-white px-6 py-5">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6B7C8F]">TS</p>
                  <p className="inline-flex items-center gap-1 text-[15px] leading-[1.75] text-[#1b324f]">
                    TS is thinking...
                    <span className="animate-pulse text-[#1d3558]">▋</span>
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-[#b42318]">{error}</p> : null}
        <form
          className="relative mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask about pricing, scope, drawings..."
            disabled={isLoading}
            rows={1}
            className="w-full resize-none overflow-y-auto rounded-[999px] border border-[#CED5DD] bg-[#EEF1F4] px-[18px] py-[14px] pr-[64px] text-[16px] leading-[1.35] text-[#13233c] outline-none focus:border-[#bfc8d4]"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="absolute right-2.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#0B2639] text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
          </section>
        </div>
      </div>
    </main>
  );
}
