"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function ActualizacionEnVivo() {
  const router = useRouter();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const version = useRef<number | null>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    const actualizar = (event: Event) => {
      const nueva = Number((event as MessageEvent).data);
      if (!Number.isSafeInteger(nueva)) return;
      if (version.current === null) { version.current = nueva; return; }
      if (version.current === nueva) return;
      version.current = nueva;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => router.refresh(), 300);
    };
    events.addEventListener("version", actualizar);
    return () => {
      events.close();
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [router]);
  return null;
}
