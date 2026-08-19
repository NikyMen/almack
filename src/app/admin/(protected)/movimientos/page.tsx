import { desc, eq, inArray, or, isNull } from "drizzle-orm";
import { db, productos, gastos, stockMovimientos, stockMovimientoItems } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MoverStock, type ProductoTraslado, type TrasladoVista, type GastoVista } from "@/components/mover-stock";
import { desgloseStock } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";

export default async function MovimientosPage() {
  await requireAcceso("movimientos");
  const { lista, activa, activaId } = await getContextoSucursal();

  const [catalogo, desglose] = await Promise.all([
    db
      .select({ id: productos.id, nombre: productos.nombre, sku: productos.sku })
      .from(productos)
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
    for (const d of desglose.get(p.id) ?? []) porSucursal[d.sucursalId] = d.cantidad;
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
      items: items
        .filter((i) => i.movimientoId === m.id)
        .map((i) => `${i.descripcion} ×${i.cantidad}`),
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
