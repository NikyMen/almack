import { Suspense } from "react";
import { db, productos, cajaTurnos, cajaExtracciones } from "@/db";
import { asc, desc, eq, and } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { stockDeSucursal } from "@/lib/stock";
import { cajaAbierta, resumenCaja, saldoUltimoCierre } from "@/lib/caja";
import { PageHeader } from "@/components/ui";
import { CajaPOS } from "@/components/caja-pos";
import { CajaTurnoPanel } from "@/components/caja-turno-panel";
export default async function CajaPage() {
  await requireAcceso("caja");
  const contexto = await getContextoSucursal();
  const sucursal = contexto.activa ?? contexto.lista[0];
  if (!sucursal) return <><PageHeader title="Caja" subtitle="Apertura, ventas y arqueo" /><div className="card p-6">Creá una sucursal desde el selector de locales antes de abrir la caja.</div></>;
  const turno = await cajaAbierta(sucursal.id);
  const anterior = await saldoUltimoCierre(sucursal.id);
  const extracciones = await db.select().from(cajaExtracciones).where(eq(cajaExtracciones.sucursalId, sucursal.id)).orderBy(desc(cajaExtracciones.id)).limit(20);
  const resumen = turno ? await resumenCaja(turno) : null;
  const historial = await db.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursal.id), eq(cajaTurnos.estado, "cerrada"))).orderBy(desc(cajaTurnos.id)).limit(20);
  const items = await db.select().from(productos).orderBy(asc(productos.nombre));
  const stock = await stockDeSucursal(sucursal.id);
  const catalogo = items.map(p => ({ ...p, stock: stock.get(p.id) ?? 0 }));
  return <><PageHeader title="Caja" subtitle={`Apertura, ventas y arqueo · ${sucursal.nombre}`} /><CajaTurnoPanel key={`${sucursal.id}-${turno?.id ?? "cerrada"}`} anterior={anterior} extracciones={extracciones} turno={turno} resumen={resumen} historial={historial} sucursal={sucursal.nombre} />{turno && <Suspense fallback={<div className="card p-6">Cargando caja…</div>}><CajaPOS productos={catalogo} /></Suspense>}</>;
}
