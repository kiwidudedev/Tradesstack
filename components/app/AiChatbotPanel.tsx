"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, MoreHorizontal, Plus, Search, Send, Trash2, X } from "lucide-react";
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
        <p key={`${index}-${line}`} className="mb-2.5 whitespace-pre-wrap text-[15px] font-semibold leading-[1.4] text-[var(--text-primary)]">
          {line}
        </p>
      );
    }

    return (
      <p
        key={`${index}-${line}`}
        className={
          isBullet
            ? "mb-1.5 whitespace-pre-wrap text-[14px] leading-[1.7] text-[var(--text-primary)]"
            : "whitespace-pre-wrap text-[14px] leading-[1.7] text-[var(--text-primary)]"
        }
      >
        {line}
      </p>
    );
  });
}

export function AiChatbotPanel({ projectSlug }: { projectSlug: string; projectName?: string }) {
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const topicItems = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return conversations;
    }
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(trimmed)
    );
  }, [conversations, searchQuery]);

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
    <main className={`${styles.scope} -mb-8 -mt-6 pt-0 pb-0`} style={{ background: "var(--background)" }}>
      <div className="w-full">
        {/* Workspace surface — no outer card chrome */}
        <div className="overflow-hidden h-[calc(100vh-168px)] grid lg:grid-cols-[260px_minmax(0,1fr)]">

          {/* ── Sidebar ─ blends into workspace ────────────────── */}
          <aside className="flex flex-col border-r border-[var(--border-subtle)] min-h-0">
            {/* New chat */}
            <div className="space-y-px px-2 pt-4 pb-2">
              <button
                type="button"
                onClick={handleNewChat}
                className="group flex min-h-[36px] w-full items-center gap-3 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-[14px] font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
                New Chat
              </button>
              {isSearchOpen ? (
                <div className="flex min-h-[36px] w-full items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3">
                  <Search className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]" strokeWidth={2} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search chats"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                    aria-label="Close search"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="group flex min-h-[36px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                >
                  <Search className="h-[18px] w-[18px]" strokeWidth={2} />
                  Search chats
                </button>
              )}
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Recents
              </p>
              <div className="space-y-px">
                {topicItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] px-4 py-5 text-center">
                    <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" strokeWidth={1.5} />
                    <p className="text-[12px] text-[var(--text-secondary)]">No conversations yet</p>
                  </div>
                ) : (
                  topicItems.map((topic) => (
                    <div
                      key={topic.id}
                      className={`group flex items-center gap-1 rounded-[var(--radius-md)] transition-colors ${
                        activeConversationId === topic.id
                          ? "bg-[var(--surface-muted)]"
                          : "hover:bg-[var(--surface-muted)]/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void openConversation(topic.id)}
                        className="min-w-0 flex-1 px-3 py-2.5 text-left"
                        title={topic.title}
                      >
                        <span
                          className={`block truncate text-[12.5px] leading-[1.4] ${
                            activeConversationId === topic.id
                              ? "font-semibold text-[var(--text-primary)]"
                              : "font-normal text-[var(--text-secondary)]"
                          }`}
                        >
                          {topic.title}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`More actions for ${topic.title}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-overlay)]">
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
                    className="mt-1 w-full rounded-[var(--radius-md)] px-3 py-2 text-center text-[11.5px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingMoreConversations ? "Loading..." : "Load more"}
                  </button>
                ) : null}
              </div>
            </div>



            {/* Usage bar */}
            {usage ? (
              <div className="border-t border-[var(--border-subtle)] px-4 py-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[var(--text-secondary)]">Messages used</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {usage.used} / {usage.limit}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all"
                    style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </aside>

          {/* ── Main chat area ──────────────────────────────────── */}
          <section className="flex min-w-0 min-h-0 flex-col bg-[var(--surface)]">
            {isLoadingHistory ? (
              <div className="flex flex-1 items-center justify-center">
                <span className="inline-flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                  Loading conversation…
                </span>
              </div>
            ) : messages.length === 0 ? (
              /* Centered hero — composer as focal point, prompts below */
              <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
                <div className="w-full max-w-[720px]">
                  <div className="mb-8 flex flex-col items-center text-center">
                    <h1 className="text-[22px] font-semibold leading-[1.25] text-[var(--text-primary)]">
                      How can I help you today?
                    </h1>
                  </div>

                  {error ? (
                    <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
                      <span className="font-semibold">Error:</span> {error}
                    </div>
                  ) : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSend();
                    }}
                  >
                    <div className="flex items-end gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 shadow-[0_0_0_1px_var(--primary),0_0_0_4px_var(--primary-soft)]">
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
                        className="min-h-[28px] flex-1 resize-none bg-transparent text-[14px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={!canSend}
                        className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </button>
                    </div>
                  </form>

                  {/* Suggested prompts — directly below composer */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void handleSend(prompt)}
                        className="rounded-full bg-[var(--surface-muted)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
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
                  className="flex-1 overflow-x-hidden overflow-y-auto px-8 pt-6 pb-4 space-y-6 [scrollbar-gutter:stable]"
                >
                  {isLoadingMoreMessages ? (
                    <p className="text-center text-[11.5px] text-[var(--text-muted)]">Loading older messages…</p>
                  ) : null}

                  {messages.map((message) => {
                    if (message.role === "assistant" && message.content.trim().length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={message.id}
                        className={message.role === "user" ? "flex w-full justify-end" : "flex w-full items-start gap-3"}
                      >
                        {message.role === "assistant" ? (
                          <div className="max-w-[76%]">
                            <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3.5">
                              <div className="break-words">{renderAssistantContent(message.content)}</div>
                            </div>
                            <p className="mt-1.5 ml-1 text-[11px] text-[var(--text-muted)]">{formatShortTimestamp(message.createdAt)}</p>
                          </div>
                        ) : (
                          <div className="flex max-w-[72%] flex-col items-end gap-1">
                            <div className="rounded-[var(--radius-md)] bg-[var(--navy-primary)] px-4 py-3">
                              <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-white">{message.content}</p>
                            </div>
                            <p className="mr-1 text-[11px] text-[var(--text-muted)]">{formatShortTimestamp(message.createdAt)}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Thinking indicator */}
                  {isLoading ? (
                    <div className="flex items-start gap-3">
                      <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                          Thinking
                          <span className="flex gap-0.5">
                            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:0ms]" />
                            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:150ms]" />
                            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:300ms]" />
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Composer — bottom of chat flow */}
                <div className="bg-[var(--surface)] px-8 pt-2 pb-6">
                  {error ? (
                    <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
                      <span className="font-semibold">Error:</span> {error}
                    </div>
                  ) : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSend();
                    }}
                  >
                    <div className="flex items-end gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 shadow-[0_0_0_1px_var(--primary),0_0_0_4px_var(--primary-soft)]">
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
                        className="min-h-[28px] flex-1 resize-none bg-transparent text-[14px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={!canSend}
                        className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
