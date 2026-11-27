import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader, StatCard } from "@/components/ui";
import { money } from "@/lib/format";
import { MetricasVentasPanel, type DatosPanel } from "@/components/metricas-ventas-panel";
import {
  getTablero, getProductos, getSinVentas, getCategorias, getUltimaVentaAntes,
  ZONA_OFFSET_SEG, type PuntoSerie, type Segmento,
} from "@/lib/metricas-ventas";

const ZONA = "America/Argentina/Buenos_Aires";
const RUTA = "/admin/ventas/metricas";
const diaLocal = (fecha: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
const fechaValida = (valor: string | undefined) => {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor ? null : valor;
};
const sumarDias = (dia: string, dias: number) => {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};
const siguienteMes = (m: string) => { const [a, mm] = m.split("-").map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`; };
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000) + 1;
const inicioUtc = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) + ZONA_OFFSET_SEG * 1000);
const fechaLarga = (dia: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${dia}T12:00:00Z`));
const etiquetaDia = (c: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${c}T12:00:00Z`));
const etiquetaMes = (c: string) => new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${c}-15T12:00:00Z`));
const pct = (x: number) => `${x.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const cantidad = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const variacion = (actual: number, anterior: number) => {
  if (!anterior) return actual ? "sin datos del período anterior" : "igual que el período anterior";
  const d = ((actual - anterior) / Math.abs(anterior)) * 100;
  if (Math.abs(d) < 0.05) return "igual que el período anterior";
  return `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))} vs. período anterior`;
};

const PRESETS = [["hoy", "Hoy", 1], ["7", "7 días", 7], ["30", "30 días", 30], ["90", "90 días", 90], ["365", "1 año", 365]] as const;
const SEGMENTOS: [Segmento, string][] = [["minorista", "Minorista"], ["mayorista", "Mayorista"], ["online", "Online"]];
type Parametros = { p?: string; desde?: string; hasta?: string; pag?: string; cat?: string; seg?: string };

// Claves de cada día (o mes) de un rango, para alinear la serie y rellenar con
// cero los días sin ventas.
function claves(desde: string, hasta: string, porMes: boolean) {
  const r: string[] = [];
  if (porMes) for (let m = desde.slice(0, 7); m <= hasta.slice(0, 7); m = siguienteMes(m)) r.push(m);
  else for (let d = desde; d <= hasta; d = sumarDias(d, 1)) r.push(d);
  return r;
}
function alinear(puntos: PuntoSerie[], lista: string[]) {
  const m = new Map(puntos.map(p => [p.periodo, p]));
  return { ventas: lista.map(c => m.get(c)?.total ?? 0), ganancia: lista.map(c => m.get(c)?.ganancia ?? 0), tickets: lista.map(c => m.get(c)?.tickets ?? 0) };
}

export default async function MetricasVentas({ searchParams }: { searchParams: Promise<Parametros> }) {
  const usuario = await requireAdmin();
  const { activa, activaId } = await getContextoSucursal();
  const params = await searchParams;
  const hoy = diaLocal(new Date());
  const listaCategorias = await getCategorias();
  const categoria = params.cat && listaCategorias.includes(params.cat) ? params.cat : null;
  const segmento = SEGMENTOS.find(([id]) => id === params.seg)?.[0] ?? null;

  // Período: un preset (termina en `hasta`, por defecto hoy) o un rango libre.
  const preset = PRESETS.find(([id]) => id === params.p);
  let hasta = fechaValida(params.hasta) ?? hoy;
  let desde: string;
  if (preset) desde = sumarDias(hasta, -(preset[2] - 1));
  else {
    desde = fechaValida(params.desde) ?? sumarDias(hasta, -29);
    if (desde > hasta) [desde, hasta] = [hasta, desde];
  }
  const modo = preset ? preset[0] : params.desde || params.hasta ? "rango" : "30";
  const largo = diasEntre(desde, hasta);
  const porMes = largo > 92;
  const desdeAnterior = sumarDias(desde, -largo);
  const filtro = { desde: inicioUtc(desde), hasta: inicioUtc(sumarDias(hasta, 1)), sucursalId: activaId, categoria, segmento };
  const paginaPedida = Number(params.pag);
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida > 0 ? Math.min(paginaPedida, 10000) : 1;

  const [tablero, productos, sinVentas] = await Promise.all([
    getTablero(filtro, inicioUtc(desdeAnterior), porMes), getProductos(filtro), getSinVentas(filtro, pagina),
  ]);
  const { resumen, porLocal, porCaja, porSegmento } = tablero.actual;
  const anterior = tablero.anterior.resumen;
  const ultimaVenta = resumen.tickets ? null : await getUltimaVentaAntes(filtro.desde, activaId);

  const filtros: Record<string, string> = { ...(categoria ? { cat: categoria } : {}), ...(segmento ? { seg: segmento } : {}) };
  const enlace = (cambios: Parametros) => {
    const query: Record<string, string> = { ...(modo === "rango" ? { desde, hasta } : { p: modo, hasta }), ...filtros };
    for (const [k, v] of Object.entries(cambios)) if (v === undefined) delete query[k]; else query[k] = v;
    return { pathname: RUTA, query };
  };
  const desplazar = (dias: number) => modo === "rango"
    ? enlace({ desde: sumarDias(desde, dias), hasta: sumarDias(hasta, dias) })
    : enlace({ hasta: sumarDias(hasta, dias) });
  const titulo = largo === 1 ? fechaLarga(desde) : `${fechaLarga(desde)} al ${fechaLarga(hasta)}`;

  const clavesActual = claves(desde, hasta, porMes);
  const clavesAnterior = claves(desdeAnterior, sumarDias(desde, -1), porMes).slice(-clavesActual.length);
  const datos: DatosPanel = {
    categoria,
    segmento,
    evolucion: {
      etiquetas: clavesActual.map(porMes ? etiquetaMes : etiquetaDia),
      etiquetasAnterior: clavesAnterior.map(porMes ? etiquetaMes : etiquetaDia),
      actual: alinear(tablero.serie, clavesActual), anterior: alinear(tablero.serieAnterior, clavesAnterior), porMes,
    },
    porSegmento, porLocal, porCaja,
    categorias: productos.categorias,
    productos,
    horarios: tablero.horarios,
    inmovilizado: sinVentas.porCategoria,
  };
  const descripcionFiltros = [activa?.nombre ?? "Todas las sucursales", categoria && `categoría ${categoria}`, segmento && SEGMENTOS.find(s => s[0] === segmento)?.[1].toLowerCase()].filter(Boolean).join(" · ");

  return <>
    <PageHeader title="Métricas de ventas" subtitle={`${descripcionFiltros} · ${titulo} · solo ventas completadas`} />
    <Link href="/admin/ventas" className="btn-ghost mb-4">← Opciones de ventas</Link>

    <div className="card mb-5 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([id, nombre]) => <Link key={id} href={{ pathname: RUTA, query: { p: id, ...filtros } }} className={modo === id && hasta === hoy ? "btn-primary" : "btn-ghost"}>{nombre}</Link>)}
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="label">Desde<input type="date" name="desde" className="input mt-1" defaultValue={desde} max={hoy} required /></label>
        <label className="label">Hasta<input type="date" name="hasta" className="input mt-1" defaultValue={hasta} max={hoy} required /></label>
        <label className="label">Categoría<select name="cat" className="input mt-1" defaultValue={categoria ?? ""}><option value="">Todas las categorías</option>{listaCategorias.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="label">Tipo de venta<select name="seg" className="input mt-1" defaultValue={segmento ?? ""}><option value="">Minorista, mayorista y online</option>{SEGMENTOS.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
        <button className="btn-primary">Aplicar</button>
        {(categoria || segmento) && <Link className="btn-ghost" href={enlace({ cat: undefined, seg: undefined })}>Quitar filtros</Link>}
      </form>
      <nav aria-label="Navegar períodos" className="flex flex-wrap items-center gap-3 text-sm">
        <Link className="btn-ghost" href={desplazar(-largo)}>← {largo === 1 ? "Día anterior" : `${largo} días anteriores`}</Link>
        <strong>{titulo}</strong>
        {hasta < hoy && <Link className="btn-ghost" href={desplazar(largo)}>{largo === 1 ? "Día siguiente" : `${largo} días siguientes`} →</Link>}
      </nav>
    </div>

    {!resumen.tickets && <div className="card mb-5 flex flex-wrap items-center gap-3 p-4 text-sm text-slate-600">
      No hay ventas completadas en este período con estos filtros.
      {ultimaVenta && <Link className="btn-ghost" href={enlace({ hasta: diaLocal(new Date(ultimaVenta * 1000)), desde: modo === "rango" ? sumarDias(diaLocal(new Date(ultimaVenta * 1000)), -(largo - 1)) : undefined })}>Ir al último período con ventas →</Link>}
    </div>}

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard accent label={categoria ? `Ventas de ${categoria}` : "Ventas"} value={money(resumen.total)} hint={variacion(resumen.total, anterior.total)} />
      <StatCard label={categoria ? "Tickets con la categoría" : "Tickets"} value={String(resumen.tickets)} hint={variacion(resumen.tickets, anterior.tickets)} />
      <StatCard label="Ticket promedio" value={money(resumen.ticketPromedio)} hint={variacion(resumen.ticketPromedio, anterior.ticketPromedio)} />
      <StatCard label="Ganancia bruta estimada" value={money(resumen.ganancia)} hint={`Margen ${pct(resumen.margenPct)} · ${variacion(resumen.ganancia, anterior.ganancia)}`} />
    </div>

    <MetricasVentasPanel datos={datos} usuarioId={usuario.id} />

    <section className="card mt-6 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Productos sin ventas en el período</h2>
          <p className="text-xs text-slate-500">Activos con stock{activa ? ` en ${activa.nombre}` : ""}{categoria ? ` de ${categoria}` : ""} que no se vendieron. Valor a costo actual.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-xs text-slate-500">Productos </span><strong className="tabular-nums">{sinVentas.cantidad}</strong></div>
          <div className="rounded-lg bg-orange-50 px-3 py-2"><span className="text-xs text-slate-500">Inmovilizado </span><strong className="tabular-nums">{money(sinVentas.valor)}</strong></div>
        </div>
      </div>
      {!sinVentas.filas.length ? <p className="py-6 text-center text-sm text-slate-400">Todo el stock tuvo movimiento.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-3 font-medium">Producto</th><th className="py-2 pr-3 font-medium">Categoría</th><th className="py-2 pr-3 text-right font-medium">Stock</th><th className="py-2 pr-3 text-right font-medium">Costo</th><th className="py-2 text-right font-medium">Valor</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{sinVentas.filas.map(p => <tr key={p.id}>
          <td className="py-2 pr-3 font-medium">{p.nombre}</td>
          <td className="py-2 pr-3 text-slate-500">{p.categoria}</td>
          <td className="py-2 pr-3 text-right tabular-nums">{cantidad(p.stock)} {p.unidadMedida === "kg" ? "kg" : "u."}</td>
          <td className="py-2 pr-3 text-right tabular-nums">{money(p.costo)}</td>
          <td className="py-2 text-right tabular-nums">{money(p.valor)}</td>
        </tr>)}</tbody>
      </table></div>}
      {sinVentas.paginas > 1 && <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Páginas de productos sin ventas">
        {sinVentas.pagina > 1 && <Link className="btn-ghost" href={enlace({ pag: String(sinVentas.pagina - 1) })}>← Anterior</Link>}
        <span>{sinVentas.pagina} / {sinVentas.paginas}</span>
        {sinVentas.pagina < sinVentas.paginas && <Link className="btn-ghost" href={enlace({ pag: String(sinVentas.pagina + 1) })}>Siguiente →</Link>}
      </nav>}
    </section>

    <p className="mt-6 text-xs text-slate-400">Cuentan solo las ventas completadas (no se incluyen canceladas, pendientes ni devueltas). La ganancia es estimada: usa el precio de compra actual de cada producto y reparte descuentos y promociones de cada ticket entre sus productos. Con una categoría elegida, las ventas son lo cobrado por esos productos. Horario de Argentina.</p>
  </>;
}
