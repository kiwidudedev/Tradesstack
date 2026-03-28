"use client";

export default function ProjectLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="project-theme space-y-8 bg-[#F8F9FC] pb-8">{children}</main>;
}
