"use client";

/** Envía un evento de analítica sin bloquear la UI (fire-and-forget). */
export function track(
  type: "visit" | "cart_add" | "presence",
  data: { productId?: string; path?: string; sessionId?: string } = {}
) {
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // nunca romper la tienda por analítica
  }
}
