"use client";

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { FilaCategoria, FilaGrupo, FilaProducto, CeldaHorario } from "@/lib/metricas-ventas";
import { Apilada100, Barras, Columnas, Dispersion, Dona, Evolucion, MapaHorarios, Treemap, MARCA, SERIES, Leyenda, ANTERIOR, type Formato } from "@/components/metricas-graficos";

type Serie = { ventas: number[]; ganancia: number[]; tickets: number[] };
export type DatosPanel = {
  categoria: string | null;
  segmento: string | null;
  evolucion: { etiquetas: string[]; etiquetasAnterior: string[]; actual: Serie; anterior: Serie; porMes: boolean };
  porSegmento: FilaGrupo[]; porLocal: FilaGrupo[]; porCaja: FilaGrupo[];
  categorias: FilaCategoria[];
  productos: { masGanancia: FilaProducto[]; mejorMargen: FilaProducto[]; masMovimiento: FilaProducto[]; menosMovimiento: FilaProducto[]; masVendidos: FilaProducto[] };
  horarios: CeldaHorario[];
  inmovilizado: { categoria: string; productos: number; valor: number }[];
};

type Opcion = readonly [string, string];
type Widget = { id: string; titulo: string; ayuda: string; tipos?: readonly Opcion[]; metricas?: readonly Opcion[]; vistas?: readonly Opcion[]; ancho: boolean };
const WIDGETS: Widget[] = [
  { id: "evolucion", titulo: "Evolución", ayuda: "Este período contra el anterior de la misma duración.", tipos: [["linea", "Línea"], ["columnas", "Columnas"]], metricas: [["ventas", "Ventas"], ["ganancia", "Ganancia"], ["tickets", "Tickets"]], ancho: true },
  { id: "segmentos", titulo: "Minorista, mayorista y online", ayuda: "Según el tipo de local donde se cobró. Online = pedidos de la tienda.", tipos: [["dona", "Dona"], ["apilada", "Barra 100%"], ["columnas", "Columnas"]], metricas: [["ventas", "Ventas"], ["ganancia", "Ganancia"], ["tickets", "Tickets"], ["promedio", "Ticket promedio"]], ancho: false },
  { id: "categorias", titulo: "Ventas por categoría", ayuda: "Elegí una categoría arriba para ver sus productos.", tipos: [["treemap", "Mosaico"], ["barras", "Barras"], ["columnas", "Columnas"]], metricas: [["ventas", "Ventas"], ["ganancia", "Ganancia"], ["margen", "Margen"], ["unidades", "Unidades"]], ancho: false },
  { id: "locales", titulo: "Locales y cajas", ayuda: "Cuánto vende cada local o caja y con qué margen.", vistas: [["locales", "Locales"], ["cajas", "Cajas"]], tipos: [["columnas", "Columnas"], ["barras", "Barras"]], metricas: [["ventas_ganancia", "Ventas y ganancia"], ["tickets", "Tickets"], ["promedio", "Ticket promedio"], ["margen", "Margen"]], ancho: false },
  { id: "ranking", titulo: "Ranking de productos", ayuda: "Top 10 del período.", vistas: [["ganancia", "Más ganancia"], ["margen", "Mejor margen"], ["mas", "Más vendidos"], ["menos", "Menos vendidos"]], tipos: [["barras", "Barras"], ["piruleta", "Piruleta"]], ancho: false },
  { id: "dispersion", titulo: "Volumen vs. margen", ayuda: "Los 40 productos que más facturaron. Tamaño = facturación. Las guías son las medianas.", ancho: true },
  { id: "horarios", titulo: "Días y horarios", ayuda: "Cuándo se vende: día de la semana por hora (hora de Argentina).", metricas: [["tickets", "Tickets"], ["ventas", "Ventas"]], ancho: true },
  { id: "inmovilizado", titulo: "Stock sin ventas por categoría", ayuda: "Valor a costo de lo que no se vendió en el período.", tipos: [["barras", "Barras"], ["treemap", "Mosaico"]], ancho: false },
];

type Preferencias = { ocultos: string[]; anchos: Record<string, boolean>; opciones: Record<string, { tipo?: string; metrica?: string; vista?: string }> };
const INICIAL: Preferencias = { ocultos: [], anchos: {}, opciones: {} };
const COLOR_SEGMENTO: Record<string, string> = { minorista: SERIES[0], mayorista: SERIES[1], online: SERIES[2] };

export function MetricasVentasPanel({ datos, usuarioId }: { datos: DatosPanel; usuarioId: number }) {
  const clave = `almack-metricas-ventas-${usuarioId}`;
  const [pref, setPref] = useState<Preferencias>(INICIAL);
  const [configurar, setConfigurar] = useState(false);
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(clave) ?? "null") as Preferencias | null;
      if (g && Array.isArray(g.ocultos) && g.opciones) setPref({ ...INICIAL, ...g });
    } catch { /* valores iniciales */ }
  }, [clave]);
  const guardar = (p: Preferencias) => { setPref(p); localStorage.setItem(clave, JSON.stringify(p)); };
  const opcion = (w: Widget, k: "tipo" | "metrica" | "vista") => {
    const lista = k === "tipo" ? w.tipos : k === "metrica" ? w.metricas : w.vistas;
    const v = pref.opciones[w.id]?.[k];
    return lista?.some(([id]) => id === v) ? v! : lista?.[0][0] ?? "";
  };
  const cambiar = (w: Widget, k: "tipo" | "metrica" | "vista", v: string) => guardar({ ...pref, opciones: { ...pref.opciones, [w.id]: { ...pref.opciones[w.id], [k]: v } } });
  const anchoCompleto = (w: Widget) => pref.anchos[w.id] ?? w.ancho;
  const visibles = WIDGETS.filter(w => !pref.ocultos.includes(w.id));

  return <>
    <div className="mb-4 mt-6 flex flex-wrap items-center gap-3">
      <button className="btn-ghost" onClick={() => setConfigurar(!configurar)} aria-expanded={configurar}><SlidersHorizontal className="h-4 w-4" /> Personalizar gráficos</button>
      <p className="text-xs text-slate-500">Elegí qué ver y cómo; en cada gráfico podés cambiar el tipo y la métrica. Se guarda en este navegador.</p>
    </div>
    {configurar && <section className="card mb-5 p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Gráficos visibles</h2><button className="btn-ghost text-xs" onClick={() => guardar(INICIAL)}><RotateCcw className="h-3.5 w-3.5" /> Restaurar</button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{WIDGETS.map(w => <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!pref.ocultos.includes(w.id)} onChange={e => guardar({ ...pref, ocultos: e.target.checked ? pref.ocultos.filter(x => x !== w.id) : [...pref.ocultos, w.id] })} />{w.titulo}</label>
        <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={anchoCompleto(w)} onChange={e => guardar({ ...pref, anchos: { ...pref.anchos, [w.id]: e.target.checked } })} />Ancho completo</label>
      </div>)}</div>
    </section>}
    {!visibles.length && <div className="card p-6 text-center text-sm text-slate-500">No hay gráficos visibles. Usá “Personalizar gráficos” para elegir cuáles mostrar.</div>}
    <div className="grid gap-6 lg:grid-cols-2">
      {visibles.map(w => <section key={w.id} className={`card min-w-0 p-5 ${anchoCompleto(w) ? "lg:col-span-2" : ""}`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{w.id === "categorias" && datos.categoria ? `Productos de ${datos.categoria}` : w.titulo}</h2>
            <p className="text-xs text-slate-500">{w.id === "categorias" && datos.categoria ? "Los 15 que más facturaron dentro de la categoría." : w.ayuda}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {w.vistas && <Selector valor={opcion(w, "vista")} opciones={w.vistas} onChange={v => cambiar(w, "vista", v)} etiqueta="Vista" />}
            {w.metricas && <Selector valor={opcion(w, "metrica")} opciones={w.metricas} onChange={v => cambiar(w, "metrica", v)} etiqueta="Métrica" />}
            {w.tipos && <Selector valor={opcion(w, "tipo")} opciones={w.tipos} onChange={v => cambiar(w, "tipo", v)} etiqueta="Tipo de gráfico" />}
          </div>
        </div>
        <Contenido id={w.id} datos={datos} tipo={opcion(w, "tipo")} metrica={opcion(w, "metrica")} vista={opcion(w, "vista")} />
      </section>)}
    </div>
  </>;
}

function Selector({ valor, opciones, onChange, etiqueta }: { valor: string; opciones: readonly Opcion[]; onChange: (v: string) => void; etiqueta: string }) {
  return <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
    {opciones.map(([id, nombre]) => <button key={id} role="radio" aria-checked={valor === id} onClick={() => onChange(id)}
      className={`rounded-md px-2.5 py-1 font-medium transition ${valor === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{nombre}</button>)}
  </div>;
}

const Vacio = ({ texto = "Sin ventas en el período." }: { texto?: string }) => <p className="py-10 text-center text-sm text-slate-400">{texto}</p>;
const pct = (x: number) => `${x.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const unidad = (p: FilaProducto) => (p.unidadMedida === "kg" ? "kg" : "u.");

function valorGrupo(g: FilaGrupo, metrica: string) {
  return metrica === "tickets" ? g.tickets : metrica === "promedio" ? g.ticketPromedio : metrica === "margen" ? g.margenPct : metrica === "ganancia" ? g.ganancia : g.total;
}
const formatoDe = (metrica: string): Formato => (metrica === "tickets" || metrica === "unidades" ? "numero" : metrica === "margen" ? "porcentaje" : "dinero");

function Contenido({ id, datos, tipo, metrica, vista }: { id: string; datos: DatosPanel; tipo: string; metrica: string; vista: string }) {
  switch (id) {
    case "evolucion": {
      const e = datos.evolucion;
      const clave = metrica as keyof Serie;
      if (!e.actual.tickets.some(Boolean) && !e.anterior.tickets.some(Boolean)) return <Vacio />;
      return <>
        {tipo === "linea" && <Leyenda items={[{ color: MARCA, etiqueta: "Este período" }, { color: ANTERIOR, etiqueta: "Período anterior", punteada: true }]} />}
        <Evolucion etiquetas={e.etiquetas} etiquetasAnterior={e.etiquetasAnterior} actual={e.actual[clave]} anterior={e.anterior[clave]} formato={formatoDe(metrica)} tipo={tipo as "linea" | "columnas"} nombreAnterior="anterior" />
      </>;
    }
    case "segmentos": {
      if (!datos.porSegmento.length) return <Vacio />;
      if (datos.segmento) return <Vacio texto="Estás viendo un solo tipo de venta. Quitá el filtro “Tipo de venta” para comparar minorista, mayorista y online." />;
      const f = formatoDe(metrica);
      const filas = datos.porSegmento.map(s => ({ clave: s.clave, etiqueta: s.nombre, valor: valorGrupo(s, metrica), color: COLOR_SEGMENTO[s.clave] ?? SERIES[3], detalle: `${s.tickets} ticket${s.tickets === 1 ? "" : "s"} · margen ${pct(s.margenPct)}` }));
      const aditiva = metrica !== "promedio";
      if (tipo === "columnas" || !aditiva) return <>{!aditiva && tipo !== "columnas" && <p className="mb-2 text-xs text-slate-500">El ticket promedio no se suma: se muestra en columnas.</p>}
        <Columnas categorias={filas.map(x => ({ clave: x.clave, etiqueta: x.etiqueta }))} series={[{ nombre: "", color: MARCA, valores: filas.map(x => x.valor) }]} formato={f} /></>;
      if (tipo === "apilada") return <Apilada100 datos={filas} formato={f} />;
      return <Dona datos={filas} formato={f} centro={metrica === "tickets" ? "tickets" : metrica === "ganancia" ? "ganancia" : "vendido"} />;
    }
    case "categorias": {
      const f = formatoDe(metrica);
      const filas = datos.categoria
        ? datos.productos.masVendidos.slice(0, 15).map(p => ({ clave: String(p.id), etiqueta: p.nombre, ingreso: p.ingreso, ganancia: p.ganancia, margenPct: p.margenPct, unidades: p.unidades, extra: `${pct(p.margenPct)} de margen · ${p.unidades.toLocaleString("es-AR")} ${unidad(p)}` }))
        : datos.categorias.map(c => ({ clave: c.categoria, etiqueta: c.categoria, ingreso: c.ingreso, ganancia: c.ganancia, margenPct: c.margenPct, unidades: c.unidades, extra: `${pct(c.margenPct)} de margen · ${c.productos} producto${c.productos === 1 ? "" : "s"}` }));
      if (!filas.length) return <Vacio />;
      const valor = (x: (typeof filas)[number]) => metrica === "ganancia" ? x.ganancia : metrica === "margen" ? x.margenPct : metrica === "unidades" ? x.unidades : x.ingreso;
      const ordenadas = [...filas].sort((a, b) => valor(b) - valor(a));
      const puntos = ordenadas.map(x => ({ clave: x.clave, etiqueta: x.etiqueta, valor: valor(x), extra: x.extra, detalle: "" }));
      if (tipo === "treemap" && metrica !== "margen") return <Treemap datos={puntos} formato={f} />;
      if (tipo === "columnas") return <Columnas categorias={puntos.slice(0, 12).map(x => ({ clave: x.clave, etiqueta: x.etiqueta }))} series={[{ nombre: "", color: MARCA, valores: puntos.slice(0, 12).map(x => x.valor) }]} formato={f} />;
      return <>{tipo === "treemap" && <p className="mb-2 text-xs text-slate-500">El margen no se suma entre categorías: se muestra en barras.</p>}<Barras datos={puntos.slice(0, 15)} formato={f} /></>;
    }
    case "locales": {
      const grupos = vista === "cajas" ? datos.porCaja : datos.porLocal;
      if (!grupos.length) return <Vacio />;
      const cats = grupos.map(g => ({ clave: g.clave, etiqueta: g.nombre, detalle: g.detalle }));
      if (metrica === "ventas_ganancia") {
        if (tipo === "barras") return <>
          <Leyenda items={[{ color: SERIES[0], etiqueta: "Ventas", forma: "caja" }]} />
          <Barras color={SERIES[0]} datos={grupos.map(g => ({ clave: g.clave, etiqueta: g.nombre, detalle: g.detalle, valor: g.total, extra: `Ganancia ${pct(g.margenPct)} · ${g.tickets} tickets` }))} formato="dinero" />
          <p className="mt-2 text-xs text-slate-500">Elegí “Columnas” para ver ventas y ganancia lado a lado.</p>
        </>;
        return <Columnas categorias={cats} series={[{ nombre: "Ventas", color: SERIES[0], valores: grupos.map(g => g.total) }, { nombre: "Ganancia", color: SERIES[1], valores: grupos.map(g => g.ganancia) }]} formato="dinero" />;
      }
      const f = formatoDe(metrica);
      if (tipo === "barras") return <Barras datos={grupos.map(g => ({ clave: g.clave, etiqueta: g.nombre, detalle: g.detalle, valor: valorGrupo(g, metrica) }))} formato={f} />;
      return <Columnas categorias={cats} series={[{ nombre: "", color: MARCA, valores: grupos.map(g => valorGrupo(g, metrica)) }]} formato={f} />;
    }
    case "ranking": {
      const lista = vista === "margen" ? datos.productos.mejorMargen : vista === "mas" ? datos.productos.masMovimiento : vista === "menos" ? datos.productos.menosMovimiento : datos.productos.masGanancia;
      if (!lista.length) return <Vacio />;
      const f: Formato = vista === "margen" ? "porcentaje" : vista === "mas" || vista === "menos" ? "numero" : "dinero";
      const valor = (p: FilaProducto) => (vista === "margen" ? p.margenPct : vista === "mas" || vista === "menos" ? p.unidades : p.ganancia);
      return <Barras estilo={tipo as "barras" | "piruleta"} formato={f} datos={lista.map(p => ({
        clave: String(p.id), etiqueta: p.nombre, valor: valor(p),
        detalle: vista === "margen" ? "de margen" : vista === "mas" || vista === "menos" ? (p.unidadMedida === "kg" ? "kg" : "unidades") : "de ganancia",
        extra: `${p.categoria} · facturó ${p.ingreso.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })} · ${pct(p.margenPct)} de margen · ${p.tickets} ticket${p.tickets === 1 ? "" : "s"}`,
      }))} />;
    }
    case "dispersion": {
      const pts = datos.productos.masVendidos.filter(p => p.unidades > 0);
      if (pts.length < 3) return <Vacio texto="Hacen falta al menos 3 productos vendidos para comparar." />;
      return <Dispersion datos={pts.map(p => ({ clave: String(p.id), etiqueta: p.nombre, unidades: p.unidades, margen: p.margenPct, ingreso: p.ingreso, ganancia: p.ganancia, unidad: p.unidadMedida }))} />;
    }
    case "horarios": {
      if (!datos.horarios.length) return <Vacio />;
      return <MapaHorarios formato={formatoDe(metrica)} celdas={datos.horarios.map(c => ({ dia: c.dia, hora: c.hora, valor: metrica === "ventas" ? c.total : c.tickets }))} />;
    }
    case "inmovilizado": {
      if (!datos.inmovilizado.length) return <Vacio texto="Todo el stock tuvo movimiento." />;
      const puntos = datos.inmovilizado.map(c => ({ clave: c.categoria, etiqueta: c.categoria, valor: c.valor, detalle: "a costo", extra: `${c.productos} producto${c.productos === 1 ? "" : "s"} sin ventas` }));
      return tipo === "treemap" ? <Treemap datos={puntos} formato="dinero" /> : <Barras datos={puntos.slice(0, 12)} formato="dinero" color="#ff711f" />;
    }
  }
  return null;
}
