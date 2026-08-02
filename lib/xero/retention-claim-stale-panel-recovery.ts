type ActionError = {
  code: string;
  message: string;
  supportReference: string | null;
};

export async function recoverSynchronizedRetentionClaimPanel<
  TState extends { status: string },
  TError extends ActionError,
>(params: {
  failed: { ok: false; error: TError };
  loadPanel: () => Promise<TState>;
}): Promise<{ ok: true; state: TState } | { ok: false; error: TError }> {
  if (params.failed.error.code !== "already_exported") {
    return params.failed;
  }
  try {
    const state = await params.loadPanel();
    return state.status === "synced"
      ? { ok: true, state }
      : params.failed;
  } catch {
    return params.failed;
  }
}
