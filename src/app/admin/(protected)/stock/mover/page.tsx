import { desc, eq, inArray, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { db, productos, gastos, stockMovimientos, stockMovimientoItems } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MoverStock, type ProductoTraslado, type TrasladoVista, type GastoVista } from "@/components/mover-stock";
import { desgloseStock } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";
import { esSuperAdmin } from "@/lib/permisos";

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ sucursal?: string }> }) {
  const usuario = await requireAcceso("movimientos");
  const contexto = await getContextoSucursal();
  const { lista } = contexto;
  const parametro = (await searchParams).sucursal;
  const activaId = esSuperAdmin(usuario) && parametro
    ? parametro === "todas" ? null : lista.find((s) => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const activa = lista.find((s) => s.id === activaId) ?? null;

  const [catalogo, desglose] = await Promise.all([
    db
      .select({ id: productos.id, nombre: productos.nombre, sku: productos.sku })
      .from(productos)
      .where(eq(productos.activo, true))
      .orderBy(productos.nombre),
    desgloseStock(),
  ]);

  // Dentro de una sucursal solo interesan los traslados que la tocan (de un
  // lado o del otro) y sus gastos.
  const movs = await db
    .select()
    .from(stockMovimientos)
    .where(
      activaId
        ? or(eq(stockMovimientos.origenId, activaId), eq(stockMovimientos.destinoId, activaId))
        : undefined
    )
    .orderBy(desc(stockMovimientos.id))
    .limit(40);

  const ids = movs.map((m) => m.id);
  const [items, gastosMov, sueltos] = await Promise.all([
    ids.length
      ? db.select().from(stockMovimientoItems).where(inArray(stockMovimientoItems.movimientoId, ids))
      : Promise.resolve([]),
    ids.length
      ? db.select().from(gastos).where(inArray(gastos.movimientoId, ids))
      : Promise.resolve([]),
    db
      .select()
      .from(gastos)
      .where(activaId ? eq(gastos.sucursalId, activaId) : isNull(gastos.movimientoId))
      .orderBy(desc(gastos.id))
      .limit(30),
  ]);

  const nombreSucursal = new Map(lista.map((s) => [s.id, s.nombre]));
  const gastoDe = new Map(gastosMov.map((g) => [g.movimientoId!, g]));

  const catalogoVista: ProductoTraslado[] = catalogo.map((p) => {
    const porSucursal: Record<number, number> = {};
    for (const d of desglose.get(p.id) ?? []) if (esSuperAdmin(usuario) || d.sucursalId === activaId) porSucursal[d.sucursalId] = d.cantidad;
    return { ...p, porSucursal };
  });

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
      items: items
        .filter((i) => i.movimientoId === m.id)
        .map((i) => ({ id: i.id, nombre: i.descripcion, enviado: i.cantidad, verificado: i.cantidadVerificada, ingresado: i.cantidadRecibida })),
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
        catalogo={catalogoVista}
        historial={historial}
        gastos={listaGastos}
      />
    </>
  );
}
