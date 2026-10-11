import { db, stockRespaldos } from "@/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Respaldo inválido", { status: 400 });
  const [respaldo] = await db.select().from(stockRespaldos).where(eq(stockRespaldos.id, id));
  if (!respaldo) return new Response("Respaldo no encontrado", { status: 404 });
  return new Response(respaldo.datos, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="stock-respaldo-${id}.json"`, "Cache-Control": "private, no-store" } });
}
