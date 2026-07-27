import "server-only";

type Prepared<TError, TServerContext> =
  | { ok: true; proposalToken: string; serverContext?: TServerContext }
  | { ok: false; error: TError };

type Completed<TState, TError> =
  | { ok: true; state: TState }
  | { ok: false; error: TError };

export async function executeOneClickClaimPush<
  TState,
  TError,
  TServerContext = never,
>(params: {
  prepare: () => Promise<Prepared<TError, TServerContext>>;
  confirm: (
    proposalToken: string,
    serverContext?: TServerContext,
  ) => Promise<Completed<TState, TError>>;
  recover: (
    failed: Extract<Completed<TState, TError>, { ok: false }>,
  ) => Promise<Completed<TState, TError>>;
}): Promise<Completed<TState, TError>> {
  const prepared = await params.prepare();
  if (!prepared.ok) return prepared;

  const completed = await params.confirm(
    prepared.proposalToken,
    prepared.serverContext,
  );
  if (completed.ok) return completed;

  return params.recover(completed);
}
