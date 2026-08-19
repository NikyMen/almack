import { asc } from "drizzle-orm";
import { db, productos, clientes } from "@/db";
import { recientes } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { stockDeSucursal } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { VentasTabla } from "@/components/ventas-tabla";
import { money } from "@/lib/format";

export default async function VentasPage() {
  await requireAcceso("ventas");
  const { activa, activaId } = await getContextoSucursal();
  // El alta manual necesita el catálogo y los clientes para armar la venta.
  const [ventas, catalogo, listaClientes] = await Promise.all([
    recientes.ventas(activaId),
    db.select().from(productos).orderBy(asc(productos.nombre)),
    db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).orderBy(asc(clientes.nombre)),
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
        title="Ventas"
        subtitle={`${ventas.length} operaciones · ${money(total)} facturado${activa ? ` · ${activa.nombre}` : ""}`}
      />
      <VentasTabla ventas={ventas} productos={conStockLocal} clientes={listaClientes} />
    </>
  );
}
