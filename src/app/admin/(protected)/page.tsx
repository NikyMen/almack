import { getMetricas } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PanelPersonalizable } from "@/components/panel-personalizable";
import { AperturasPendientesPanel } from "@/components/aperturas-pendientes-panel";
import { db, cajaTurnos, sucursales } from "@/db";
import { and, asc, count, eq } from "drizzle-orm";

export default async function Panel() {
  const usuario = await requireAcceso("panel");
  if (usuario.rol !== "admin") return <div className="card p-6 text-sm text-slate-600">Los indicadores de ventas y dinero están disponibles solo para administración. Usá Caja para operar tu turno.</div>;
  const contexto = await getContextoSucursal();
  const filtro = and(eq(cajaTurnos.aperturaEstado, "pendiente"), contexto.activaId ? eq(cajaTurnos.sucursalId, contexto.activaId) : undefined);
  const [metricas, aperturas, [resumenAperturas]] = await Promise.all([
    getMetricas(contexto.activaId),
    db.select({
      id: cajaTurnos.id, sucursalId: cajaTurnos.sucursalId, sucursalNombre: sucursales.nombre,
      responsable: cajaTurnos.responsable, aperturaUsuario: cajaTurnos.aperturaUsuario,
      fondoInicial: cajaTurnos.fondoInicial, fondoContado: cajaTurnos.fondoContado,
      fondoEsperado: cajaTurnos.fondoEsperado, diferenciaApertura: cajaTurnos.diferenciaApertura,
      motivoApertura: cajaTurnos.motivoApertura,
    }).from(cajaTurnos).leftJoin(sucursales, eq(cajaTurnos.sucursalId, sucursales.id))
      .where(filtro).orderBy(asc(cajaTurnos.id)).limit(20),
    db.select({ total: count() }).from(cajaTurnos).where(filtro),
  ]);
  return <PanelPersonalizable metricas={metricas} sucursales={contexto.lista.map(s => ({ id: s.id, nombre: s.nombre }))} activaId={contexto.activaId} administrador={usuario.rol === "admin"} usuarioId={usuario.id} revisionAperturas={<AperturasPendientesPanel aperturas={aperturas} total={resumenAperturas?.total ?? 0} />} />;
}
