import { getUsuarioActual } from "@/lib/auth";
import { client } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const encoder = new TextEncoder();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
  if (!await getUsuarioActual()) return new Response("No autorizado", { status: 401 });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // La versión vive en la base compartida: funciona entre instancias.
        for (let i = 0; i < 25 && !request.signal.aborted; i++) {
          const { rows } = await client.execute("SELECT version FROM app_revision WHERE id = 1");
          const version = Number(rows[0]?.version ?? 0);
          controller.enqueue(encoder.encode(`event: version\ndata: ${version}\n\n`));
          await wait(2000);
        }
      } catch {
        // EventSource reconecta automáticamente ante una falla transitoria.
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" } });
}
