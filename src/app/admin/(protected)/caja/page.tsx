import { Suspense } from "react";
import { db, productos, cajaExtracciones, cambiosPrecio } from "@/db";
import { asc, desc, eq } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { stockDeSucursal } from "@/lib/stock";
import { cajaAbierta, resumenCaja, saldoUltimoCierre } from "@/lib/caja";
import { PageHeader } from "@/components/ui";
import { tieneAcceso } from "@/lib/permisos";
import { CajaPOS } from "@/components/caja-pos";
import { CajaTurnoPanel } from "@/components/caja-turno-panel";
export default async function CajaPage() {
  const usuario = await requireAcceso("caja");
  const contexto = await getContextoSucursal();
  const sucursal = contexto.activa ?? contexto.lista[0];
  if (!sucursal) return <><PageHeader title="Caja" subtitle="Apertura, ventas y arqueo" /><div className="card p-6">Creá una sucursal desde el selector de locales antes de abrir la caja.</div></>;
  const turno = await cajaAbierta(sucursal.id);
  const esAdmin = usuario.rol === "admin";
  const [anterior, extracciones, resumen, cambios] = await Promise.all([
    esAdmin ? saldoUltimoCierre(sucursal.id) : Promise.resolve(null),
    esAdmin ? db.select().from(cajaExtracciones).where(eq(cajaExtracciones.sucursalId, sucursal.id)).orderBy(desc(cajaExtracciones.id)).limit(20) : Promise.resolve([]),
    turno && esAdmin ? resumenCaja(turno) : Promise.resolve(null),
    db.select().from(cambiosPrecio).where(eq(cambiosPrecio.sucursalId, sucursal.id)).orderBy(desc(cambiosPrecio.id)).limit(100),
  ]);
  const resumenVisible = turno && !esAdmin ? { cobros: [], movimientos: [], ingresos: 0, retiros: 0, efectivo: 0, esperado: 0 } : resumen;
  const turnoVisible = esAdmin || !turno ? turno : { ...turno, fondoInicial: 0, fondoEsperado: null, diferenciaApertura: null };
  const [items, stock] = turno ? await Promise.all([db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.nombre)), stockDeSucursal(sucursal.id)]) : [[], new Map<number, number>()];
  const catalogo = items.map(p => ({ ...p, stock: stock.get(p.id) ?? 0 }));
  return <><div className="mb-2 hidden items-center gap-3 xl:flex"><h1 className="text-lg font-bold">Caja</h1><p className="text-sm text-slate-500">Apertura, ventas y arqueo · {sucursal.nombre}</p></div><CajaTurnoPanel key={`${sucursal.id}-${turno?.id ?? "cerrada"}`} anterior={esAdmin ? anterior : null} extracciones={extracciones} turno={turnoVisible} resumen={resumenVisible} cambios={cambios} sucursal={sucursal.nombre} puedeVerVentas={tieneAcceso(usuario, "ventas")} esAdmin={esAdmin} />{turno && <Suspense fallback={<div className="card p-6">Cargando caja…</div>}><CajaPOS productos={catalogo} /></Suspense>}</>;
}
