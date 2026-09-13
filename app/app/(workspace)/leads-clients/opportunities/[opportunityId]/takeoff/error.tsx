"use client";

export default function TakeoffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white px-6 py-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Takeoff could not be loaded</h2>
      <p className="mt-2 text-sm text-slate-600">Please retry the request. Existing measurement data is unchanged.</p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-[#f15a29] px-4 py-2 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
