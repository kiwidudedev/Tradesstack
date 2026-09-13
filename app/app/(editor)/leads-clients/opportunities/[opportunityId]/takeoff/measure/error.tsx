"use client";

import Link from "next/link";

export default function TakeoffMeasureError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#dce4ee] bg-white px-6 py-6 text-center shadow-lg">
        <h1 className="text-lg font-semibold text-[#1d2433]">Measure could not be opened</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b7c93]">
          The drawing or measurement request did not complete. Your saved Takeoff data has not been changed.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-[#f15a29] px-4 py-2 text-sm font-semibold text-white">
            Try again
          </button>
          <Link href="/app/leads-clients/opportunities" className="rounded-lg border border-[#cbd5e1] px-4 py-2 text-sm font-semibold text-[#334155]">
            Back to opportunities
          </Link>
        </div>
      </div>
    </div>
  );
}
