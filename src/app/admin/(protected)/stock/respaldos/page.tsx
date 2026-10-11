import Link from "next/link";
import { db, stockRespaldos } from "@/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { fechaHora } from "@/lib/format";
import { crearRespaldoManual } from "./actions";

export default async function RespaldosPage() {
  await requireAdmin();
  const lista = await db.select({ id: stockRespaldos.id, motivo: stockRespaldos.motivo, compraId: stockRespaldos.compraId, usuario: stockRespaldos.usuarioNombre, productos: stockRespaldos.productos, creadoEn: stockRespaldos.creadoEn }).from(stockRespaldos).orderBy(desc(stockRespaldos.id)).limit(100);
  return <>
    <Link href="/admin/stock" className="btn-ghost mb-4">← Stock</Link>
    <PageHeader title="Respaldos" subtitle="Solo administradores. Se guardan automáticamente antes de aplicar o deshacer cargas y de borrar comprobantes." />
    <form action={crearRespaldoManual} className="mb-4"><button className="btn-primary">Crear respaldo del stock actual</button></form>
    <p className="mb-4 text-sm text-slate-500">Cada respaldo contiene productos, existencias por sucursal, stock en tránsito y los registros de la carga asociada. Podés descargarlo para conservar una copia. La restauración no es automática.</p>
    <div className="space-y-3">{lista.map(r => <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><p className="font-medium">#{r.id} · {r.motivo}{r.compraId ? ` · carga #${r.compraId}` : ""}</p><p className="text-sm text-slate-500">{fechaHora(r.creadoEn)} · {r.productos} productos · {r.usuario}</p></div>
      <a className="btn-ghost" href={`/admin/stock/respaldos/${r.id}`}>Descargar respaldo</a>
    </div>)}{!lista.length && <p className="card p-5 text-sm text-slate-500">Todavía no hay respaldos. Creá uno del stock actual antes de hacer cambios.</p>}</div>
  </>;
}
