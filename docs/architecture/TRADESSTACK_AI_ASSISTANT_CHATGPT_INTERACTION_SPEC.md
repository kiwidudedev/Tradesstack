# TradesStack AI Assistant — ChatGPT-style Interaction Spec

This is the interaction contract for the reusable shell-level TradesStack Assistant. It keeps the current workspace visible while providing a conversational project-aware surface.

- Closed state: the current workspace page remains unchanged and a small AI trigger is available from the shell.
- Open state: the Assistant appears as a right-side conversational panel while the current page remains visible. Mobile uses a full-width surface with an explicit close action.
- Panel sizing: approximately 400–460px on desktop, bounded by the viewport on smaller screens.
- Header: compact controls show TradesStack AI, the current project, conversation title, history, new chat, mode and close controls.
- Empty state: a short project-aware greeting and a small set of construction prompts such as “How are we looking?”, “What should I chase today?” and “Give me the QS view.”
- Composer: persistent bottom composer with `Ask TradesStack AI`, Enter to send and Shift+Enter for a newline.
- Conversations: history persists across panel close/reopen and workspace navigation. New Chat clears only the active conversation view.
- Context: route, module and record context inform retrieval, but the server remains authoritative for organization membership, permissions, project access, citations and tool execution.
- Work state: the UI shows a concise working indicator without exposing chain-of-thought, prompts or raw tool payloads.
- Sources: answers expose compact record-level links where available; document content is never implied when only metadata was retrieved.
- Actions: draft/create requests show structured confirmation-required proposals. No action is reported as completed until the normal TradesStack domain action succeeds.
