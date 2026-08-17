import { getManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream SSE: empuja al navegador el estado de conexión, el QR y cada
// contacto/mensaje nuevo en tiempo real.
export async function GET(req: Request) {
  const manager = getManager();

  // Si hay una sesión guardada en disco, reconectamos al abrir el tablero.
  if (manager.status === "idle" && manager.hasSession()) {
    manager.connect().catch(() => {});
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* stream cerrado */
        }
      };

      // Estado actual al conectar
      send("status", manager.snapshot());

      const onStatus = (s: unknown) => send("status", s);
      const onContact = (c: unknown) => send("contact", c);
      const onMessage = (m: unknown) => send("message", m);
      manager.on("status", onStatus);
      manager.on("contact", onContact);
      manager.on("message", onMessage);

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 25000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        manager.off("status", onStatus);
        manager.off("contact", onContact);
        manager.off("message", onMessage);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
