import { asc, eq, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ventas as ventasTabla, db, productos, clientes } from "@/db";
import { recientes } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { stockDeSucursal } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { VentasTabla } from "@/components/ventas-tabla";
import { moneyPreciso } from "@/lib/format";
export default async function HistorialVentas() {
  await requireAcceso("ventas");
  const { activa, activaId } = await getContextoSucursal();
  // El alta manual necesita el catálogo y los clientes para armar la venta.
  const [ventas, catalogo, listaClientes] = await Promise.all([
    recientes.ventas(activaId),
    db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.nombre)),
    db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(activaId ? or(eq(clientes.sucursalId, activaId), sql`exists (select 1 from ${ventasTabla} where ${ventasTabla.clienteId} = ${clientes.id} and ${ventasTabla.sucursalId} = ${activaId})`) : undefined).orderBy(asc(clientes.nombre)),
  ]);
  const total = ventas.reduce((a, v) => a + (v.estado !== "cancelada" ? v.total : 0), 0);

  // El alta manual descuenta del local abierto: se muestra su stock, no el total.
  const enLocal = activaId ? await stockDeSucursal(activaId) : null;
  const conStockLocal = enLocal
    ? catalogo.map((p) => ({ ...p, stock: enLocal.get(p.id) ?? 0 }))
    : catalogo;
  return (
    <>
      <PageHeader
        title="Ventas históricas"
        subtitle={`${ventas.length} operaciones · ${moneyPreciso(total)} facturado${activa ? ` · ${activa.nombre}` : " · Todas las sucursales"}`}
      />
      <Link href="/admin/ventas" className="btn-ghost mb-4">← Opciones de ventas</Link>
      <VentasTabla ventas={ventas} productos={conStockLocal} clientes={listaClientes} />
    </>
  );
}
