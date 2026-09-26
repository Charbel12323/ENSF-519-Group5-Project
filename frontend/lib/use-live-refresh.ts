"use client";
import { useEffect, useRef } from "react";

// Refresh visible pages every five seconds and immediately on focus. Pause while
// editing or dragging so background responses cannot overwrite a user's work.
export function useLiveRefresh(refresh: () => Promise<void>, paused = false) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    if (paused) return;
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await latest.current(); } finally { running = false; }
    };
    const interval = setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [paused]);
}
