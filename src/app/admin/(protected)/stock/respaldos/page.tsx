import Link from "next/link";
import { db, stockRespaldos } from "@/db";
import { count, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { fechaHora } from "@/lib/format";
import { crearRespaldoManual } from "./actions";

export default async function RespaldosPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await requireAdmin();
  const [{ total }] = await db.select({ total: count() }).from(stockRespaldos);
  const paginas = Math.max(1, Math.ceil(total / 50));
  const solicitada = Number((await searchParams).pagina);
  const pagina = Math.min(Number.isSafeInteger(solicitada) && solicitada > 0 ? solicitada : 1, paginas);
  const lista = await db.select({ id: stockRespaldos.id, motivo: stockRespaldos.motivo, compraId: stockRespaldos.compraId, usuario: stockRespaldos.usuarioNombre, productos: stockRespaldos.productos, creadoEn: stockRespaldos.creadoEn }).from(stockRespaldos).orderBy(desc(stockRespaldos.id)).limit(50).offset((pagina - 1) * 50);
  return <>
    <Link href="/admin/stock" className="btn-ghost mb-4">← Stock</Link>
    <PageHeader title="Respaldos" subtitle="Solo administradores. Se guardan automáticamente antes de aplicar o deshacer cargas y de borrar comprobantes." />
    <form action={crearRespaldoManual} className="mb-4"><button className="btn-primary">Crear respaldo del stock actual</button></form>
    <p className="mb-4 text-sm text-slate-500">Cada respaldo contiene productos, existencias por sucursal, stock en tránsito y los registros de la carga asociada. Podés descargarlo para conservar una copia. La restauración no es automática.</p>
    <div className="space-y-3">{lista.map(r => <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><p className="font-medium">#{r.id} · {r.motivo}{r.compraId ? ` · carga #${r.compraId}` : ""}</p><p className="text-sm text-slate-500">{fechaHora(r.creadoEn)} · {r.productos} productos · {r.usuario}</p></div>
      <a className="btn-ghost" href={`/admin/stock/respaldos/${r.id}`}>Descargar respaldo</a>
    </div>)}{!lista.length && <p className="card p-5 text-sm text-slate-500">Todavía no hay respaldos. Creá uno del stock actual antes de hacer cambios.</p>}</div>
    {paginas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de respaldos">
      {pagina > 1 && <Link className="btn-ghost" href={`/admin/stock/respaldos?pagina=${pagina - 1}`}>← Anterior</Link>}
      <span className="text-sm text-slate-600">{pagina} / {paginas}</span>
      {pagina < paginas && <Link className="btn-ghost" href={`/admin/stock/respaldos?pagina=${pagina + 1}`}>Siguiente →</Link>}
    </nav>}
  </>;
}
