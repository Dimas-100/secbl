"use client";

// Browser-side push plumbing shared by the Settings card and the Home prompt,
// so there is exactly one way to subscribe, unsubscribe and read the state.
import { removePushSubscription, savePushSubscription } from "@/app/(member)/settings/push-actions";

export type Permission = "default" | "granted" | "denied";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission(): Permission {
  return typeof Notification === "undefined" ? "default" : (Notification.permission as Permission);
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type SubJson = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Asks permission (a tap must precede this), subscribes, and records it on
// the server. Resolves to the new permission state and an error message if
// something other than a refusal went wrong.
export async function subscribeToPush(): Promise<{ permission: Permission; error: string | null }> {
  const permission = (await Notification.requestPermission()) as Permission;
  if (permission !== "granted") return { permission, error: null };
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { permission, error: "Notifications aren't configured on this server yet." };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
    const result = await savePushSubscription(sub.toJSON() as SubJson, navigator.userAgent);
    return { permission, error: result.error };
  } catch (err) {
    console.error("push subscribe failed", err);
    return { permission, error: "Couldn't turn notifications on. On iPhone, add SECBL to your Home Screen first." };
  }
}

// Refreshes the server's copy of an existing subscription (re-owns it on a
// shared device). No-op when there is none.
export async function refreshSubscription(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  void savePushSubscription(sub.toJSON() as SubJson, navigator.userAgent);
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await removePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
