/** Hosts accepted for WhatsApp meeting links. A group link and a call link are different things. */
const WHATSAPP_HOSTS = new Set(["chat.whatsapp.com", "call.whatsapp.com", "wa.me", "api.whatsapp.com", "whatsapp.com", "www.whatsapp.com"]);

export type WhatsAppLinkKind = "group" | "call" | "chat" | "other";

/** Returns a normalised https URL or null when the URL is unsafe (non-https, credentials, javascript:, etc). */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function classifyWhatsAppLink(raw: string): { url: string; kind: WhatsAppLinkKind } | null {
  const url = safeExternalUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  if (!WHATSAPP_HOSTS.has(host)) return null;
  if (host === "chat.whatsapp.com") return { url, kind: "group" };
  if (host === "call.whatsapp.com") return { url, kind: "call" };
  if (host === "wa.me" || host === "api.whatsapp.com") return { url, kind: "chat" };
  return { url, kind: "other" };
}

export const WHATSAPP_KIND_LABEL: Record<WhatsAppLinkKind, string> = {
  group: "WhatsApp group invite link — opens the group chat, not a call. Members start or join the call from inside the group.",
  call: "WhatsApp call link — opens the call directly.",
  chat: "WhatsApp chat link — opens a chat with a number.",
  other: "WhatsApp link",
};

/** Only allow relative in-app redirects (prevents open redirects after login). */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
