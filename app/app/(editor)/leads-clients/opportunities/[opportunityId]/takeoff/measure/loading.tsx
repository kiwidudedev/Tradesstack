export default function TakeoffMeasureLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-6" role="status">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 px-6 py-5 text-center shadow-lg">
        <p className="text-base font-semibold text-[#1d2433]">Opening Measure</p>
        <p className="mt-2 text-sm text-[#6b7c93]">Loading the selected drawing and measurement data…</p>
      </div>
    </div>
  );
}
