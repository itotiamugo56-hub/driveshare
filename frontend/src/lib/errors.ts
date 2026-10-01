/** The API client rejects with { statusCode, message }; older callers may still see axios-style errors. */
export function errStatus(err: unknown): number | undefined {
  const e = err as { statusCode?: number; response?: { status?: number } } | null;
  return e?.statusCode ?? e?.response?.status;
}

/** The server's own sentence, for 4xx errors whose message is already written for renters. */
export function serverMessage(err: unknown): string | undefined {
  const s = errStatus(err);
  const m = (err as { message?: string } | null)?.message;
  return s && s >= 400 && s < 500 && s !== 401 && m ? m : undefined;
}

/** Turns any thrown error into a calm, plain sentence that says what happened and what to do next. */
export function friendlyError(err: unknown, what: string): string {
  const e = err as { code?: string; message?: string } | null;
  const status = errStatus(err);
  if (e?.code === 'ERR_NETWORK' || status === 0 || (status == null && /network|fetch/i.test(e?.message ?? '')))
    return `We can't reach DriveShare right now. Check your internet connection, then try again.`;
  if (status === 401 || status === 403) return `Sign in to see ${what}.`;
  if (status === 404) return `We couldn't find ${what}. It may have been removed.`;
  if (status && status >= 500) return `Something went wrong on our side while loading ${what}. Nothing you did caused it. Try again in a minute.`;
  return `We couldn't load ${what}. Try again.`;
}
