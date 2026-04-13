"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquare, MoreHorizontal, Plus, Send, Trash2 } from "lucide-react";
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

const EXAMPLE_PROMPTS = [
  "What trades are in the latest drawing?",
  "Show me the cost breakdown",
  "Identify any project risks",
  "Estimate materials for this scope",
];

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

function formatShortTimestamp(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
        <p key={`${index}-${line}`} className="mb-2.5 whitespace-pre-wrap text-[15px] font-semibold leading-[1.4] text-[#0f2238]">
          {line}
        </p>
      );
    }

    return (
      <p
        key={`${index}-${line}`}
        className={
          isBullet
            ? "mb-1.5 whitespace-pre-wrap text-[14px] leading-[1.7] text-[#1b324f]"
            : "whitespace-pre-wrap text-[14px] leading-[1.7] text-[#1b324f]"
        }
      >
        {line}
      </p>
    );
  });
}

export function AiChatbotPanel({ projectSlug, projectName }: { projectSlug: string; projectName: string }) {
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

  const activeConversationTitle = conversations.find((c) => c.id === activeConversationId)?.title ?? null;

  return (
    <main className={`${styles.scope} -mb-8 -mt-4 pt-0 pb-0`} style={{ background: "#F9FAFC" }}>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-4">
        {/* Outer card */}
        <div className="overflow-hidden rounded-lg border border-[#E2E8F1] bg-[#F9FAFC] shadow-[0_2px_12px_rgba(15,23,42,0.06)] h-[calc(100vh-192px)] grid lg:grid-cols-[260px_minmax(0,1fr)]">

          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="flex flex-col border-r border-[#E8EEF6] bg-[#F9FAFC] min-h-0">
            {/* Sidebar header */}
            <div className="px-4 pt-5 pb-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F15A29]">
                  <Bot className="h-4 w-4 text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0F172A] leading-tight">{projectName}</p>
                  <p className="text-[11px] font-medium tracking-[0.06em] text-[#8A9BB0] leading-tight">AI ASSISTANT</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="inline-flex w-full h-8 items-center justify-center gap-1.5 rounded-md bg-[#F15A29] px-3 text-[12px] font-semibold text-white transition hover:bg-[#d94f22] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                New Chat
              </button>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <p className="mb-1 px-2 text-[13px] font-medium text-[#8A9BB0]">
                Recents
              </p>
              <div className="space-y-0.5">
                {topicItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[#D8E2EE] bg-white/60 px-4 py-5 text-center">
                    <MessageSquare className="h-5 w-5 text-[#B0BEC5]" strokeWidth={1.5} />
                    <p className="text-[12px] text-[#8A9BB0]">No conversations yet</p>
                  </div>
                ) : (
                  topicItems.map((topic) => (
                    <div
                      key={topic.id}
                      className={`group flex items-center gap-1 rounded-lg transition-all ${
                        activeConversationId === topic.id
                          ? "bg-[#E4E9F0]"
                          : "hover:bg-[#EAEEF4]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void openConversation(topic.id)}
                        className="min-w-0 flex-1 px-3 py-3 text-left"
                        title={topic.title}
                      >
                        <span
                          className={`block truncate text-[12px] leading-[1.4] ${
                            activeConversationId === topic.id ? "font-medium text-[#0F2238]" : "font-normal text-[#4A6080]"
                          }`}
                        >
                          {topic.title}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#8A9BB0] opacity-0 transition hover:bg-[#D4DAE4] hover:text-[#3D556E] group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`More actions for ${topic.title}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] rounded-md border border-[#DCE3EC] bg-white p-1.5 shadow-lg">
                          <DropdownMenuItem
                            onSelect={() => void deleteConversation(topic.id)}
                            disabled={deletingConversationId === topic.id}
                            className="cursor-pointer rounded px-2.5 py-2 text-[13px] text-[#C0382B] focus:bg-[#FDECEC] focus:text-[#C0382B]"
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
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
                    className="mt-1 w-full rounded-md px-3 py-2 text-center text-[11.5px] font-medium text-[#5f7a96] transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingMoreConversations ? "Loading..." : "Load more"}
                  </button>
                ) : null}
              </div>
            </div>



            {/* Usage bar */}
            {usage ? (
              <div className="border-t border-[#E8EEF6] px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#8A9BB0]">Messages used</span>
                  <span className="text-[11px] font-semibold text-[#5D708C]">
                    {usage.used} / {usage.limit}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-[#E2EAF4] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F15A29] transition-all"
                    style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </aside>

          {/* ── Main chat area ──────────────────────────────────── */}
          <section className="flex min-w-0 min-h-0 flex-col bg-[#F9FAFC]">

            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-[#E8EEF6] bg-[#F9FAFC] px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-[#0F2238]">
                  {activeConversationTitle ?? "New Conversation"}
                </p>
              </div>
            </div>

            {/* Messages scroll area */}
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
              className="flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 space-y-5 [scrollbar-gutter:stable]"
            >
              {isLoadingMoreMessages ? (
                <p className="text-center text-[11.5px] text-[#9BAABB]">Loading older messages…</p>
              ) : null}

              {isLoadingHistory ? (
                <div className="flex items-center gap-2 text-[13px] text-[#8A9BB0]">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#C5D3E0] border-t-[#4E73A0]" />
                  Loading conversation…
                </div>
              ) : messages.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-start gap-5 pt-2">
                  {/* Welcome bubble */}
                  <div className="flex items-start gap-3">
                    <div className="max-w-[75%] rounded-lg rounded-tl-sm bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.07)] ring-1 ring-[#E4EAF4]">
                      <p className="text-[14px] leading-[1.65] text-[#1F3550]">
                        Hello! I&apos;m your TradesStack AI Assistant. I can help you analyse drawings, estimate materials, identify risks, and answer questions about your projects.
                      </p>
                      <p className="mt-1.5 text-[12px] font-medium text-[#8A9BB0]">
                        How can I help you today?
                      </p>
                    </div>
                  </div>

                  {/* Example prompts */}
                  <div className="ml-10 flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void handleSend(prompt)}
                        className="rounded-md border border-[#D6E2EF] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#3D6A96] transition hover:border-[#4E73A0] hover:bg-[#EEF4FB] hover:text-[#1E4E7E]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  if (message.role === "assistant" && message.content.trim().length === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={message.id}
                      className={message.role === "user" ? "flex w-full justify-end" : "flex w-full items-start gap-3"}
                    >
                      {message.role === "assistant" ? (
                        <>
                          <div className="max-w-[76%]">
                            <div className="rounded-lg rounded-tl-sm bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.07)] ring-1 ring-[#E4EAF4]">
                              <div className="break-words">{renderAssistantContent(message.content)}</div>
                            </div>
                            <p className="mt-1.5 ml-1 text-[11px] text-[#9BAABB]">{formatShortTimestamp(message.createdAt)}</p>
                          </div>
                        </>
                      ) : (
                        <div className="flex max-w-[72%] flex-col items-end gap-1">
                          <div className="rounded-lg rounded-br-sm bg-[#0B2E4D] px-4 py-3 shadow-[0_1px_4px_rgba(11,46,77,0.18)]">
                            <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-white">{message.content}</p>
                          </div>
                          <p className="mr-1 text-[11px] text-[#9BAABB]">{formatShortTimestamp(message.createdAt)}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Thinking indicator */}
              {isLoading ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg rounded-tl-sm bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.07)] ring-1 ring-[#E4EAF4]">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#6A869E]">
                      Thinking
                      <span className="flex gap-0.5">
                        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#F15A29] [animation-delay:0ms]" />
                        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#F15A29] [animation-delay:150ms]" />
                        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#F15A29] [animation-delay:300ms]" />
                      </span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Composer */}
            <div className="border-t border-[#E8EEF6] bg-[#F9FAFC] px-5 py-4">
              {error ? (
                <div className="mb-3 flex items-center gap-2 rounded-md bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
                  <span className="font-semibold">Error:</span> {error}
                </div>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
              >
                <div className="flex items-end gap-3 rounded-lg border border-[#D0DAE8] bg-[#F9FAFC] px-4 py-3 transition-all focus-within:border-[#9DB5D0] focus-within:bg-[#F9FAFC] focus-within:shadow-[0_0_0_3px_rgba(78,115,160,0.08)]">
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
                    placeholder="Ask me anything about your projects..."
                    disabled={isLoading}
                    rows={1}
                    className="min-h-[28px] flex-1 resize-none bg-transparent text-[14px] leading-[1.5] text-[#13233c] outline-none placeholder:text-[#9BAABB] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F15A29] text-white transition hover:bg-[#d94f22] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </button>
                </div>
                <p className="mt-2 px-1 text-[11.5px] text-[#9BAABB]">
                  Try asking: &quot;What trades are in the latest drawing?&quot; or &quot;Show me the cost breakdown&quot;
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
