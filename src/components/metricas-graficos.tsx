"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { money } from "@/lib/format";

// Gráficos SVG livianos para las métricas de ventas. Reglas comunes:
// marcas finas (barras de hasta 24px con punta redondeada de 4px y base recta),
// separación de 2px del color de fondo entre marcas que se tocan, líneas de 2px,
// grilla de 1px sólida y apagada, una sola escala vertical por gráfico, texto
// siempre en tinta (nunca del color de la serie) y tooltip en cada marca.

// Paleta categórica validada (orden fijo, nunca rotar): ver la skill dataviz.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const MARCA = "#003f31"; // una sola serie: verde de la marca
export const ANTERIOR = "#94a3b8"; // período anterior: gris, línea punteada
const GRILLA = "#e7e5e4";
const FONDO = "#ffffff";
const TINTA = "#1c1917";
const TINTA_2 = "#57534e";
const TINTA_3 = "#a8a29e";
// Rampa secuencial (azul) para el mapa de calor, de "casi cero" a máximo.
const RAMPA = ["#f1f5f9", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export type Formato = "dinero" | "numero" | "porcentaje";
export const formatear = (v: number, f: Formato) =>
  f === "dinero" ? money(v) : f === "porcentaje" ? `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
export const corto = (v: number, f: Formato) => {
  if (f === "porcentaje") return `${Math.round(v)}%`;
  const a = Math.abs(v);
  const pre = f === "dinero" ? "$ " : "";
  if (a >= 1e6) return `${pre}${(v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e4) return `${pre}${(v / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`;
  return `${pre}${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
};

function escala(max: number, min = 0) {
  const rango = Math.max(max - min, 1e-9);
  const paso0 = rango / 4;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= paso0) ?? paso0;
  const lo = Math.floor(min / paso) * paso;
  const hi = Math.max(lo + paso, Math.ceil(max / paso) * paso);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + paso / 2; t += paso) ticks.push(Math.round(t * 1e6) / 1e6);
  return { lo, hi, ticks };
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => setAncho(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

type Tip = { x: number; y: number; contenido: ReactNode } | null;
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const mostrar = (e: React.PointerEvent | React.FocusEvent, contenido: ReactNode, contenedor: HTMLElement | null) => {
    if (!contenedor) return;
    const caja = contenedor.getBoundingClientRect();
    const p = "clientX" in e ? { x: e.clientX, y: e.clientY } : (() => { const r = (e.target as Element).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })();
    setTip({ x: p.x - caja.left, y: p.y - caja.top, contenido });
  };
  return { tip, mostrar, ocultar: () => setTip(null) };
}
function Tooltip({ tip, ancho }: { tip: Tip; ancho: number }) {
  if (!tip) return null;
  const izquierda = tip.x > ancho - 190;
  return <div role="tooltip" className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
    style={{ left: izquierda ? undefined : tip.x + 14, right: izquierda ? ancho - tip.x + 14 : undefined, top: Math.max(0, tip.y - 12) }}>{tip.contenido}</div>;
}
const Fila = ({ color, punteada, etiqueta, valor }: { color?: string; punteada?: boolean; etiqueta: string; valor: string }) =>
  <div className="flex items-center gap-2 whitespace-nowrap">
    {color && <svg width="14" height="4" aria-hidden><line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2.5" strokeDasharray={punteada ? "3 2" : undefined} /></svg>}
    <strong className="tabular-nums text-slate-900">{valor}</strong><span className="text-slate-500">{etiqueta}</span>
  </div>;

export function Leyenda({ items }: { items: { color: string; etiqueta: string; punteada?: boolean; forma?: "linea" | "caja" }[] }) {
  return <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">{items.map(i => <span key={i.etiqueta} className="flex items-center gap-1.5">
    {i.forma === "caja" ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} /> : <svg width="16" height="4" aria-hidden><line x1="0" y1="2" x2="16" y2="2" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.punteada ? "3 2" : undefined} /></svg>}
    {i.etiqueta}</span>)}</div>;
}

// Rectángulo con punta redondeada (4px) y base recta. `dir`: hacia dónde crece.
function barra(x: number, y: number, w: number, h: number, dir: "arriba" | "derecha") {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(4, dir === "arriba" ? w / 2 : h / 2, dir === "arriba" ? h : w);
  return dir === "arriba"
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

// ---------------------------------------------------------------------------
// Evolución: línea con área (actual) + línea punteada (período anterior), o
// columnas. Crosshair que se engancha al día más cercano.
// ---------------------------------------------------------------------------
export function Evolucion({ etiquetas, actual, anterior, etiquetasAnterior, formato, tipo, nombreAnterior }: {
  etiquetas: string[]; actual: number[]; anterior: number[]; etiquetasAnterior: string[]; formato: Formato; tipo: "linea" | "columnas"; nombreAnterior: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const alto = 220, m = { t: 12, r: 12, b: 26, l: 64 };
  const w = Math.max(0, ancho - m.l - m.r), h = alto - m.t - m.b;
  const { hi, ticks } = escala(Math.max(...actual, ...(tipo === "linea" ? anterior : []), 0));
  const n = etiquetas.length;
  const banda = n ? w / n : 0;
  const xc = (i: number) => m.l + banda * i + banda / 2;
  const y = (v: number) => m.t + h - (v / hi) * h;
  const linea = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${xc(i)},${y(v)}`).join("");
  const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 56))));
  const mover = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setIdx(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left) / (r.width / n)))));
  };
  return <div ref={ref} className="relative">
    {ancho > 0 && <svg width={ancho} height={alto} role="img" aria-label="Evolución del período">
      {ticks.map(t => <g key={t}><line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke={GRILLA} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TINTA_3}>{corto(t, formato)}</text></g>)}
      {etiquetas.map((e, i) => i % cada === 0 && <text key={e} x={xc(i)} y={alto - 8} textAnchor="middle" fontSize="11" fill={TINTA_3}>{e}</text>)}
      {tipo === "linea" ? <>
        {anterior.length > 0 && <path d={linea(anterior)} fill="none" stroke={ANTERIOR} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
        <path d={`${linea(actual)}L${xc(n - 1)},${y(0)}L${xc(0)},${y(0)}Z`} fill={MARCA} opacity="0.1" />
        <path d={linea(actual)} fill="none" stroke={MARCA} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {n === 1 && <circle cx={xc(0)} cy={y(actual[0])} r="5" fill={MARCA} stroke={FONDO} strokeWidth="2" />}
      </> : actual.map((v, i) => {
        const bw = Math.min(24, Math.max(2, banda - 2));
        return <path key={i} d={barra(xc(i) - bw / 2, y(v), bw, y(0) - y(v), "arriba")} fill={idx === i ? "#ff711f" : MARCA} />;
      })}
      {idx !== null && <g pointerEvents="none">
        <line x1={xc(idx)} x2={xc(idx)} y1={m.t} y2={m.t + h} stroke={TINTA_2} strokeWidth="1" />
        {tipo === "linea" && <>
          {anterior[idx] !== undefined && <circle cx={xc(idx)} cy={y(anterior[idx])} r="4" fill={ANTERIOR} stroke={FONDO} strokeWidth="2" />}
          <circle cx={xc(idx)} cy={y(actual[idx])} r="5" fill={MARCA} stroke={FONDO} strokeWidth="2" />
        </>}
      </g>}
      <line x1={m.l} x2={m.l + w} y1={y(0)} y2={y(0)} stroke="#d6d3d1" />
      <rect x={m.l} y={m.t} width={w} height={h} fill="transparent" onPointerMove={mover} onPointerLeave={() => setIdx(null)} />
    </svg>}
    {idx !== null && <div role="tooltip" className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ top: 4, ...(xc(idx) > ancho - 200 ? { right: ancho - xc(idx) + 12 } : { left: xc(idx) + 12 }) }}>
      <p className="mb-1 font-medium text-slate-700">{etiquetas[idx]}</p>
      <Fila color={MARCA} etiqueta="este período" valor={formatear(actual[idx] ?? 0, formato)} />
      {tipo === "linea" && anterior[idx] !== undefined && <Fila color={ANTERIOR} punteada etiqueta={`${nombreAnterior} (${etiquetasAnterior[idx] ?? ""})`} valor={formatear(anterior[idx], formato)} />}
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Dona: partes de un todo con pocas categorías fijas (colores por entidad).
// ---------------------------------------------------------------------------
export function Dona({ datos, formato, centro }: { datos: { clave: string; etiqueta: string; valor: number; color: string; detalle?: string }[]; formato: Formato; centro: string }) {
  const contRef = useRef<HTMLDivElement>(null);
  const { tip, mostrar, ocultar } = useTip();
  const total = datos.reduce((a, d) => a + Math.max(0, d.valor), 0);
  const R = 70, r = 46, cx = 80, cy = 80;
  let ang = -Math.PI / 2;
  const gap = datos.filter(d => d.valor > 0).length > 1 ? 0.02 : 0;
  const arco = (a0: number, a1: number) => {
    // Redondeado: el servidor y el navegador no dan los mismos decimales en cos/sin.
    const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return `M${p(R, a0)}A${R},${R} 0 ${grande} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${grande} 0 ${p(r, a0)}Z`;
  };
  return <div ref={contRef} className="relative flex flex-wrap items-center gap-6">
    <svg width="160" height="160" role="img" aria-label="Distribución">
      {total > 0 && datos.map(d => {
        const frac = Math.max(0, d.valor) / total;
        const a0 = ang + gap / 2, a1 = ang + frac * Math.PI * 2 - gap / 2;
        ang += frac * Math.PI * 2;
        if (frac <= 0) return null;
        const camino = frac >= 0.9999 ? `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}L${cx - 0.01},${cy - r}A${r},${r} 0 1 0 ${cx},${cy - r}Z` : arco(a0, a1);
        return <path key={d.clave} d={camino} fill={d.color} tabIndex={0} className="outline-none hover:opacity-80 focus:opacity-80"
          onPointerMove={e => mostrar(e, <><Fila color={d.color} etiqueta={d.etiqueta} valor={formatear(d.valor, formato)} /><p className="mt-1 text-slate-500">{formatear(frac * 100, "porcentaje")} del total{d.detalle ? ` · ${d.detalle}` : ""}</p></>, contRef.current)}
          onFocus={e => mostrar(e, <Fila color={d.color} etiqueta={d.etiqueta} valor={formatear(d.valor, formato)} />, contRef.current)}
          onPointerLeave={ocultar} onBlur={ocultar} />;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill={TINTA}>{corto(total, formato)}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fontSize="11" fill={TINTA_2}>{centro}</text>
    </svg>
    <div className="min-w-40 flex-1 space-y-2">{datos.map(d => <div key={d.clave} className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
      <span className="text-slate-600">{d.etiqueta}</span>
      <span className="ml-auto font-semibold tabular-nums">{formatear(d.valor, formato)}</span>
      <span className="w-12 text-right text-xs tabular-nums text-slate-400">{total ? formatear((Math.max(0, d.valor) / total) * 100, "porcentaje") : "—"}</span>
    </div>)}</div>
    <Tooltip tip={tip} ancho={contRef.current?.clientWidth ?? 0} />
  </div>;
}

// Barra 100% apilada (una sola), con etiquetas solo donde entran.
export function Apilada100({ datos, formato }: { datos: { clave: string; etiqueta: string; valor: number; color: string }[]; formato: Formato }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const total = datos.reduce((a, d) => a + Math.max(0, d.valor), 0) || 1;
  let x = 0;
  return <div ref={ref} className="relative">
    <Leyenda items={datos.map(d => ({ color: d.color, etiqueta: d.etiqueta, forma: "caja" }))} />
    {ancho > 0 && <svg width={ancho} height={44} role="img" aria-label="Participación">
      {datos.map(d => {
        const w = (Math.max(0, d.valor) / total) * ancho;
        const x0 = x; x += w;
        if (w <= 0) return null;
        const texto = formatear((d.valor / total) * 100, "porcentaje");
        return <g key={d.clave} tabIndex={0} className="outline-none"
          onPointerMove={e => mostrar(e, <Fila color={d.color} etiqueta={d.etiqueta} valor={`${formatear(d.valor, formato)} · ${texto}`} />, ref.current)} onPointerLeave={ocultar}
          onFocus={e => mostrar(e, <Fila color={d.color} etiqueta={d.etiqueta} valor={formatear(d.valor, formato)} />, ref.current)} onBlur={ocultar}>
          <rect x={x0 + (x0 > 0 ? 1 : 0)} y={4} width={Math.max(0, w - (x0 > 0 ? 1 : 0) - (x < ancho - 0.5 ? 1 : 0))} height={36} rx={x0 === 0 || x >= ancho - 0.5 ? 4 : 0} fill={d.color} className="hover:opacity-85" />
          {w > 56 && <text x={x0 + w / 2} y={27} textAnchor="middle" fontSize="12" fontWeight="600" fill={d.color === SERIES[0] || d.color === SERIES[6] || d.color === MARCA ? "#fff" : "#111"}>{texto}</text>}
        </g>;
      })}
    </svg>}
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}

// ---------------------------------------------------------------------------
// Columnas (verticales), con 1 o 2 series lado a lado sobre la misma escala.
// ---------------------------------------------------------------------------
export function Columnas({ categorias, series, formato }: { categorias: { clave: string; etiqueta: string; detalle?: string }[]; series: { nombre: string; color: string; valores: number[] }[]; formato: Formato }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const alto = 230, m = { t: 18, r: 8, b: 40, l: 64 };
  const w = Math.max(0, ancho - m.l - m.r), h = alto - m.t - m.b;
  const todos = series.flatMap(s => s.valores);
  const { lo, hi, ticks } = escala(Math.max(0, ...todos), Math.min(0, ...todos));
  const y = (v: number) => m.t + h - ((v - lo) / (hi - lo)) * h;
  const banda = categorias.length ? w / categorias.length : 0;
  const bw = Math.min(24, Math.max(4, (banda * 0.7 - (series.length - 1) * 2) / series.length));
  const grupo = bw * series.length + (series.length - 1) * 2;
  return <div ref={ref} className="relative">
    {series.length > 1 && <Leyenda items={series.map(s => ({ color: s.color, etiqueta: s.nombre, forma: "caja" }))} />}
    {ancho > 0 && <svg width={ancho} height={alto} role="img" aria-label="Columnas">
      {ticks.map(t => <g key={t}><line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke={GRILLA} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TINTA_3}>{corto(t, formato)}</text></g>)}
      {categorias.map((c, i) => {
        const x0 = m.l + banda * i + (banda - grupo) / 2;
        const maxLetras = Math.max(4, Math.floor(banda / 6.5));
        return <g key={c.clave}>
          {series.map((s, j) => {
            const v = s.valores[i] ?? 0;
            const top = y(Math.max(0, v)), base = y(Math.min(0, v));
            const d = v >= 0 ? barra(x0 + j * (bw + 2), top, bw, base - top, "arriba") : `M${x0 + j * (bw + 2)},${top}h${bw}v${base - top}h${-bw}Z`;
            return <path key={s.nombre} d={d} fill={s.color} tabIndex={0} className="outline-none hover:opacity-80 focus:opacity-80"
              onPointerMove={e => mostrar(e, <><p className="mb-1 font-medium text-slate-700">{c.etiqueta}{c.detalle ? ` · ${c.detalle}` : ""}</p>{series.map(z => <Fila key={z.nombre} color={z.color} etiqueta={z.nombre} valor={formatear(z.valores[i] ?? 0, formato)} />)}</>, ref.current)}
              onFocus={e => mostrar(e, <Fila color={s.color} etiqueta={`${c.etiqueta} · ${s.nombre}`} valor={formatear(v, formato)} />, ref.current)}
              onPointerLeave={ocultar} onBlur={ocultar} />;
          })}
          {series.length === 1 && grupo > 0 && <text x={x0 + grupo / 2} y={y(Math.max(0, series[0].valores[i] ?? 0)) - 5} textAnchor="middle" fontSize="10" fill={TINTA_2}>{corto(series[0].valores[i] ?? 0, formato)}</text>}
          <text x={m.l + banda * i + banda / 2} y={alto - 22} textAnchor="middle" fontSize="11" fill={TINTA_2}>{c.etiqueta.length > maxLetras ? `${c.etiqueta.slice(0, maxLetras - 1)}…` : c.etiqueta}</text>
          {c.detalle && <text x={m.l + banda * i + banda / 2} y={alto - 8} textAnchor="middle" fontSize="10" fill={TINTA_3}>{c.detalle.length > maxLetras ? `${c.detalle.slice(0, maxLetras - 1)}…` : c.detalle}</text>}
        </g>;
      })}
      <line x1={m.l} x2={m.l + w} y1={y(0)} y2={y(0)} stroke="#d6d3d1" />
    </svg>}
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}

// ---------------------------------------------------------------------------
// Barras horizontales (ranking): valor en la punta, o "piruleta" (lollipop).
// ---------------------------------------------------------------------------
export function Barras({ datos, formato, estilo = "barras", color = MARCA }: { datos: { clave: string; etiqueta: string; detalle?: string; valor: number; extra?: string }[]; formato: Formato; estilo?: "barras" | "piruleta"; color?: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const fila = 30, etiquetaW = Math.min(180, Math.max(110, ancho * 0.36)), valorW = 76;
  const w = Math.max(0, ancho - etiquetaW - valorW - 8);
  const max = Math.max(1e-9, ...datos.map(d => Math.abs(d.valor)));
  const alto = datos.length * fila;
  const letras = Math.floor((etiquetaW - 12) / 7);
  return <div ref={ref} className="relative">
    {ancho > 0 && <svg width={ancho} height={alto} role="img" aria-label="Ranking">
      {datos.map((d, i) => {
        const yy = i * fila;
        const largo = (Math.max(0, d.valor) / max) * w;
        const x0 = etiquetaW;
        return <g key={d.clave} tabIndex={0} className="outline-none [&:hover_.marca]:opacity-80 [&:focus_.marca]:opacity-80"
          onPointerMove={e => mostrar(e, <><p className="mb-1 font-medium text-slate-700">{d.etiqueta}</p><Fila color={color} etiqueta={d.detalle ?? ""} valor={formatear(d.valor, formato)} />{d.extra && <p className="mt-1 text-slate-500">{d.extra}</p>}</>, ref.current)}
          onFocus={e => mostrar(e, <Fila color={color} etiqueta={d.etiqueta} valor={formatear(d.valor, formato)} />, ref.current)}
          onPointerLeave={ocultar} onBlur={ocultar}>
          <rect x={0} y={yy} width={ancho} height={fila} fill="transparent" />
          <text x={0} y={yy + fila / 2 + 4} fontSize="12" fill={TINTA}><title>{d.etiqueta}</title>{d.etiqueta.length > letras ? `${d.etiqueta.slice(0, letras - 1)}…` : d.etiqueta}</text>
          <line x1={x0} x2={x0 + w} y1={yy + fila / 2} y2={yy + fila / 2} stroke={estilo === "piruleta" ? GRILLA : "transparent"} />
          {estilo === "barras"
            ? <path className="marca" d={barra(x0, yy + (fila - 16) / 2, Math.max(2, largo), 16, "derecha")} fill={color} />
            : <><line className="marca" x1={x0} x2={x0 + largo} y1={yy + fila / 2} y2={yy + fila / 2} stroke={color} strokeWidth="2" /><circle className="marca" cx={x0 + largo} cy={yy + fila / 2} r="5" fill={color} stroke={FONDO} strokeWidth="2" /></>}
          <text x={x0 + largo + 8} y={yy + fila / 2 + 4} fontSize="11" fontWeight="600" fill={TINTA_2}>{corto(d.valor, formato)}</text>
        </g>;
      })}
    </svg>}
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}

// ---------------------------------------------------------------------------
// Treemap: área proporcional al valor. Un solo tono (las categorías no son
// series fijas), separadas por 2px de fondo y con la etiqueta adentro si entra.
// ---------------------------------------------------------------------------
type Caja = { x: number; y: number; w: number; h: number };
function partir<T extends { valor: number }>(items: T[], c: Caja, salida: (T & Caja)[]) {
  if (!items.length) return;
  if (items.length === 1) { salida.push({ ...items[0], ...c }); return; }
  const total = items.reduce((a, d) => a + d.valor, 0);
  let acum = 0, corte = 0;
  while (corte < items.length - 1 && acum + items[corte].valor <= total / 2) acum += items[corte++].valor;
  if (corte === 0) acum = items[corte++].valor;
  const frac = total ? acum / total : 0.5;
  if (c.w >= c.h) {
    partir(items.slice(0, corte), { ...c, w: c.w * frac }, salida);
    partir(items.slice(corte), { ...c, x: c.x + c.w * frac, w: c.w * (1 - frac) }, salida);
  } else {
    partir(items.slice(0, corte), { ...c, h: c.h * frac }, salida);
    partir(items.slice(corte), { ...c, y: c.y + c.h * frac, h: c.h * (1 - frac) }, salida);
  }
}
export function Treemap({ datos, formato }: { datos: { clave: string; etiqueta: string; valor: number; extra?: string }[]; formato: Formato }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const alto = 260;
  const items = datos.filter(d => d.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = items.reduce((a, d) => a + d.valor, 0);
  const cajas: ((typeof items)[number] & Caja)[] = [];
  if (ancho > 0) partir(items, { x: 0, y: 0, w: ancho, h: alto }, cajas);
  const max = items[0]?.valor ?? 1;
  return <div ref={ref} className="relative">
    {ancho > 0 && <svg width={ancho} height={alto} role="img" aria-label="Treemap">
      {cajas.map(c => {
        const w = Math.max(0, c.w - 2), h = Math.max(0, c.h - 2);
        // Un solo tono: más claro cuanto más chico, para que se lea el tamaño.
        const tono = 0.45 + 0.55 * (c.valor / max);
        const entra = w > 70 && h > 34;
        return <g key={c.clave} tabIndex={0} className="outline-none [&:hover_rect]:opacity-85 [&:focus_rect]:opacity-85"
          onPointerMove={e => mostrar(e, <><p className="mb-1 font-medium text-slate-700">{c.etiqueta}</p><Fila color={MARCA} etiqueta={formatear((c.valor / total) * 100, "porcentaje")} valor={formatear(c.valor, formato)} />{c.extra && <p className="mt-1 text-slate-500">{c.extra}</p>}</>, ref.current)}
          onFocus={e => mostrar(e, <Fila color={MARCA} etiqueta={c.etiqueta} valor={formatear(c.valor, formato)} />, ref.current)}
          onPointerLeave={ocultar} onBlur={ocultar}>
          <rect x={c.x + 1} y={c.y + 1} width={w} height={h} rx="4" fill={MARCA} fillOpacity={tono} />
          {entra && <>
            <text x={c.x + 9} y={c.y + 19} fontSize="12" fontWeight="600" fill="#fff">{c.etiqueta.length > w / 7.2 ? `${c.etiqueta.slice(0, Math.floor(w / 7.2) - 1)}…` : c.etiqueta}</text>
            {h > 48 && <text x={c.x + 9} y={c.y + 36} fontSize="11" fill="#fff" opacity="0.9">{corto(c.valor, formato)} · {formatear((c.valor / total) * 100, "porcentaje")}</text>}
          </>}
        </g>;
      })}
    </svg>}
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}

// ---------------------------------------------------------------------------
// Dispersión volumen vs. margen: x = unidades (log si el rango es amplio),
// y = margen %, tamaño = facturación. Guías en las medianas: abajo a la derecha
// están los productos que se venden mucho con poco margen (revisar precio).
// ---------------------------------------------------------------------------
export function Dispersion({ datos }: { datos: { clave: string; etiqueta: string; unidades: number; margen: number; ingreso: number; ganancia: number; unidad: string }[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const [activo, setActivo] = useState<string | null>(null);
  const alto = 300, m = { t: 14, r: 16, b: 38, l: 52 };
  const w = Math.max(0, ancho - m.l - m.r), h = alto - m.t - m.b;
  const pts = datos.filter(d => d.unidades > 0);
  const xmin = Math.min(...pts.map(d => d.unidades)), xmax = Math.max(...pts.map(d => d.unidades));
  const log = pts.length > 1 && xmax / Math.max(xmin, 1e-9) > 30;
  const fx = log ? (v: number) => Math.log10(v) : (v: number) => v;
  const ex = log ? { lo: Math.floor(Math.log10(Math.max(xmin, 1e-9))), hi: Math.ceil(Math.log10(xmax)) } : escala(xmax);
  if (ex.hi === ex.lo) ex.hi = ex.lo + 1;
  const ticksX = log ? Array.from({ length: ex.hi - ex.lo + 1 }, (_, i) => 10 ** (ex.lo + i)) : (ex as ReturnType<typeof escala>).ticks;
  const ey = escala(Math.max(10, ...pts.map(d => d.margen)), Math.min(0, ...pts.map(d => d.margen)));
  const x = (v: number) => m.l + ((fx(v) - ex.lo) / (ex.hi - ex.lo)) * w;
  const y = (v: number) => m.t + h - ((v - ey.lo) / (ey.hi - ey.lo)) * h;
  const maxIng = Math.max(1, ...pts.map(d => d.ingreso));
  const mediana = (vals: number[]) => { const s = [...vals].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const mx = mediana(pts.map(d => d.unidades)), my = mediana(pts.map(d => d.margen));
  return <div ref={ref} className="relative">
    {ancho > 0 && pts.length > 0 && <svg width={ancho} height={alto} role="img" aria-label="Volumen contra margen">
      {ey.ticks.map(t => <g key={t}><line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke={GRILLA} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TINTA_3}>{t}%</text></g>)}
      {ticksX.map(t => <text key={t} x={x(t)} y={m.t + h + 16} textAnchor="middle" fontSize="11" fill={TINTA_3}>{corto(t, "numero")}</text>)}
      <text x={m.l + w} y={alto - 4} textAnchor="end" fontSize="11" fill={TINTA_2}>Unidades vendidas{log ? " (escala logarítmica)" : ""} →</text>
      <line x1={x(mx)} x2={x(mx)} y1={m.t} y2={m.t + h} stroke="#d6d3d1" />
      <line x1={m.l} x2={m.l + w} y1={y(my)} y2={y(my)} stroke="#d6d3d1" />
      <text x={m.l + w - 4} y={m.t + 12} textAnchor="end" fontSize="11" fill={TINTA_2}>Estrellas: mucho volumen, buen margen</text>
      <text x={m.l + w - 4} y={m.t + h - 6} textAnchor="end" fontSize="11" fill={TINTA_2}>Revisar precio: mucho volumen, poco margen</text>
      <text x={m.l + 6} y={m.t + 12} fontSize="11" fill={TINTA_2}>Buen margen, poca salida</text>
      {[...pts].sort((a, b) => b.ingreso - a.ingreso).map(d => {
        const rr = 4 + Math.sqrt(d.ingreso / maxIng) * 12;
        const on = activo === d.clave;
        const contenido = <><p className="mb-1 font-medium text-slate-700">{d.etiqueta}</p><Fila etiqueta="de margen" valor={formatear(d.margen, "porcentaje")} /><Fila etiqueta={d.unidad === "kg" ? "kg vendidos" : "unidades"} valor={formatear(d.unidades, "numero")} /><Fila etiqueta="facturado" valor={money(d.ingreso)} /><Fila etiqueta="de ganancia" valor={money(d.ganancia)} /></>;
        return <g key={d.clave} tabIndex={0} className="outline-none"
          onPointerMove={e => { setActivo(d.clave); mostrar(e, contenido, ref.current); }} onPointerLeave={() => { setActivo(null); ocultar(); }}
          onFocus={e => { setActivo(d.clave); mostrar(e, contenido, ref.current); }} onBlur={() => { setActivo(null); ocultar(); }}>
          <circle cx={x(d.unidades)} cy={y(d.margen)} r={Math.max(rr, 12)} fill="transparent" />
          <circle cx={x(d.unidades)} cy={y(d.margen)} r={rr} fill={on ? "#ff711f" : SERIES[0]} fillOpacity={on ? 1 : 0.55} stroke={FONDO} strokeWidth="2" />
        </g>;
      })}
    </svg>}
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}

// ---------------------------------------------------------------------------
// Mapa de calor día de la semana × hora (rampa secuencial de un solo tono).
// ---------------------------------------------------------------------------
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export function MapaHorarios({ celdas, formato }: { celdas: { dia: number; hora: number; valor: number }[]; formato: Formato }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { tip, mostrar, ocultar } = useTip();
  const conDatos = celdas.filter(c => c.valor > 0);
  const hMin = conDatos.length ? Math.min(...conDatos.map(c => c.hora)) : 8;
  const hMax = conDatos.length ? Math.max(...conDatos.map(c => c.hora)) : 20;
  const horas = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const mapa = new Map(celdas.map(c => [`${(c.dia + 6) % 7}-${c.hora}`, c.valor]));
  const max = Math.max(1e-9, ...celdas.map(c => c.valor));
  const l = 40, t = 18;
  const cw = Math.max(8, (ancho - l) / Math.max(1, horas.length)), ch = 26;
  const paso = (v: number) => (v <= 0 ? 0 : 1 + Math.min(RAMPA.length - 2, Math.floor((v / max) * (RAMPA.length - 1))));
  return <div ref={ref} className="relative">
    {ancho > 0 && <svg width={ancho} height={t + 7 * ch + 4} role="img" aria-label="Ventas por día y hora">
      {horas.map((hh, i) => (horas.length <= 14 || i % 2 === 0) && <text key={hh} x={l + i * cw + cw / 2} y={12} textAnchor="middle" fontSize="10" fill={TINTA_3}>{hh}h</text>)}
      {DIAS.map((d, fi) => <g key={d}>
        <text x={l - 8} y={t + fi * ch + ch / 2 + 4} textAnchor="end" fontSize="11" fill={TINTA_2}>{d}</text>
        {horas.map((hh, i) => {
          const v = mapa.get(`${fi}-${hh}`) ?? 0;
          return <rect key={hh} x={l + i * cw + 1} y={t + fi * ch + 1} width={Math.max(0, cw - 2)} height={ch - 2} rx="3" fill={RAMPA[paso(v)]} tabIndex={0} className="outline-none hover:stroke-[#1c1917] focus:stroke-[#1c1917]"
            onPointerMove={e => mostrar(e, <><p className="mb-1 font-medium text-slate-700">{d} de {hh} a {hh + 1} h</p><Fila etiqueta="" valor={formatear(v, formato)} /></>, ref.current)}
            onFocus={e => mostrar(e, <Fila etiqueta={`${d} ${hh} h`} valor={formatear(v, formato)} />, ref.current)}
            onPointerLeave={ocultar} onBlur={ocultar} />;
        })}
      </g>)}
    </svg>}
    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><span>Menos</span>{RAMPA.slice(1).map(c => <span key={c} className="h-2.5 w-5 rounded-sm" style={{ background: c }} />)}<span>Más ({corto(max, formato)})</span></div>
    <Tooltip tip={tip} ancho={ancho} />
  </div>;
}
