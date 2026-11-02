import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "./auth/current-user";
import { getOrgContext, type OrgContext } from "./tenancy/context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "./errors";
import type { Permission } from "./tenancy/permissions";
import { runAction, type ActionState } from "./action";
import { getCurrentUser } from "./auth/current-user";

/** Resolves the org context for a page, mapping access failures to a 404 so nothing leaks. */
export async function pageOrgContext(slug: string, permission?: Permission | Permission[]): Promise<OrgContext> {
  const user = await requireUser(`/o/${slug}`);
  let ctx: OrgContext;
  try {
    ctx = await getOrgContext(user, { slug });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (permission) {
    const perms = Array.isArray(permission) ? permission : [permission];
    if (!perms.some((p) => ctx.permissions.has(p))) notFound();
  }
  return ctx;
}

/** Wraps an org-scoped server action: authenticates, resolves membership, runs `fn`. */
export async function withOrg(slug: string, fd: FormData | undefined, fn: (ctx: OrgContext) => Promise<ActionState | void>): Promise<ActionState> {
  return runAction(fd, async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const ctx = await getOrgContext(user, { slug });
    return fn(ctx);
  });
}

/** Wraps a server action that needs only a signed-in user. */
export async function withUser(fd: FormData | undefined, fn: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<ActionState | void>): Promise<ActionState> {
  return runAction(fd, async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    return fn(user);
  });
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
