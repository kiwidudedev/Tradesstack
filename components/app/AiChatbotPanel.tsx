"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { mockUser } from "@/lib/mock";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
}

const SUGGESTED_PROMPTS = [
  "What is included in preliminaries?",
  "What drawings should a roofing subcontractor price from?",
  "What does PS1 mean in NZ construction?",
  "What are common exclusions for electrical pricing?",
];

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function formatAssistantContent(content: string) {
  return content.replace(/^\s*-\s+/gm, "• ");
}

function renderAssistantContent(content: string) {
  const lines = formatAssistantContent(content).split("\n");
  const firstHeadingLineIndex = lines.findIndex((line) => line.trim().length > 0 && !/^\s*•\s+/.test(line));

  return lines.map((line, index) => {
    const isHeading = index === firstHeadingLineIndex;
    const isBullet = /^\s*•\s+/.test(line);
    if (isHeading) {
      return (
        <p key={`${index}-${line}`} className="mb-[10px] whitespace-pre-wrap text-[16px] font-semibold leading-snug">
          {line}
        </p>
      );
    }

    return (
      <p
        key={`${index}-${line}`}
        className={isBullet ? "mb-[6px] whitespace-pre-wrap leading-[1.45]" : "whitespace-pre-wrap leading-[1.45]"}
      >
        {line}
      </p>
    );
  });
}

export function AiChatbotPanel({ projectSlug }: { projectSlug: string }) {
  const { session } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userInitials = getInitials(session?.name ?? mockUser.name);

  const canSend = useMemo(() => inputValue.trim().length > 0 && !isLoading, [inputValue, isLoading]);
  const shouldShowEmptyPrompts = !isLoadingHistory && messages.length === 0;
  const usagePercent = useMemo(() => {
    if (!usage || usage.limit <= 0) {
      return 0;
    }
    return Math.min((usage.used / usage.limit) * 100, 100);
  }, [usage]);
  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
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
      try {
        const response = await fetch(`/api/chat?projectSlug=${encodeURIComponent(projectSlug)}`, {
          method: "GET",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (isMounted) {
            setError(body?.error ?? "Failed to load chat history.");
          }
          return;
        }

        const body = (await response.json()) as {
          messages?: Array<{ id: string; role: ChatRole; content: string }>;
          usage?: { used?: number; limit?: number; remaining?: number };
        };
        if (!isMounted) {
          return;
        }

        const historicalMessages = Array.isArray(body.messages)
          ? body.messages
              .filter(
                (message) =>
                  (message.role === "user" || message.role === "assistant") &&
                  typeof message.content === "string" &&
                  message.content.trim().length > 0
              )
              .map((message) => ({
                id: message.id || generateId(),
                role: message.role,
                content: message.content,
              }))
          : [];

        setMessages(historicalMessages);
        if (
          typeof body.usage?.used === "number" &&
          typeof body.usage?.limit === "number" &&
          typeof body.usage?.remaining === "number"
        ) {
          setUsage({
            used: body.usage.used,
            limit: body.usage.limit,
            remaining: body.usage.remaining,
          });
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

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

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

  return (
    <Card className="mx-auto max-w-[760px] border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <CardHeader className="space-y-3 border-b border-[#E5E7EB]">
        <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Construction AI Assistant</CardTitle>
        <p className="max-w-3xl text-sm text-[#5b6b84]">
          Ask questions about NZ/AUS construction.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={scrollContainerRef}
          className="h-[460px] space-y-3 overflow-y-auto rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFC] p-4"
        >
          {isLoadingHistory ? (
            <p className="text-sm text-[#6d7f99]">Loading previous chat…</p>
          ) : shouldShowEmptyPrompts ? (
            <div className="space-y-4">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#0F2E57] text-xs font-semibold tracking-[0.06em] text-white">
                TS
              </div>
              <p className="text-sm text-[#6d7f99]">Start by asking a question.</p>
              <div className="flex flex-wrap gap-2.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      setInputValue(prompt);
                    }}
                    className="cursor-pointer rounded-[6px] border border-[#E5E7EB] bg-white px-[14px] py-[8px] text-xs text-[#36527a] transition hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-50"
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
                <div key={message.id} className={message.role === "user" ? "my-4 ml-auto max-w-[92%]" : "my-4 max-w-[92%]"}>
                {message.role === "assistant" ? (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 mr-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#0F2E57] text-[10px] font-semibold tracking-[0.06em] text-white">
                      TS
                    </div>
                    <div className="rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFC] p-[18px] text-sm leading-relaxed text-[#13233c]">
                      {renderAssistantContent(message.content)}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-end gap-3">
                    <div className="rounded-[6px] bg-[#F74917] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#1F2937] text-[10px] font-semibold tracking-[0.06em] text-white">
                      {userInitials}
                    </div>
                  </div>
                )}
                </div>
              );
            })
          )}
          {isLoading ? (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 mr-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#0F2E57] text-[10px] font-semibold tracking-[0.06em] text-white">
                TS
              </div>
              <div className="rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] p-[18px] text-sm text-[#13233c]">
                <p className="inline-flex items-center gap-1 text-xs text-[#6d7f99]">
                  TS is thinking...
                  <span className="animate-pulse text-[#1d3558]">▋</span>
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}

        <form
          className="flex gap-2"
          style={{ marginTop: "18px" }}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Ask about pricing, scope, coordination or drawings..."
            disabled={isLoading}
            className="h-[52px] rounded-[6px] pl-[18px]"
          />
          <Button
            type="submit"
            disabled={!canSend}
            className="h-[52px] bg-[#FF5A1F] px-6 text-white hover:bg-[#F04C11] disabled:opacity-40"
          >
            Send
          </Button>
        </form>
        <p className="mt-[6px] text-[12px] leading-[1.4] text-[#6B7280]">
          For guidance only. Verify against drawings, specifications, and applicable standards.
        </p>
        <div className="mt-[12px] flex justify-start">
        {isUsageOpen ? (
          <div className="w-full max-w-[340px] rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFC] px-[14px] py-[12px]">
            <button
              type="button"
              onClick={() => setIsUsageOpen(false)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-[13px] font-medium text-[#374151]">AI usage this month</span>
              <span className="text-[12px] text-[#6B7280]">Hide</span>
            </button>

            {usage ? (
              <div className="mt-[8px] space-y-0">
                <div className="flex items-center justify-between text-[13px] font-medium text-[#374151]">
                  <p>Usage</p>
                  <p>
                    {usage.used} of {usage.limit} used
                  </p>
                </div>
                <div className="mt-[8px] h-[6px] w-full overflow-hidden rounded-[6px] bg-[#E5E7EB]">
                  <div className="h-full rounded-[6px] bg-[#FF5A1F]" style={{ width: `${usagePercent}%` }} />
                </div>
                <p className="mt-[6px] text-[12px] text-[#6B7280]">{usage.remaining} remaining</p>
              </div>
            ) : (
              <p className="mt-[4px] text-[12px] text-[#6B7280]">Usage data unavailable right now.</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsUsageOpen(true)}
            className="text-[12px] font-medium text-[#6B7280] transition hover:text-[#374151]"
          >
            Show AI usage
          </button>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
