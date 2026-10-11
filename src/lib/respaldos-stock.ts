import { db, productos, stockSucursal, stockTransito, sucursales, compras, compraLineas, compraItems, compraHistorial, diferenciasPrecios, stockRespaldos } from "@/db";
import { eq } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function guardarRespaldoStock(tx: Tx, motivo: string, usuarioNombre: string, compraId: number | null = null) {
  const catalogo = await tx.select().from(productos);
  const locales = await tx.select().from(stockSucursal);
  const transito = await tx.select().from(stockTransito);
  const sedes = await tx.select().from(sucursales);
  const carga = compraId === null ? null : {
    compra: (await tx.select().from(compras).where(eq(compras.id, compraId)))[0],
    lineas: await tx.select().from(compraLineas).where(eq(compraLineas.compraId, compraId)),
    items: await tx.select().from(compraItems).where(eq(compraItems.compraId, compraId)),
    historial: await tx.select().from(compraHistorial).where(eq(compraHistorial.compraId, compraId)),
    diferenciasPrecios: await tx.select().from(diferenciasPrecios).where(eq(diferenciasPrecios.compraId, compraId)),
  };
  const datos = JSON.stringify({ version: 1, fecha: new Date().toISOString(), productos: catalogo, stockSucursal: locales, stockTransito: transito, sucursales: sedes, carga });
  const [respaldo] = await tx.insert(stockRespaldos).values({ motivo, usuarioNombre, compraId, productos: catalogo.length, datos }).returning({ id: stockRespaldos.id });
  return respaldo.id;
}
