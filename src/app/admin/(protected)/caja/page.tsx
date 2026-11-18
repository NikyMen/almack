import { Suspense } from "react";
import { db, productos, cajaExtracciones, cajaTurnos, cambiosPrecio } from "@/db";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { stockDeSucursal } from "@/lib/stock";
import { cajaAbierta, cierrePendiente, traspasoPendiente, resumenCaja, saldoUltimoCierre } from "@/lib/caja";
import { PageHeader } from "@/components/ui";
import { CajaPOS } from "@/components/caja-pos";
import { CajaOperacionPanel } from "@/components/caja-operacion-panel";
export default async function CajaPage() {
  const usuario = await requireAcceso("caja");
  const contexto = await getContextoSucursal();
  const sucursal = contexto.activa ?? contexto.lista[0];
  if (!sucursal) return <><PageHeader title="Caja" subtitle="Apertura, ventas y arqueo" /><div className="card p-6">Creá una sucursal desde el selector de locales antes de abrir la caja.</div></>;
  const turno = await cajaAbierta(sucursal.id);
  const esAdmin = usuario.rol === "admin";
  const [pendiente, traspaso, anterior, extracciones, resumen, cambios, aperturaPorMotivar, cierrePorMotivar] = await Promise.all([
    esAdmin ? cierrePendiente(sucursal.id) : db.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursal.id), eq(cajaTurnos.estado, "pendiente"), eq(cajaTurnos.responsableUsuario, usuario.usuario))).orderBy(desc(cajaTurnos.id)).limit(1).then(r => r[0] ?? null),
    turno ? traspasoPendiente(turno.id) : Promise.resolve(null),
    esAdmin ? saldoUltimoCierre(sucursal.id) : Promise.resolve(null),
    esAdmin ? db.select().from(cajaExtracciones).where(eq(cajaExtracciones.sucursalId, sucursal.id)).orderBy(desc(cajaExtracciones.id)).limit(20) : Promise.resolve([]),
    turno && esAdmin ? resumenCaja(turno) : Promise.resolve(null),
    esAdmin ? db.select().from(cambiosPrecio).where(eq(cambiosPrecio.sucursalId, sucursal.id)).orderBy(desc(cambiosPrecio.id)).limit(100) : Promise.resolve([]),
    db.select({ id: cajaTurnos.id }).from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursal.id), eq(cajaTurnos.aperturaUsuario, usuario.usuario), eq(cajaTurnos.aperturaEstado, "pendiente"), eq(cajaTurnos.motivoApertura, ""), lt(cajaTurnos.diferenciaApertura, 0))).orderBy(asc(cajaTurnos.id)).limit(1).then(r => r[0] ?? null),
    db.select({ id: cajaTurnos.id }).from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursal.id), eq(cajaTurnos.responsableUsuario, usuario.usuario), eq(cajaTurnos.estado, "pendiente"), eq(cajaTurnos.observaciones, ""), lt(cajaTurnos.diferencia, 0))).orderBy(asc(cajaTurnos.id)).limit(1).then(r => r[0] ?? null),
  ]);
  const esResponsable = !!turno && (turno.responsableUsuario || turno.responsable) === (turno.responsableUsuario ? usuario.usuario : usuario.nombre);
  const resumenVisible = esAdmin ? resumen : null;
  const turnoVisible = esAdmin || !turno ? turno : { ...turno, fondoInicial: 0, fondoEsperado: null, diferenciaApertura: null, fondoContado: null, efectivoEsperado: null, efectivoContado: null, diferencia: null, resumen: null, detalleApertura: "{}", detalleCierre: "{}" };
  const pendienteVisible = esAdmin || !pendiente ? pendiente : { ...pendiente, fondoInicial: 0, fondoEsperado: null, diferenciaApertura: null, fondoContado: null, efectivoContado: null, declaradoCierre: pendiente.responsableUsuario === usuario.usuario ? pendiente.declaradoCierre : null, efectivoEsperado: null, diferencia: null, resumen: null, detalleApertura: "{}", detalleCierre: "{}" };
  const traspasoVisible = esAdmin || !traspaso ? traspaso : { ...traspaso, esperado: 0, contadoSalida: traspaso.salienteUsuario === usuario.usuario ? traspaso.contadoSalida : 0, detalleSalida: "{}", contadoEntrada: null, detalleEntrada: null };
  const [items, stock] = turno && esResponsable && !traspaso && !turno.arqueoEn ? await Promise.all([db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.nombre)), stockDeSucursal(sucursal.id)]) : [[], new Map<number, number>()];
  const catalogo = items.map(p => ({ ...p, stock: stock.get(p.id) ?? 0 }));
  return <><div className="mb-2 hidden items-center gap-3 xl:flex"><h1 className="text-lg font-bold">Caja</h1><p className="text-sm text-slate-500">Apertura, ventas y arqueo · {sucursal.nombre}</p></div><CajaOperacionPanel key={`${sucursal.id}-${turno?.id ?? pendiente?.id ?? "cerrada"}`} anterior={esAdmin ? anterior : null} pendiente={pendienteVisible} aperturaPorMotivarId={aperturaPorMotivar?.id ?? null} cierrePorMotivarId={cierrePorMotivar?.id ?? null} traspaso={traspasoVisible} usuario={usuario.usuario} esResponsable={esResponsable} extracciones={extracciones} turno={turnoVisible} resumen={resumenVisible} cambios={cambios} sucursal={sucursal.nombre} esAdmin={esAdmin} />{turno && esResponsable && !traspaso && !turno.arqueoEn && <Suspense fallback={<div className="card p-6">Cargando caja…</div>}><CajaPOS productos={catalogo} /></Suspense>}</>;
}
