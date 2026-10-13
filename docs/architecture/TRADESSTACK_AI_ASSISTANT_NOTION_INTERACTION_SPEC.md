# TradesStack AI Assistant — Notion Interaction Spec

This is the interaction contract for the reusable shell-level assistant. It is based on direct observation of Notion's current AI sidecar, not on a full-page assistant route.

- Closed state: the current workspace page remains unchanged and a small AI trigger is available from the shell.
- Open state: AI appears as a right-side sidecar while the current page remains visible. Desktop uses a fixed panel; mobile uses a full-width drawer with a dismissible scrim.
- Panel sizing: approximately 380–440px on desktop, bounded by the viewport on smaller screens. The panel has a visible left separator and a subtle shadow.
- Motion: opening and closing uses a short horizontal slide; opening does not navigate or replace the current page.
- Header: compact controls include the current chat title (`New AI chat` when empty), chat history, start-new-chat, mode/actions affordances where applicable, and hide/close.
- Empty state: centered AI identity, “How can I help you today?”, and contextual suggested actions. TradesStack suggestions remain read-only and project-aware.
- Composer: persistent bottom composer with a clear `Ask TradesStack AI` placeholder, options affordance, model/approval status where supported, and send action. Enter sends; Shift+Enter inserts a newline.
- Conversations: history is available from the compact header and remains persistent across panel close/reopen and workspace navigation. Starting a new chat clears only the active conversation view.
- Context: the shell derives the current route/module and project when available. The server remains the authority for organization membership, permissions, project access, citations, and tool execution.
- Responsive behavior: page visibility is preserved on desktop; mobile prioritizes the assistant surface while retaining an explicit close action.

Observed Notion details: the page and left navigation remain visible, the sidecar has a splitter, and its empty state offers “Summarize this page”, “Translate this page”, “Analyze for insights”, and “Create a task tracker” above a composer with add-options, approval-mode, model, and submit controls.
