import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

/**
 * Prisma over node-postgres (`pg`), as Neon recommends for Node.js runtimes such as Vercel Fluid
 * compute. On Neon, DATABASE_URL is the pooled (`-pooler`) connection string; migrations use the
 * direct one (DATABASE_URL_UNPOOLED). Any ordinary Postgres URL works the same way locally.
 */
function createClient() {
  // A missing URL fails on the first query (not at import), so builds without a database still work.
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  // Prisma-only parameters that node-postgres would otherwise send to the server as startup options.
  const schema = url?.searchParams.get("schema") ?? undefined;
  for (const p of ["schema", "pgbouncer", "connection_limit", "connect_timeout", "pool_timeout"]) url?.searchParams.delete(p);
  const pool = new Pool({ connectionString: url?.toString(), max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  // On Vercel Fluid compute, lets idle pooled connections close before the instance suspends.
  attachDatabasePool(pool);
  return new PrismaClient({
    adapter: new PrismaPg(pool, schema ? { schema } : undefined),
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
