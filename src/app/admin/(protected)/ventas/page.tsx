import { asc } from "drizzle-orm";
import { db, productos, clientes } from "@/db";
import { recientes } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { VentasTabla } from "@/components/ventas-tabla";
import { money } from "@/lib/format";

export default async function VentasPage() {
  await requireAcceso("ventas");
  // El alta manual necesita el catálogo y los clientes para armar la venta.
  const [ventas, catalogo, listaClientes] = await Promise.all([
    recientes.ventas(),
    db.select().from(productos).orderBy(asc(productos.nombre)),
    db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).orderBy(asc(clientes.nombre)),
  ]);
  const total = ventas.reduce((a, v) => a + (v.estado !== "cancelada" ? v.total : 0), 0);
  return (
    <>
      <PageHeader title="Ventas" subtitle={`${ventas.length} operaciones · ${money(total)} facturado`} />
      <VentasTabla ventas={ventas} productos={catalogo} clientes={listaClientes} />
    </>
  );
}
