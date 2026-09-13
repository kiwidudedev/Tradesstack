export default function TakeoffLoading() {
  return (
    <div className="min-h-[420px] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" role="status">
      <div className="h-6 w-40 rounded bg-slate-200" />
      <div className="mt-5 h-48 rounded-xl bg-slate-100" />
      <span className="sr-only">Loading Takeoff…</span>
    </div>
  );
}
