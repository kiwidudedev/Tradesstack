export const marketingLinks = [
  { label: "For builders", href: "#paths" },
  { label: "For tradies", href: "#paths" }
];

export const mainDashboardNav = [
  { label: "Dashboard", href: "/app/dashboard", icon: "LayoutGrid" },
  { label: "Leads & Clients", href: "/app/leads-clients", icon: "Users" },
  { label: "Projects", href: "/app/projects", icon: "FolderKanban" },
  { label: "Settings", href: "/app/settings", icon: "Settings" }
] as const;

export const projectDashboardNav = [
  { label: "Dashboard", segment: "dashboard", icon: "LayoutGrid" },
  { label: "Financial", segment: "preconstruction", icon: "FolderKanban" },
  { label: "Trade Pack Builder", segment: "drawing-intelligence", icon: "BrainCircuit" },
  { label: "Specification Review", segment: "spec-finishes-review", icon: "FileText" },
  { label: "Scope Builder", segment: "scope-builder", icon: "ClipboardCheck" },
  { label: "Change Detection", segment: "change-detection", icon: "RefreshCw" },
  { label: "AI Assistant", segment: "ai-chatbot", icon: "MessagesSquare" }
] as const;
