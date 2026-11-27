import { and, asc, count, desc, eq, gte, inArray, isNotNull, max, ne, sum } from "drizzle-orm";
import { db, cajas, cajaTurnos, cajaTraspasos, sucursales, ventas } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PanelSucursal, type EstadoCaja, type Actividad } from "@/components/panel-sucursal";

const MIN = 60_000;
/** Dos ventas separadas por menos de esto cuentan como clientes seguidos. */
const PAUSA_MS = 5 * MIN;

/**
 * Ventas en racha por local: desde la más reciente (si fue hace menos de 5
 * minutos) hacia atrás, mientras entre una y otra haya menos de 5 minutos.
 */
function rachas(recientes: { sucursalId: number | null; fecha: Date | null }[], ahora: number) {
  const m = new Map<number, number>();
  const ultima = new Map<number, number>();
  const cortada = new Set<number>();
  for (const v of recientes) { // vienen de la más nueva a la más vieja
    if (v.sucursalId === null || !v.fecha || cortada.has(v.sucursalId)) continue;
    const t = v.fecha.getTime();
    const previa = ultima.get(v.sucursalId) ?? ahora;
    if (previa - t >= PAUSA_MS) { cortada.add(v.sucursalId); continue; }
    m.set(v.sucursalId, (m.get(v.sucursalId) ?? 0) + 1);
    ultima.set(v.sucursalId, t);
  }
  return m;
}

export default async function SucursalesPage() {
  await requireAdmin();
  const ahora = Date.now();
  const deLocal = and(isNotNull(ventas.sucursalId), eq(ventas.canal, "local"), ne(ventas.estado, "cancelada"));
  const [locales, registros, activos, ultimas5h, recientes] = await Promise.all([
    db.select().from(sucursales).where(eq(sucursales.activo, true)).orderBy(asc(sucursales.orden), asc(sucursales.id)),
    db.select().from(cajas).orderBy(asc(cajas.sucursalId), asc(cajas.numero)),
    // Solo los turnos vivos (abiertos o con cierre pendiente): como mucho uno o dos por caja.
    db.select({ id: cajaTurnos.id, cajaId: cajaTurnos.cajaId, estado: cajaTurnos.estado, responsable: cajaTurnos.responsable, arqueoEn: cajaTurnos.arqueoEn })
      .from(cajaTurnos).where(inArray(cajaTurnos.estado, ["abierta", "pendiente"])),
    // Clientes atendidos en las últimas 5 horas: conteo agregado por local.
    db.select({ sucursalId: ventas.sucursalId, n: count() }).from(ventas)
      .where(and(deLocal, gte(ventas.fecha, new Date(ahora - 5 * 60 * MIN)))).groupBy(ventas.sucursalId),
    // Para medir la racha alcanza con la última hora, con tope de filas.
    db.select({ sucursalId: ventas.sucursalId, fecha: ventas.fecha }).from(ventas)
      .where(and(deLocal, gte(ventas.fecha, new Date(ahora - 60 * MIN)))).orderBy(desc(ventas.fecha), desc(ventas.id)).limit(600),
  ]);
  const racha = rachas(recientes, ahora);
  const actividad: Actividad[] = locales.map(l => ({
    sucursalId: l.id,
    ultimas5h: ultimas5h.find(u => u.sucursalId === l.id)?.n ?? 0,
    racha: racha.get(l.id) ?? 0,
  }));
  const abiertos = activos.filter(t => t.estado === "abierta").map(t => t.id);
  const vivos = activos.map(t => t.id);
  const valida = ne(ventas.estado, "cancelada");
  const [traspasos, porTurno, ultimaPorCaja] = await Promise.all([
    abiertos.length
      ? db.select({ turnoId: cajaTraspasos.turnoId }).from(cajaTraspasos).where(and(inArray(cajaTraspasos.turnoId, abiertos), eq(cajaTraspasos.estado, "pendiente")))
      : Promise.resolve([]),
    // Total y tickets de cada turno vivo, agregados en la base.
    vivos.length
      ? db.select({ turnoId: ventas.cajaTurnoId, total: sum(ventas.total), tickets: count() }).from(ventas)
        .where(and(valida, inArray(ventas.cajaTurnoId, vivos))).groupBy(ventas.cajaTurnoId)
      : Promise.resolve([]),
    // Última venta de cada caja, mirando solo los últimos 30 días.
    db.select({ cajaId: cajaTurnos.cajaId, ultima: max(ventas.fecha) }).from(ventas)
      .innerJoin(cajaTurnos, eq(cajaTurnos.id, ventas.cajaTurnoId))
      .where(and(valida, gte(ventas.fecha, new Date(ahora - 30 * 24 * 60 * MIN)))).groupBy(cajaTurnos.cajaId),
  ]);
  const enTraspaso = new Set(traspasos.map(t => t.turnoId));
  const ventasDe = (turnoId: number) => {
    const v = porTurno.find(p => p.turnoId === turnoId);
    return { ventasTurno: Number(v?.total ?? 0), ticketsTurno: v?.tickets ?? 0 };
  };
  const ultimaDe = (cajaId: number) => {
    const u = ultimaPorCaja.find(p => p.cajaId === cajaId)?.ultima;
    return u ? new Date(u).getTime() : null;
  };
  const estados: EstadoCaja[] = registros.map(c => {
    const abierto = activos.find(t => t.cajaId === c.id && t.estado === "abierta");
    const pendiente = activos.find(t => t.cajaId === c.id && t.estado === "pendiente");
    const ultimaVenta = ultimaDe(c.id);
    if (abierto) return { cajaId: c.id, estado: enTraspaso.has(abierto.id) ? "traspaso" : abierto.arqueoEn ? "arqueo" : "abierta", responsable: abierto.responsable, turnoId: abierto.id, ultimaVenta, ...ventasDe(abierto.id) };
    if (pendiente) return { cajaId: c.id, estado: "pendiente", responsable: pendiente.responsable, turnoId: pendiente.id, ultimaVenta, ...ventasDe(pendiente.id) };
    return { cajaId: c.id, estado: "cerrada", responsable: null, turnoId: null, ultimaVenta, ventasTurno: null, ticketsTurno: 0 };
  });
  return <div className="space-y-5">
    <PageHeader title="Panel de sucursal" subtitle="Configuración de locales, depósitos y cajas" />
    <PanelSucursal locales={locales} cajas={registros} estados={estados} actividad={actividad} />
  </div>;
}
