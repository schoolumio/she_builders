export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://prayer:prayer@localhost:5432/prayer_e2e?schema=public";
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
