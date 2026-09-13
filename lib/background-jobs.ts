/** Background work is opt-in independently of authentication and provider keys. */
export function isBackgroundJobEnabled(job: string): boolean {
  return (process.env.TRADESSTACK_ENABLED_BACKGROUND_JOBS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(job);
}
