"use client";

import { useEffect } from "react";

// Registers the pass-through service worker so Android Chrome offers the
// install prompt. Silent on failure: the site works identically without it.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
