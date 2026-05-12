export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen min-h-screen w-full overflow-hidden bg-[var(--app-canvas)]">{children}</div>;
}
