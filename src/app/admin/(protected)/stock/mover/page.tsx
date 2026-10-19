import { and, count, desc, eq, inArray, or, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { db, gastos, stockMovimientos } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MoverStock, type TrasladoVista, type GastoVista } from "@/components/mover-stock";
import { getContextoSucursal } from "@/lib/sucursal";
import { esSuperAdmin } from "@/lib/permisos";

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ sucursal?: string; paginaMov?: string; paginaGasto?: string }> }) {
  const usuario = await requireAcceso("movimientos");
  const contexto = await getContextoSucursal();
  const { lista } = contexto;
  const params = await searchParams;
  const parametro = params.sucursal;
  const activaId = esSuperAdmin(usuario) && parametro
    ? parametro === "todas" ? null : lista.find((s) => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const activa = lista.find((s) => s.id === activaId) ?? null;

  // Dentro de una sucursal solo interesan los traslados que la tocan (de un
  // lado o del otro) y sus gastos.
  const filtroMov = activaId ? or(eq(stockMovimientos.origenId, activaId), eq(stockMovimientos.destinoId, activaId)) : undefined;
  const filtroGasto = activaId ? eq(gastos.sucursalId, activaId) : isNull(gastos.movimientoId);
  const [[{ total: totalMov }], [{ total: totalGastos }]] = await Promise.all([
    db.select({ total: count() }).from(stockMovimientos).where(filtroMov),
    db.select({ total: count() }).from(gastos).where(filtroGasto),
  ]);
  const paginasMov = Math.max(1, Math.ceil(totalMov / 50));
  const paginasGasto = Math.max(1, Math.ceil(totalGastos / 50));
  const paginaPedida = (valor?: string) => { const n = Number(valor); return Number.isSafeInteger(n) && n > 0 ? n : 1; };
  const paginaMov = Math.min(paginaPedida(params.paginaMov), paginasMov);
  const paginaGasto = Math.min(paginaPedida(params.paginaGasto), paginasGasto);
  const movs = await db
    .select()
    .from(stockMovimientos)
    .where(filtroMov)
    .orderBy(desc(stockMovimientos.id))
    .limit(50).offset((paginaMov - 1) * 50);

  const ids = movs.map((m) => m.id);
  const [gastosMov, sueltos] = await Promise.all([
    ids.length
      ? db.select().from(gastos).where(and(inArray(gastos.movimientoId, ids),
        sql`${gastos.id} = (select max(g2.id) from gastos g2 where g2.movimiento_id = ${gastos.movimientoId})`)).limit(50)
      : Promise.resolve([]),
    db
      .select()
      .from(gastos)
      .where(filtroGasto)
      .orderBy(desc(gastos.id))
      .limit(50).offset((paginaGasto - 1) * 50),
  ]);

  const nombreSucursal = new Map(lista.map((s) => [s.id, s.nombre]));
  const gastoDe = new Map(gastosMov.map((g) => [g.movimientoId!, g]));

  const historial: TrasladoVista[] = movs.map((m) => {
    const g = gastoDe.get(m.id);
    return {
      id: m.id,
      fecha: m.creadoEn,
      origen: nombreSucursal.get(m.origenId) ?? `Sucursal ${m.origenId}`,
      destino: nombreSucursal.get(m.destinoId) ?? `Sucursal ${m.destinoId}`,
      unidades: m.unidades,
      nota: m.nota,
      usuario: m.usuarioNombre,
      estado: m.estado,
      destinoId: m.destinoId,
      origenId: m.origenId,
      recibidoPor: m.recibidoPor,
      recepcionNota: m.recepcionNota,
      items: [],
      gasto: g ? { concepto: g.concepto, categoria: g.categoria, monto: g.monto } : null,
    };
  });

  const listaGastos: GastoVista[] = sueltos.map((g) => ({
    id: g.id,
    fecha: g.fecha,
    concepto: g.concepto,
    categoria: g.categoria,
    monto: g.monto,
    sucursal: g.sucursalId ? nombreSucursal.get(g.sucursalId) ?? "" : "",
    deTraslado: g.movimientoId !== null,
  }));

  return (
    <>
      <PageHeader
        title="Mover stock"
        subtitle={
          activa
            ? `Traslados que entran o salen de ${activa.nombre}, con su costo de flete.`
            : "Pasá mercadería de una sucursal a otra y anotá lo que costó llevarla."
        }
      />
      <Link href={`/admin/stock?sucursal=${activaId ?? "todas"}`} className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50">← Volver a Stock</Link>
      <MoverStock
        sucursales={lista}
        sucursalActivaId={activaId}
        historial={historial}
        gastos={listaGastos}
      />
      {paginasMov > 1 && <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Páginas de traslados">
        {paginaMov > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock/mover", query: { sucursal: parametro ?? "todas", paginaMov: paginaMov - 1, paginaGasto } }}>← Traslados anteriores</Link>}
        <span className="text-sm text-slate-600">Traslados {paginaMov} / {paginasMov}</span>
        {paginaMov < paginasMov && <Link className="btn-ghost" href={{ pathname: "/admin/stock/mover", query: { sucursal: parametro ?? "todas", paginaMov: paginaMov + 1, paginaGasto } }}>Más traslados →</Link>}
      </nav>}
      {paginasGasto > 1 && <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Páginas de gastos">
        {paginaGasto > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock/mover", query: { sucursal: parametro ?? "todas", paginaMov, paginaGasto: paginaGasto - 1 } }}>← Gastos anteriores</Link>}
        <span className="text-sm text-slate-600">Gastos {paginaGasto} / {paginasGasto}</span>
        {paginaGasto < paginasGasto && <Link className="btn-ghost" href={{ pathname: "/admin/stock/mover", query: { sucursal: parametro ?? "todas", paginaMov, paginaGasto: paginaGasto + 1 } }}>Más gastos →</Link>}
      </nav>}
    </>
  );
}
