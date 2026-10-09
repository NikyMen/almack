import { tieneAcceso } from "@/lib/permisos";
import Link from "next/link";
import { db, compras, compraLineas } from "@/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { requireCargaStock } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { CargaStock } from "@/components/carga-stock";

// Gemini, el respaldo de visión y DeepSeek pueden responder en serie.
export const maxDuration = 180;

export default async function CargaStockPage() {
  const usuario = await requireCargaStock();
  const { lista, activaId } = await getContextoSucursal();
  const borradores = await db.select().from(compras).where(and(
    activaId ? eq(compras.sucursalId, activaId) : undefined,
    sql`exists (select 1 from ${compraLineas} where ${compraLineas.compraId} = ${compras.id} and ${compraLineas.aplicado} = 0)`
  )).orderBy(desc(compras.id));
  return <><Link href="/admin/stock" className="btn-ghost mb-4">← Opciones de stock</Link><PageHeader title="Carga de stock" subtitle="Del comprobante al inventario, con revisión de productos y precios." /><CargaStock permiteCompras={tieneAcceso(usuario,"compras")} sucursales={lista} activaId={activaId} borradores={borradores} /></>;
}
