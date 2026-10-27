import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export type AuditInput = {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Must never contain secrets, financial credentials or confidential prayer content. */
  metadata?: Prisma.InputJsonValue;
};

export async function audit(input: AuditInput, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    },
  });
}
