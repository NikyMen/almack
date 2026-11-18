import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { ventas as ventasTabla, db, clientes, sucursales } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { VentasTabla } from "@/components/ventas-tabla";
import { moneyPreciso } from "@/lib/format";

const TAMANO_PAGINA = 50;
const ZONA = "America/Argentina/Buenos_Aires";
const diaLocal = (fecha: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
const fechaValida = (valor: string | undefined) => {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor ? null : valor;
};
const lunesDe = (dia: string) => {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7);
  return fecha.toISOString().slice(0, 10);
};
const sumarDias = (dia: string, dias: number) => {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};
const inicioUtc = (dia: string) => new Date(`${dia}T03:00:00Z`);

type Parametros = { vista?: string; fecha?: string; pagina?: string };
export default async function HistorialVentas({ searchParams }: { searchParams: Promise<Parametros> }) {
  await requireAdmin();
  const { activa, activaId } = await getContextoSucursal();
  const params = await searchParams;
  const vista = params.vista === "semana" ? "semana" : "dia";
  const filtroSucursal = activaId ? eq(ventasTabla.sucursalId, activaId) : undefined;
  const [ultima] = await db.select({ fecha: sql<number | null>`max(${ventasTabla.fecha})` }).from(ventasTabla).where(filtroSucursal);
  const fechaElegida = fechaValida(params.fecha) ?? (ultima?.fecha ? diaLocal(new Date(Number(ultima.fecha) * 1000)) : diaLocal(new Date()));
  const comienzo = vista === "semana" ? lunesDe(fechaElegida) : fechaElegida;
  const siguiente = sumarDias(comienzo, vista === "semana" ? 7 : 1);
  const filtro = and(filtroSucursal, gte(ventasTabla.fecha, inicioUtc(comienzo)), lt(ventasTabla.fecha, inicioUtc(siguiente)));
  const paginaPedida = Number(params.pagina);
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida > 0 ? Math.min(paginaPedida, 10000) : 1;
  const [resumen] = await db.select({ cantidad: sql<number>`count(*)`, total: sql<number>`coalesce(sum(case when ${ventasTabla.estado} = 'completada' then ${ventasTabla.total} else 0 end),0)` }).from(ventasTabla).where(filtro);
  const paginas = Math.max(1, Math.ceil(Number(resumen?.cantidad ?? 0) / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, paginas);
  const ventas = await db.select({
    id: ventasTabla.id, sucursalId: ventasTabla.sucursalId, total: ventasTabla.total,
    estado: ventasTabla.estado, canal: ventasTabla.canal, medioPago: ventasTabla.medioPago,
    fecha: ventasTabla.fecha, cliente: clientes.nombre, sucursal: sucursales.nombre, cajero: ventasTabla.cajero,
  }).from(ventasTabla).leftJoin(clientes, eq(ventasTabla.clienteId, clientes.id))
    .leftJoin(sucursales, eq(ventasTabla.sucursalId, sucursales.id))
    .where(filtro).orderBy(desc(ventasTabla.fecha), desc(ventasTabla.id))
    .limit(TAMANO_PAGINA).offset((paginaActual - 1) * TAMANO_PAGINA);
  const [anteriorRegistrado, siguienteRegistrado] = await Promise.all([
    db.select({ fecha: sql<number | null>`max(${ventasTabla.fecha})` }).from(ventasTabla).where(and(filtroSucursal, lt(ventasTabla.fecha, inicioUtc(comienzo)))),
    db.select({ fecha: sql<number | null>`min(${ventasTabla.fecha})` }).from(ventasTabla).where(and(filtroSucursal, gte(ventasTabla.fecha, inicioUtc(siguiente)))),
  ]);
  const periodoRegistrado = (fecha: number) => {
    const dia = diaLocal(new Date(Number(fecha) * 1000));
    return vista === "semana" ? lunesDe(dia) : dia;
  };
  const enlace = (fecha: string, pagina = 1) => ({ pathname: "/admin/ventas/historial", query: { vista, fecha, pagina } });
  const tituloPeriodo = vista === "dia" ? new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${comienzo}T12:00:00Z`)) : `Semana del ${comienzo} al ${sumarDias(comienzo, 6)}`;
  return <>
    <PageHeader title="Ventas históricas" subtitle={`${resumen?.cantidad ?? 0} operaciones · ${moneyPreciso(Number(resumen?.total ?? 0))} facturado · ${activa?.nombre ?? "Todas las sucursales"}`} />
    <Link href="/admin/ventas" className="btn-ghost mb-4">← Opciones de ventas</Link>
    <div className="card mb-4 space-y-3 p-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="label">Período<select name="vista" className="input mt-1" defaultValue={vista}><option value="dia">Por día</option><option value="semana">Por semana</option></select></label>
        <label className="label">Fecha dentro del período<input type="date" name="fecha" className="input mt-1" defaultValue={fechaElegida} required /></label>
        <button className="btn-primary">Buscar</button>
      </form>
      <nav aria-label="Navegar períodos de ventas" className="flex flex-wrap items-center gap-3 text-sm">
        {anteriorRegistrado[0]?.fecha ? <Link className="btn-ghost" href={enlace(periodoRegistrado(anteriorRegistrado[0].fecha))}>← {vista === "dia" ? "Día anterior con ventas" : "Semana anterior con ventas"}</Link> : <span className="text-slate-400">Sin períodos anteriores</span>}
        <strong className="capitalize">{tituloPeriodo}</strong>
        {siguienteRegistrado[0]?.fecha ? <Link className="btn-ghost" href={enlace(periodoRegistrado(siguienteRegistrado[0].fecha))}>{vista === "dia" ? "Siguiente día con ventas" : "Semana siguiente con ventas"} →</Link> : null}
      </nav>
    </div>
    <p className="mb-3 text-sm text-slate-500">Mostrando {ventas.length} de {resumen?.cantidad ?? 0} ventas · página {paginaActual} de {paginas}</p>
    <VentasTabla ventas={ventas} productos={[]} clientes={[]} puedeDevolver sucursalActivaId={activaId} />
    {paginas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de ventas">
      {paginaActual > 1 && <Link className="btn-ghost" href={enlace(fechaElegida, paginaActual - 1)}>← Anterior</Link>}
      <span className="text-sm">{paginaActual} / {paginas}</span>
      {paginaActual < paginas && <Link className="btn-ghost" href={enlace(fechaElegida, paginaActual + 1)}>Siguiente →</Link>}
    </nav>}
  </>;
}
