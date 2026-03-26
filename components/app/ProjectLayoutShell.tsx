"use client";

export default function ProjectLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="space-y-8 pb-8">{children}</main>;
}
