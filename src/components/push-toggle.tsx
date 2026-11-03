"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "./ui/button";

type State = "checking" | "unsupported" | "denied" | "off" | "on" | "working";

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Turns browser push notifications on or off for this browser. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    if (Notification.permission === "denied") {
      queueMicrotask(() => setState("denied"));
      return;
    }
    currentSubscription().then((s) => setState(s ? "on" : "off"), () => setState("off"));
  }, []);

  const enable = async () => {
    setState("working");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save the subscription");
      setState("on");
      setMessage("Browser notifications are on for this device.");
    } catch (e) {
      setState("off");
      setMessage((e as Error).message);
    }
  };

  const disable = async () => {
    setState("working");
    const sub = await currentSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setMessage("Browser notifications are off for this device.");
  };

  const test = async () => {
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? (json.delivered ? "Test notification sent." : "No notification could be delivered. Try turning notifications off and on again.") : (json.error ?? "Could not send a test."));
  };

  return (
    <div className="space-y-3">
      {state === "unsupported" && <p className="text-sm text-muted">This browser does not support push notifications. On iPhone, add this site to your Home Screen first (iOS 16.4+).</p>}
      {state === "denied" && <p className="text-sm text-muted">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.</p>}
      {(state === "off" || state === "working" || state === "checking") && (
        <button type="button" onClick={enable} disabled={state !== "off"} className={buttonClass()}>
          {state === "working" ? "Turning on…" : "Turn on browser notifications"}
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={test} className={buttonClass("secondary")}>Send a test notification</button>
          <button type="button" onClick={disable} className={buttonClass("ghost")}>Turn off on this device</button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
    </div>
  );
}
