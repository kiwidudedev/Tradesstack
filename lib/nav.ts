export const marketingLinks = [
  { label: "For builders", href: "#paths" },
  { label: "For tradies", href: "#paths" }
];

export const mainDashboardNav = [
  { label: "Dashboard", href: "/app/dashboard", icon: "LayoutGrid" },
  { label: "Project Space", href: "/app/projects", icon: "FolderKanban" },
  { label: "Settings", href: "/app/settings", icon: "Settings" }
] as const;

export const projectDashboardNav = [
  { label: "Project Dashboard", segment: "dashboard", icon: "LayoutGrid" },
  { label: "Trade Pack Builder", segment: "drawing-intelligence", icon: "BrainCircuit" },
  { label: "Scope Builder", segment: "scope-builder", icon: "ClipboardCheck" },
  { label: "Change Detection", segment: "change-detection", icon: "RefreshCw" },
  { label: "AI Assistant", segment: "ai-chatbot", icon: "MessagesSquare" }
] as const;
