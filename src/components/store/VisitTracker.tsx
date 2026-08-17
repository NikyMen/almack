"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/**
 * Registra una visita por sesión de navegador y por día.
 * Se monta en el layout de la tienda; no renderiza nada.
 */
export function VisitTracker() {
  useEffect(() => {
    const visitKey = `er-visit-${new Date().toLocaleDateString("en-CA")}`;
    const sessionKey = "er-presence-session";
    let sessionId = "";
    try {
      sessionId = localStorage.getItem(sessionKey) ?? crypto.randomUUID();
      localStorage.setItem(sessionKey, sessionId);
      if (!sessionStorage.getItem(visitKey)) {
        sessionStorage.setItem(visitKey, "1");
        track("visit", { path: window.location.pathname });
      }
    } catch {
      sessionId = crypto.randomUUID();
      track("visit", { path: window.location.pathname });
    }

    const heartbeat = () => {
      if (document.visibilityState === "visible") {
        track("presence", { sessionId, path: window.location.pathname });
      }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);

  return null;
}
