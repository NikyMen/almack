import { and, asc, eq, inArray } from "drizzle-orm";
import { db, cajas, cajaTurnos, cajaTraspasos, sucursales } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PanelSucursal, type EstadoCaja } from "@/components/panel-sucursal";

export default async function SucursalesPage() {
  await requireAdmin();
  const [locales, registros, activos] = await Promise.all([
    db.select().from(sucursales).where(eq(sucursales.activo, true)).orderBy(asc(sucursales.orden), asc(sucursales.id)),
    db.select().from(cajas).orderBy(asc(cajas.sucursalId), asc(cajas.numero)),
    // Solo los turnos vivos (abiertos o con cierre pendiente): como mucho uno o dos por caja.
    db.select({ id: cajaTurnos.id, cajaId: cajaTurnos.cajaId, estado: cajaTurnos.estado, responsable: cajaTurnos.responsable, arqueoEn: cajaTurnos.arqueoEn })
      .from(cajaTurnos).where(inArray(cajaTurnos.estado, ["abierta", "pendiente"])),
  ]);
  const abiertos = activos.filter(t => t.estado === "abierta").map(t => t.id);
  const enTraspaso = new Set(abiertos.length
    ? (await db.select({ turnoId: cajaTraspasos.turnoId }).from(cajaTraspasos).where(and(inArray(cajaTraspasos.turnoId, abiertos), eq(cajaTraspasos.estado, "pendiente")))).map(t => t.turnoId)
    : []);
  const estados: EstadoCaja[] = registros.map(c => {
    const abierto = activos.find(t => t.cajaId === c.id && t.estado === "abierta");
    const pendiente = activos.find(t => t.cajaId === c.id && t.estado === "pendiente");
    if (abierto) return { cajaId: c.id, estado: enTraspaso.has(abierto.id) ? "traspaso" : abierto.arqueoEn ? "arqueo" : "abierta", responsable: abierto.responsable, turnoId: abierto.id };
    if (pendiente) return { cajaId: c.id, estado: "pendiente", responsable: pendiente.responsable, turnoId: pendiente.id };
    return { cajaId: c.id, estado: "cerrada", responsable: null, turnoId: null };
  });
  return <div className="space-y-5">
    <PageHeader title="Panel de sucursal" subtitle="Configuración de locales, depósitos y cajas" />
    <PanelSucursal locales={locales} cajas={registros} estados={estados} />
  </div>;
}
