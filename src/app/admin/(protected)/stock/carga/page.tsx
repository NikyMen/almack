import { tieneAcceso } from "@/lib/permisos";
import Link from "next/link";
import { db, compras, compraLineas, compraItems } from "@/db";
import { desc, eq, and, sql, count } from "drizzle-orm";
import { requireCargaStock } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { CargaStock } from "@/components/carga-stock";

// Gemini, el respaldo de visión y DeepSeek pueden responder en serie.
export const maxDuration = 180;

export default async function CargaStockPage({ searchParams }: { searchParams: Promise<{ paginaBorradores?: string; paginaCargas?: string }> }) {
  const usuario = await requireCargaStock();
  const params = await searchParams;
  const { lista, activaId } = await getContextoSucursal();
  const filtroBorradores = and(
    activaId ? eq(compras.sucursalId, activaId) : undefined,
    sql`exists (select 1 from ${compraLineas} where ${compraLineas.compraId} = ${compras.id} and ${compraLineas.aplicado} = 0)`
  );
  const filtroCargas = and(
    activaId ? eq(compras.sucursalId, activaId) : undefined,
    eq(compras.stockRevertido, false),
    sql`exists (select 1 from ${compraItems} where ${compraItems.compraId} = ${compras.id})`
  );
  const [[{ total: totalBorradores }], [{ total: totalCargas }]] = await Promise.all([
    db.select({ total: count() }).from(compras).where(filtroBorradores),
    usuario.rol === "admin" ? db.select({ total: count() }).from(compras).where(filtroCargas) : Promise.resolve([{ total: 0 }]),
  ]);
  const paginasBorradores = Math.max(1, Math.ceil(totalBorradores / 50));
  const paginasCargas = Math.max(1, Math.ceil(totalCargas / 50));
  const numeroPagina = (valor?: string) => { const n = Number(valor); return Number.isSafeInteger(n) && n > 0 ? n : 1; };
  const paginaBorradores = Math.min(numeroPagina(params.paginaBorradores), paginasBorradores);
  const paginaCargas = Math.min(numeroPagina(params.paginaCargas), paginasCargas);
  const [borradores, cargas] = await Promise.all([
    db.select().from(compras).where(filtroBorradores).orderBy(desc(compras.id)).limit(50).offset((paginaBorradores - 1) * 50),
    usuario.rol === "admin" ? db.select().from(compras).where(filtroCargas).orderBy(desc(compras.id)).limit(50).offset((paginaCargas - 1) * 50) : Promise.resolve([]),
  ]);
  return <><Link href="/admin/stock" className="btn-ghost mb-4">← Opciones de stock</Link><PageHeader title="Carga de stock" subtitle="Del comprobante al inventario, con revisión de productos y precios." /><CargaStock permiteCompras={tieneAcceso(usuario,"compras")} permitePrecioManual={usuario.rol === "admin"} sucursales={lista} activaId={activaId} borradores={borradores} cargas={cargas} />
    {paginasBorradores > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de cargas pendientes">
      {paginaBorradores > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock/carga", query: { paginaBorradores: paginaBorradores - 1, paginaCargas } }}>← Pendientes anteriores</Link>}
      <span className="text-sm text-slate-600">Pendientes {paginaBorradores} / {paginasBorradores}</span>
      {paginaBorradores < paginasBorradores && <Link className="btn-ghost" href={{ pathname: "/admin/stock/carga", query: { paginaBorradores: paginaBorradores + 1, paginaCargas } }}>Más pendientes →</Link>}
    </nav>}
    {paginasCargas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de cargas aplicadas">
      {paginaCargas > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock/carga", query: { paginaBorradores, paginaCargas: paginaCargas - 1 } }}>← Cargas anteriores</Link>}
      <span className="text-sm text-slate-600">Cargas {paginaCargas} / {paginasCargas}</span>
      {paginaCargas < paginasCargas && <Link className="btn-ghost" href={{ pathname: "/admin/stock/carga", query: { paginaBorradores, paginaCargas: paginaCargas + 1 } }}>Más cargas →</Link>}
    </nav>}
  </>;
}
