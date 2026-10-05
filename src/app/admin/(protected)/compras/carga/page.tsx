import { db, compras, compraLineas } from "@/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { CargaStock } from "@/components/carga-stock";

// Gemini, el respaldo de visión y DeepSeek pueden responder en serie.
export const maxDuration = 180;

export default async function CargaStockPage() {
  await requireAcceso("compras");
  const { lista, activaId } = await getContextoSucursal();
  const borradores = await db.select().from(compras).where(and(
    activaId ? eq(compras.sucursalId, activaId) : undefined,
    sql`exists (select 1 from ${compraLineas} where ${compraLineas.compraId} = ${compras.id} and ${compraLineas.aplicado} = 0)`
  )).orderBy(desc(compras.id));
  return <><PageHeader title="Carga de stock" subtitle="Del comprobante al inventario, con revisión de productos y precios." /><CargaStock sucursales={lista} activaId={activaId} borradores={borradores} /></>;
}
