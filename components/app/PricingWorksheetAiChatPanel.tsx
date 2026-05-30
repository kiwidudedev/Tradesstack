"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";

type Props = {
  answer: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
  warnings: string[];
  changedCellCount: number;
  isAnswerOnly: boolean;
  canApply: boolean;
  hasBlockingWarning: boolean;
  hasResponse: boolean;
  error: string | null;
  followUpPrompt: string;
  isSubmittingFollowUp: boolean;
  isSubmittingReview: boolean;
  onFollowUpPromptChange: (value: string) => void;
  onSubmitFollowUp: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
};

type ThreadMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      answer: string;
      summary: string;
      assumptions: string[];
      warnings: string[];
      note: string | null;
    };

type AssistantTextBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean };

function cleanAssistantText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/\s+—\s+/g, " - ")
    .trim();
}

function parseAssistantText(text: string) {
  const lines = cleanAssistantText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: AssistantTextBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listIsOrdered = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({ kind: "list", items: listItems, ordered: listIsOrdered });
    listItems = [];
    listIsOrdered = false;
  };

  lines.forEach((line) => {
    const heading = line.match(/^(.{3,64}):$/);
    const orderedItem = line.match(/^\d+[\).\s]+(.+)$/);
    const bulletItem = line.match(/^[-•]\s+(.+)$/);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading[1] });
      return;
    }

    if (orderedItem || bulletItem) {
      flushParagraph();
      const isOrdered = Boolean(orderedItem);
      const item = (orderedItem?.[1] ?? bulletItem?.[1] ?? "").trim();

      if (listItems.length > 0 && listIsOrdered !== isOrdered) {
        flushList();
      }

      listIsOrdered = isOrdered;
      listItems.push(item);
      return;
    }

    flushList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return blocks;
}

function renderAssistantText(text: string, tone: "primary" | "secondary" = "primary") {
  const blocks = parseAssistantText(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p
              key={`${index}-${block.text}`}
              className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
            >
              {block.text}
            </p>
          );
        }

        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={`${index}-${block.items[0]}`}
              className={`space-y-2 ${block.ordered ? "list-decimal pl-5" : ""}`}
            >
              {block.items.map((item) => (
                <li
                  key={item}
                  className={
                    block.ordered
                      ? "text-[14px] leading-[1.65] text-[var(--text-primary)]"
                      : "flex gap-2 text-[14px] leading-[1.65] text-[var(--text-primary)]"
                  }
                >
                  {block.ordered ? null : <span className="text-[var(--text-muted)]">•</span>}
                  <span>{item}</span>
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p
            key={`${index}-${block.text.slice(0, 24)}`}
            className={`whitespace-pre-wrap text-[15px] leading-[1.65] ${
              tone === "secondary" ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
            }`}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function PricingWorksheetAiChatPanel({
  answer,
  summary,
  confidence,
  assumptions,
  warnings,
  changedCellCount,
  isAnswerOnly,
  canApply,
  hasBlockingWarning,
  hasResponse,
  error,
  followUpPrompt,
  isSubmittingFollowUp,
  isSubmittingReview,
  onFollowUpPromptChange,
  onSubmitFollowUp,
  onApprove,
  onReject,
  onClose,
}: Props) {
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const lastAnswerRef = useRef<string | null>(null);
  const messageCounterRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isBusy = isSubmittingFollowUp || isSubmittingReview;
  const canSendFollowUp = followUpPrompt.trim().length > 0 && !isBusy;

  // The board hands us one assistant response at a time. Whenever a new
  // (non-empty) answer arrives, append it to the local thread so follow-ups
  // read like a conversation instead of replacing the previous message.
  useEffect(() => {
    const trimmed = answer.trim();
    if (!trimmed || lastAnswerRef.current === trimmed) {
      return;
    }
    lastAnswerRef.current = trimmed;
    messageCounterRef.current += 1;
    const note = isAnswerOnly
      ? null
      : `Built into your sheet${changedCellCount > 0 ? ` · ${changedCellCount} cells changed` : ""}`;
    setThread((previous) => [
      ...previous,
      {
        id: `assistant-${messageCounterRef.current}`,
        role: "assistant",
        answer,
        summary,
        assumptions,
        warnings,
        note,
      },
    ]);
  }, [answer, summary, assumptions, warnings, isAnswerOnly, changedCellCount]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [thread, isSubmittingFollowUp]);

  const handleSend = () => {
    const text = followUpPrompt.trim();
    if (!text || isBusy) {
      return;
    }
    messageCounterRef.current += 1;
    setThread((previous) => [...previous, { id: `user-${messageCounterRef.current}`, role: "user", text }]);
    onSubmitFollowUp();
  };

  return (
    <aside className="pointer-events-auto flex h-full w-[420px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_20px_56px_rgba(15,23,42,0.16)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
            <Sparkles className="h-[16px] w-[16px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-[var(--text-primary)]">AI assistant</div>
            <div className="truncate text-[12px] text-[var(--text-secondary)]">
              {isAnswerOnly ? "Answer ready" : `Built on sheet · ${confidence} confidence`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Close AI assistant"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
        {thread.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex w-full justify-end">
              <div className="max-w-[78%] rounded-[var(--radius-md)] rounded-br-[4px] bg-[var(--navy-primary)] px-4 py-3">
                <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-white">{message.text}</p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex w-full items-start">
              <div className="max-w-full">
                <div className="px-1 py-1">
                  {renderAssistantText(message.answer)}

                  {message.summary && message.summary.trim() !== message.answer.trim() ? (
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      {renderAssistantText(message.summary, "secondary")}
                    </div>
                  ) : null}

                  {message.assumptions.length > 0 ? (
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">What I assumed</p>
                      <ul className="space-y-1">
                        {message.assumptions.map((assumption) => (
                          <li
                            key={assumption}
                            className="flex gap-2 text-[14px] leading-[1.7] text-[var(--text-primary)]"
                          >
                            <span className="text-[var(--text-muted)]">•</span>
                            <span>{assumption}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {message.warnings.length > 0 ? (
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">Worth checking</p>
                      <ul className="space-y-1">
                        {message.warnings.map((warning) => (
                          <li
                            key={warning}
                            className="flex gap-2 text-[14px] leading-[1.7] text-[var(--text-primary)]"
                          >
                            <span className="text-[var(--warning)]">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                {message.note ? (
                  <p className="mt-1.5 ml-2 text-[11px] text-[var(--text-muted)]">{message.note}</p>
                ) : null}
              </div>
            </div>
          )
        )}

        {isSubmittingFollowUp ? (
          <div className="flex w-full items-start">
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

      <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-5 pt-3 pb-4">
        {error ? (
          <div className="mb-3 rounded-[var(--radius-md)] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
            <span className="font-semibold">Error:</span> {error}
          </div>
        ) : null}

        {!isAnswerOnly && !canApply ? (
          <div className="mb-3 rounded-[var(--radius-md)] bg-[var(--warning-light)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)]">
            You can review this, but applying worksheet edits requires write permission.
          </div>
        ) : null}

        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={isBusy || !hasResponse}
            className="flex h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnswerOnly ? "Dismiss" : "Reject"}
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={isBusy || !hasResponse || (!isAnswerOnly && (!canApply || hasBlockingWarning))}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--primary)] text-[14px] font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmittingReview ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.4} />
            )}
            {isSubmittingReview ? "Saving…" : isAnswerOnly ? "Done" : "Approve"}
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
        >
          <div className="flex min-h-[112px] items-end gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_4px_var(--primary-soft)]">
            <textarea
              value={followUpPrompt}
              onChange={(event) => onFollowUpPromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a follow-up or request a change…"
              disabled={isBusy}
              rows={1}
              className="min-h-[84px] flex-1 resize-none bg-transparent text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSendFollowUp}
              aria-label="Send follow-up"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
