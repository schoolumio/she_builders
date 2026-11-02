/** Shared between server actions and client forms (no server-only imports). */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Extra data for the form that submitted (e.g. one-time recovery codes). Never cached. */
  data?: Record<string, unknown>;
} | null;
