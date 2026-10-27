import "server-only";
import { db } from "../db";
import { errorMeta, log } from "../log";
import { brand } from "@/config/brand";

export type OutgoingEmail = { to: string; subject: string; text: string; html?: string };

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<void>;
}

class LogEmailProvider implements EmailProvider {
  readonly name = "log";
  async send(email: OutgoingEmail) {
    // Development only: prints the message so links (verification, reset, invites) can be followed.
    if (process.env.NODE_ENV !== "test") console.log(`\n=== EMAIL to ${email.to}: ${email.subject} ===\n${email.text}\n=== END EMAIL ===\n`);
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string) {}
  async send(email: OutgoingEmail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const driver = process.env.EMAIL_DRIVER ?? "log";
  if (driver === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is required when EMAIL_DRIVER=resend");
    return new ResendEmailProvider(key, process.env.EMAIL_FROM ?? `${brand.productName} <no-reply@example.com>`);
  }
  return new LogEmailProvider();
}

export function isEmailConfigured() {
  return (process.env.EMAIL_DRIVER ?? "log") !== "log";
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal, accessible HTML wrapper. Content is plain text; links are rendered as buttons. */
export function renderEmail(opts: { heading: string; paragraphs: string[]; action?: { label: string; url: string }; footer?: string }) {
  const text = [opts.heading, "", ...opts.paragraphs, ...(opts.action ? ["", `${opts.action.label}: ${opts.action.url}`] : []), "", opts.footer ?? `— ${brand.productName}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#2a2238">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<h1 style="font-size:20px;color:#3b2453;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(p)}</p>`).join("")}
${opts.action ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.action.url)}" style="background:#3b2453;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.action.label)}</a></p>` : ""}
<p style="font-size:12px;color:#6b6478;margin-top:32px">${escapeHtml(opts.footer ?? brand.productName)}</p>
</div></body></html>`;
  return { text, html };
}

/** Queue an email in the outbox and attempt immediate delivery. Failures are retried by the scheduler. */
export async function sendEmail(input: OutgoingEmail & { category: string }) {
  const row = await db.emailOutbox.create({
    data: { to: input.to, subject: input.subject, textBody: input.text, htmlBody: input.html, category: input.category },
  });
  await deliver(row.id);
}

export async function deliver(id: string) {
  const row = await db.emailOutbox.findUnique({ where: { id } });
  if (!row || row.status === "SENT") return;
  try {
    await getEmailProvider().send({ to: row.to, subject: row.subject, text: row.textBody, html: row.htmlBody ?? undefined });
    await db.emailOutbox.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
  } catch (e) {
    const attempts = row.attempts + 1;
    const delayMin = Math.min(2 ** attempts, 360);
    log.warn("email.delivery_failed", { id, attempts, ...errorMeta(e) });
    await db.emailOutbox.update({
      where: { id },
      data: {
        status: attempts >= 8 ? "FAILED" : "PENDING",
        attempts,
        lastError: e instanceof Error ? e.message.slice(0, 300) : "unknown",
        nextAttemptAt: new Date(Date.now() + delayMin * 60_000),
      },
    });
  }
}

export async function retryPendingEmails(limit = 50) {
  const due = await db.emailOutbox.findMany({
    where: { status: "PENDING", attempts: { gt: 0 }, nextAttemptAt: { lte: new Date() } },
    take: limit,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const row of due) await deliver(row.id);
  return due.length;
}
