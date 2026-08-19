import { db, productos } from "@/db";
import { desc } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { StockManager, type ProductoConStock } from "@/components/stock-manager";
import { desgloseStock } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";

export default async function StockPage() {
  await requireAcceso("stock");
  const [items, desglose, { lista, activa, activaId }] = await Promise.all([
    db.select().from(productos).orderBy(desc(productos.id)),
    desgloseStock(),
    getContextoSucursal(),
  ]);

  // En "Todas" la columna Stock es el total de la empresa; dentro de un local,
  // lo que hay en ese local y nada más.
  const filas: ProductoConStock[] = items.map((p) => {
    const porSucursal: Record<number, number> = {};
    for (const d of desglose.get(p.id) ?? []) porSucursal[d.sucursalId] = d.cantidad;
    return {
      ...p,
      porSucursal,
      stockLocal: activaId ? porSucursal[activaId] ?? 0 : p.stock,
    };
  });

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={
          activa
            ? `Inventario de ${activa.nombre}.`
            : "Inventario consolidado de todas las sucursales."
        }
      />
      <StockManager items={filas} sucursales={lista} sucursalActivaId={activaId} />
    </>
  );
}
