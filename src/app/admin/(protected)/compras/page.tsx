import Link from "next/link";
import { db, compras } from "@/db";
import { desc, eq } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { ComprasTabla } from "@/components/compras-tabla";
import { money } from "@/lib/format";

export const maxDuration = 180;

export default async function ComprasPage() {
  await requireAcceso("compras");
  const { lista, activa, activaId } = await getContextoSucursal();
  const items = await db
    .select()
    .from(compras)
    .where(activaId ? eq(compras.sucursalId, activaId) : undefined)
    .orderBy(desc(compras.fecha));
  const total = items.reduce((a, c) => a + c.total, 0);
  return (
    <>
      <PageHeader
        title="Compras"
        subtitle={`${items.length} órdenes · ${money(total)} invertido${activa ? ` · ${activa.nombre}` : ""}`}
      />
      <div className="mb-4 flex flex-wrap gap-2"><Link className="btn-primary" href="/admin/compras/carga">Cargar stock</Link><Link className="btn-ghost" href="/admin/compras/diferencias-precios">Diferencias de precios</Link></div>
      <ComprasTabla compras={items} sucursales={lista} sucursalActivaId={activaId} />
    </>
  );
}
