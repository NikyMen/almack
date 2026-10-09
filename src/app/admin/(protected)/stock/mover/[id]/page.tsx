import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, stockMovimientos, stockMovimientoItems, sucursales, productos, gastos } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { esSuperAdmin } from "@/lib/permisos";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DetalleTraslado } from "@/components/detalle-traslado";
import type { TrasladoVista } from "@/components/mover-stock";

function fechaArgentina(fecha: Date | null) {
  return fecha ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(fecha) : "—";
}
export default async function MovimientoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sucursal?: string }> }) {
  const usuario = await requireAcceso("movimientos");
  const contexto = await getContextoSucursal();
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const parametro = (await searchParams).sucursal;
  const activaId = esSuperAdmin(usuario) && parametro
    ? parametro === "todas" ? null : contexto.lista.find(s => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const [m] = await db.select().from(stockMovimientos).where(eq(stockMovimientos.id, id));
  if (!m || (activaId !== null && m.origenId !== activaId && m.destinoId !== activaId)) notFound();
  const [locales, lineas, costos] = await Promise.all([
    db.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales),
    db.select({ id: stockMovimientoItems.id, codigo: productos.sku, nombre: stockMovimientoItems.descripcion, enviado: stockMovimientoItems.cantidad, verificado: stockMovimientoItems.cantidadVerificada, ingresado: stockMovimientoItems.cantidadRecibida }).from(stockMovimientoItems).leftJoin(productos, eq(productos.id, stockMovimientoItems.productoId)).where(eq(stockMovimientoItems.movimientoId, id)).orderBy(stockMovimientoItems.id),
    db.select().from(gastos).where(eq(gastos.movimientoId, id)),
  ]);
  const nombres = new Map(locales.map(s => [s.id, s.nombre]));
  const traslado: TrasladoVista = {
    id: m.id, fecha: m.creadoEn, origen: nombres.get(m.origenId) ?? `Sucursal ${m.origenId}`, destino: nombres.get(m.destinoId) ?? `Sucursal ${m.destinoId}`,
    unidades: m.unidades, nota: m.nota, usuario: m.usuarioNombre, estado: m.estado, origenId: m.origenId, destinoId: m.destinoId, recibidoPor: m.recibidoPor, recepcionNota: m.recepcionNota,
    items: lineas.map(i => ({ ...i, codigo: i.codigo ?? "—" })), gasto: null,
  };
  const estado = ({ en_transito: "En tránsito", recibido: "Recibido", rechazado: "Rechazado", devuelto: "Devuelto" } as Record<string, string>)[m.estado] ?? m.estado;
  return <>
    <PageHeader title={`Movimiento #${id}`} subtitle={`${traslado.origen} → ${traslado.destino}`} />
    <Link href={`/admin/stock/mover?sucursal=${activaId ?? "todas"}`} className="btn-ghost mb-4 inline-flex border border-slate-200 bg-white">← Volver a Mover stock</Link>
    <section className="card mb-4 p-4 sm:p-5">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Sucursal de origen", traslado.origen], ["Sucursal de destino", traslado.destino], ["Fecha y hora del envío", fechaArgentina(m.creadoEn)], ["Usuario", m.usuarioNombre || "—"], ["Estado", estado]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl>
      {m.nota && <p className="mt-4 break-words text-sm"><strong>Nota del envío:</strong> {m.nota}</p>}
      {m.recibidoEn && <p className="mt-3 text-sm text-slate-500">Última resolución: {fechaArgentina(m.recibidoEn)} · {m.recibidoPor || "—"}</p>}
      {m.recepcionNota && <p className="mt-2 break-words text-sm"><strong>Observaciones de recepción:</strong> {m.recepcionNota}</p>}
      {costos.map(g => <p key={g.id} className="mt-2 text-sm text-amber-700">{g.concepto} · {money(g.monto)}</p>)}
    </section>
    <DetalleTraslado traslado={traslado} sucursalActivaId={activaId} />
  </>;
}