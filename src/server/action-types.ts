/** Shared between server actions and client forms (no server-only imports). */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
} | null;
