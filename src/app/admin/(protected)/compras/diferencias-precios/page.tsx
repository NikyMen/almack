import Link from "next/link";
import { db, diferenciasPrecios } from "@/db";
import { desc, eq } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { DiferenciasPreciosTabla } from "@/components/diferencias-precios";

export default async function DiferenciasPreciosPage() {
  await requireAcceso("compras");
  const { activaId } = await getContextoSucursal();
  const registros = await db.select().from(diferenciasPrecios).where(activaId ? eq(diferenciasPrecios.sucursalId, activaId) : undefined).orderBy(desc(diferenciasPrecios.id));
  return <><PageHeader title="Diferencias de precios" subtitle="Subas y bajas del costo en cada carga confirmada, con su decisión de revalorización." /><Link className="btn-ghost mb-4" href="/admin/compras/carga">Cargar stock</Link><DiferenciasPreciosTabla registros={registros} /></>;
}
