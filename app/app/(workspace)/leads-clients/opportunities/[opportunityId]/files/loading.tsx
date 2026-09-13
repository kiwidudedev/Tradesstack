export default function OpportunityFilesLoading() {
  return (
    <div aria-label="Loading files" className="animate-pulse space-y-4">
      <div className="h-10 w-48 rounded-[var(--radius-md)] bg-[var(--surface-muted)]" />
      <div className="h-24 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
      <div className="h-72 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
    </div>
  );
}
