import { asc, eq } from "drizzle-orm";
import { db, cajas, sucursales } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PanelSucursal } from "@/components/panel-sucursal";

export default async function SucursalesPage() {
  await requireAdmin();
  const [locales, registros] = await Promise.all([
    db.select().from(sucursales).where(eq(sucursales.activo, true)).orderBy(asc(sucursales.orden), asc(sucursales.id)),
    db.select().from(cajas).orderBy(asc(cajas.sucursalId), asc(cajas.numero)),
  ]);
  return <div className="space-y-5">
    <PageHeader title="Panel de sucursal" subtitle="Configuración de locales, depósitos y cajas" />
    <PanelSucursal locales={locales} cajas={registros} />
  </div>;
}
