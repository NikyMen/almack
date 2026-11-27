"use client";

// Interior de un local de ventas, con la misma estética del mapa: góndolas,
// heladeras y una fila de cajas registradoras con su estado. Desde acá se
// agregan o quitan cajas y se entra a operar cada una.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Minus, Plus, LocateFixed, Settings2, Trash2, X, Clock, Receipt, User, ChevronRight } from "lucide-react";
import { money } from "@/lib/format";
import { TarjetaFlotante } from "@/components/tarjeta-flotante";
import type { cajas, sucursales } from "@/db/schema";
import { iso, pts, caja, clamp, Bloque, frenteQuad, TextoFrente, Linea, corto, tono, Persona, type Punto } from "@/components/mapa-iso";

type Local = typeof sucursales.$inferSelect;
type Caja = typeof cajas.$inferSelect;

export type EstadoCaja = {
  cajaId: number;
  estado: "abierta" | "arqueo" | "traspaso" | "pendiente" | "cerrada";
  responsable: string | null;
  turnoId: number | null;
  /** Momento de la última venta de la caja (ms), mirando los últimos 30 días. */
  ultimaVenta: number | null;
  /** Total vendido en el turno vivo; null si la caja está cerrada. */
  ventasTurno: number | null;
  ticketsTurno: number;
};

/** "hace 3 min", "hace 2 h 10 min", "hace 4 días". */
export function hace(ms: number) {
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}
const fechaHora = (ms: number) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ms);

/** Movimiento reciente de un local, calculado en el servidor. */
export type Actividad = {
  sucursalId: number;
  /** Ventas en el local durante las últimas 5 horas. */
  ultimas5h: number;
  /** Ventas seguidas, con menos de 5 minutos entre una y otra, hasta ahora. */
  racha: number;
};
/** Desde esta racha el local se ve lleno y se forma fila en la vereda. */
export const LLENO = 3;
/** Personas esperando afuera según la racha. */
export const filaAfuera = (racha: number) => racha >= LLENO ? Math.min(racha - LLENO + 2, 7) : 0;

const ESTADO: Record<EstadoCaja["estado"], { texto: string; luz: string; fondo: string; tinta: string }> = {
  abierta: { texto: "Abierta", luz: "#22c55e", fondo: "#dcfce7", tinta: "#166534" },
  arqueo: { texto: "Contando para cerrar", luz: "#f59e0b", fondo: "#fef3c7", tinta: "#92400e" },
  traspaso: { texto: "En traspaso", luz: "#f59e0b", fondo: "#fef3c7", tinta: "#92400e" },
  pendiente: { texto: "Cierre pendiente", luz: "#f97316", fondo: "#ffedd5", tinta: "#9a3412" },
  cerrada: { texto: "Cerrada", luz: "#94a3b8", fondo: "#f1f5f9", tinta: "#475569" },
};

const MAX_CAJAS = 20;
const POR_FILA = 5;
const ALTO_PARED = 74;
const PRODUCTOS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#eab308", "#6366f1"];

/** Cuadrilátero sobre una cara lateral (x = xs), que mira hacia +x. */
function ladoQuad(xs: number, y: number, d: number, h: number, u0: number, u1: number, v0: number, v1: number): Punto[] {
  return [iso(xs, y + d * u0, h * v0), iso(xs, y + d * u1, h * v0), iso(xs, y + d * u1, h * v1), iso(xs, y + d * u0, h * v1)];
}

function Gondola({ x, y, w, semilla }: { x: number; y: number; w: number; semilla: number }) {
  const d = 0.65, h = 30, yf = y + d;
  const filas = [0.08, 0.38, 0.68];
  return <>
    <Bloque x={x} y={y} w={w} d={d} h={h} color="#e2e8f0" techo="#f8fafc" />
    {filas.map((v, f) => <g key={f}>
      <polygon points={pts(frenteQuad(x, yf, w, h, 0.02, 0.98, v + 0.24, v + 0.27))} fill="#94a3b8" />
      {Array.from({ length: Math.round(w * 5) }, (_, i) => {
        const u0 = 0.04 + (i * 0.92) / Math.round(w * 5), u1 = u0 + 0.92 / Math.round(w * 5) - 0.02;
        const alto = 0.13 + ((semilla * 7 + i * 3 + f * 5) % 4) * 0.025;
        return <polygon key={i} points={pts(frenteQuad(x, yf, w, h, u0, u1, v + 0.24 - alto, v + 0.24))} fill={PRODUCTOS[(semilla * 3 + i * 7 + f * 11) % PRODUCTOS.length]} />;
      })}
    </g>)}
  </>;
}

function Heladera({ y, d }: { y: number; d: number }) {
  const w = 0.75, h = 54, xs = w;
  const puertas = Math.max(1, Math.round(d / 1.1));
  return <>
    <Bloque x={0} y={y} w={w} d={d} h={h} color="#f1f5f9" techo="#e2e8f0" />
    <polygon points={pts(ladoQuad(xs, y, d, h, 0.02, 0.98, 0.86, 0.97))} fill="#0f766e" />
    {Array.from({ length: puertas }, (_, i) => {
      const u0 = 0.04 + (i * 0.92) / puertas, u1 = u0 + 0.92 / puertas - 0.03;
      return <g key={i}>
        <polygon points={pts(ladoQuad(xs, y, d, h, u0, u1, 0.06, 0.82))} fill="#cffafe" stroke="#94a3b8" strokeWidth={0.8} />
        {[0.24, 0.44, 0.64].map((v, f) => <g key={f}>
          <polygon points={pts(ladoQuad(xs, y, d, h, u0 + 0.01, u1 - 0.01, v, v + 0.012))} fill="#94a3b8" />
          {[0, 1, 2].map(k => { const a = u0 + 0.02 + k * (u1 - u0 - 0.04) / 3; return <polygon key={k} points={pts(ladoQuad(xs, y, d, h, a, a + (u1 - u0 - 0.04) / 3 - 0.01, v + 0.012, v + 0.1))} fill={PRODUCTOS[(i * 5 + f * 3 + k) % PRODUCTOS.length]} opacity={0.85} />; })}
        </g>)}
      </g>;
    })}
  </>;
}

/** Persona en la caja; si está cobrando mueve el brazo como pasando productos. */
function Cajero({ x, y, cobrando }: { x: number; y: number; cobrando: boolean }) {
  const [px, py] = iso(x, y);
  return <g>
    <ellipse cx={px} cy={py} rx={9} ry={4} fill="rgb(0 63 49 / .18)" />
    <path d={`M${px - 8},${py - 2} Q${px - 8},${py - 26} ${px},${py - 26} Q${px + 8},${py - 26} ${px + 8},${py - 2} Z`} fill="#003f31" />
    <rect x={px - 3} y={py - 25} width={6} height={10} fill="#ff711f" />
    <g className={cobrando ? "interior-brazo" : undefined}>
      <rect x={px + 5.5} y={py - 23} width={3.6} height={13} rx={1.8} fill="#003f31" />
      <circle cx={px + 7.3} cy={py - 9.5} r={2.4} fill="#f2c9a5" />
    </g>
    <circle cx={px} cy={py - 33} r={7} fill="#f2c9a5" />
    <path d={`M${px - 7},${py - 35} Q${px},${py - 44} ${px + 7},${py - 35} Z`} fill="#5b3a29" />
  </g>;
}

function Mostrador({ x, y, estado, activa }: { x: number; y: number; estado: EstadoCaja["estado"]; activa: boolean }) {
  const w = 1.7, d = 0.7, h = 15;
  const color = activa ? "#f8fafc" : "#e2e8f0";
  const e = ESTADO[estado];
  const poste = iso(x + w - 0.1, y + 0.08, h);
  return <>
    <Bloque x={x} y={y} w={w} d={d} h={h} color={color} techo="#cbd5e1" />
    <polygon points={pts(frenteQuad(x, y + d, w, h, 0, 1, 0.82, 1))} fill="#ff711f" />
    <polygon points={pts([iso(x + 0.08, y + 0.12, h + 0.5), iso(x + 1.15, y + 0.12, h + 0.5), iso(x + 1.15, y + d - 0.12, h + 0.5), iso(x + 0.08, y + d - 0.12, h + 0.5)])} fill="#334155" />
    {[0.3, 0.55, 0.8].map(t => <Linea key={t} a={iso(x + t, y + 0.12, h + 0.5)} b={iso(x + t, y + d - 0.12, h + 0.5)} color="#475569" ancho={0.8} />)}
    <Bloque x={x + 1.22} y={y + 0.12} w={0.42} d={0.42} h={6} z={h} color="#1f2937" />
    <polygon points={pts(caja(x + 1.27, y + 0.18, 0.32, 0.05, 9, h + 6).frente)} fill={estado === "cerrada" ? "#0f172a" : e.luz} opacity={estado === "cerrada" ? 1 : 0.8} />
    <Linea a={poste} b={[poste[0], poste[1] - 28]} color="#64748b" ancho={2} />
    <circle cx={poste[0]} cy={poste[1] - 31} r={5.5} fill={e.luz} stroke="#ffffff" strokeWidth={1.5} className={estado === "abierta" ? "interior-luz" : undefined} />
  </>;
}

export function InteriorLocal({ local, cajas, estados, actividad, ocupado, error, onVolver, onCambiarCantidad, onIrACaja, onMasDetalles }: {
  local: Local; cajas: Caja[]; estados: EstadoCaja[]; actividad: Actividad | null; ocupado: boolean; error: string;
  onVolver: () => void; onCambiarCantidad: (cantidad: number) => void; onIrACaja: (cajaId: number) => void; onMasDetalles: () => void;
}) {
  const activas = useMemo(() => cajas.filter(c => c.activa).sort((a, b) => a.numero - b.numero), [cajas]);
  const [elegida, setElegida] = useState<number | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const estadoDe = (id: number): EstadoCaja => estados.find(e => e.cajaId === id) ?? { cajaId: id, estado: "cerrada", responsable: null, turnoId: null, ultimaVenta: null, ventasTurno: null, ticketsTurno: 0 };
  // Primero una vista previa sobre la caja; "Más detalles" abre la tarjeta flotante.
  const [detalleCaja, setDetalleCaja] = useState<number | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const cerrarDetalleCaja = useCallback(() => setDetalleCaja(null), []);
  const mayorista = local.esMayorista && !local.esPuntoVenta;
  const acento = mayorista ? "#0f766e" : "#ff711f";
  const puedeAgregar = activas.length < MAX_CAJAS;
  const slots = activas.length + (puedeAgregar ? 1 : 0);
  const cols = Math.min(Math.max(slots, 3), POR_FILA);
  const filas = Math.ceil(slots / POR_FILA);
  const W = Math.max(9, 1.4 + cols * 2.35 + 0.6);
  const D = 5.6 + filas * 2.3;
  const posicion = (i: number) => ({ x: 1.4 + (i % POR_FILA) * 2.35, y: 4.6 + Math.floor(i / POR_FILA) * 2.3 });

  const minX = iso(0, D)[0] - 20, maxX = iso(W, 0)[0] + 20;
  const minY = iso(0, 0, ALTO_PARED)[1] - 20, maxY = iso(W, D)[1] + 24;
  const abiertas = activas.filter(c => estadoDe(c.id).estado !== "cerrada").length;
  const cajaElegida = activas.find(c => c.id === elegida) ?? null;
  const ultima = activas[activas.length - 1];

  // Clientes: uno frente a cada caja en uso mientras haya racha; con el local lleno
  // también recorren los pasillos y se forma fila en las cajas de adelante.
  const racha = actividad?.racha ?? 0;
  const lleno = racha >= LLENO;
  const filaFinal = Math.floor((activas.length - 1) / POR_FILA);
  const atendiendo = activas.map((c, i) => ({ i, c })).filter(({ c }) => estadoDe(c.id).estado === "abierta");
  const enCaja = new Map<number, number>(); // índice de caja → personas frente a ella
  atendiendo.slice(0, racha).forEach(({ i }) => enCaja.set(i, 1));
  if (lleno) for (const { i } of atendiendo) if (Math.floor(i / POR_FILA) === filaFinal) enCaja.set(i, 1 + Math.min(2, racha - LLENO + 1));
  const huecos = Math.max(1, Math.floor((W - 2.2) / 2.6));
  const compradores = lleno ? Math.min(racha + 2, 12) : Math.max(0, racha - atendiendo.length);
  // Lugares en los dos pasillos; primero uno por medio para que no se amontonen.
  const lugares = [0, 1].flatMap(f => Array.from({ length: huecos * 2 }, (_, k) => ({ f, k, x: 1.9 + k * 1.3 + (f ? 0.6 : 0), y: f ? 3.8 : 2.08 })))
    .filter(p => p.x < W - 0.6).sort((a, b) => (a.k % 2) - (b.k % 2) || a.k - b.k || a.f - b.f).slice(0, compradores);
  const enPasillo = [0, 1].map(f => lugares.filter(p => p.f === f).sort((a, b) => a.x - b.x));

  // Zoom y desplazamiento del interior (botones, Ctrl + rueda o pellizco).
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const vb = useMemo(() => ({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }), [minX, minY, maxX, maxY]);
  const limitar = useCallback((z: { k: number; x: number; y: number }) => {
    const k = clamp(z.k, 1, 3.5);
    return { k, x: clamp(z.x, vb.x + vb.w - k * (vb.x + vb.w), vb.x - k * vb.x), y: clamp(z.y, vb.y + vb.h - k * (vb.y + vb.h), vb.y - k * vb.y) };
  }, [vb]);
  const aSvg = (cx: number, cy: number): Punto | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const zoomEn = useCallback((f: number, p: Punto = [vb.x + vb.w / 2, vb.y + vb.h / 2]) =>
    setZoom(z => { const k = clamp(z.k * f, 1, 3.5); return limitar({ k, x: p[0] - (p[0] - z.x) * (k / z.k), y: p[1] - (p[1] - z.y) * (k / z.k) }); }), [vb, limitar]);
  const punteros = useRef(new Map<number, Punto>());
  const gesto = useRef<{ x: number; y: number; z: { k: number; x: number; y: number }; dist?: number; centro?: Punto } | null>(null);
  const movio = useRef(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Solo con Ctrl (o el pellizco del touchpad, que llega así) para no robar el scroll de la página.
    const rueda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const m = el.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      zoomEn(Math.exp(-clamp(e.deltaY, -60, 60) * 0.01), [p.x, p.y]);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [zoomEn]);
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const g = gesto.current, m = svgRef.current?.getScreenCTM();
      if (!punteros.current.has(e.pointerId) || !g || !m) return;
      punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (punteros.current.size >= 2 && g.dist && g.centro) {
        const [a, b] = [...punteros.current.values()];
        const k = clamp(g.z.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / g.dist, 1, 3.5);
        movio.current = true;
        setZoom(limitar({ k, x: g.centro[0] - (g.centro[0] - g.z.x) * (k / g.z.k), y: g.centro[1] - (g.centro[1] - g.z.y) * (k / g.z.k) }));
        return;
      }
      if (g.dist) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!movio.current && Math.hypot(dx, dy) < 5) return;
      movio.current = true;
      setZoom(limitar({ ...g.z, x: g.z.x + dx / m.a, y: g.z.y + dy / m.d }));
    };
    const soltar = (e: PointerEvent) => {
      punteros.current.delete(e.pointerId);
      if (punteros.current.size === 0) gesto.current = null;
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); window.removeEventListener("pointercancel", soltar); };
  }, [limitar]);
  function abajo(e: React.PointerEvent) {
    movio.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = { x: 0, y: 0, z: zoom, dist: Math.hypot(a[0] - b[0], a[1] - b[1]), centro: aSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) ?? undefined };
    } else if (zoom.k > 1) gesto.current = { x: e.clientX, y: e.clientY, z: zoom };
  }
  const elegir = (id: number) => { if (movio.current) return; setElegida(e => e === id ? null : id); setConfirmarQuitar(false); };

  // Posición de la vista previa: sobre el cartel de la caja elegida, dentro del interior.
  const previa = (() => {
    if (elegida === null) return null;
    const i = activas.findIndex(c => c.id === elegida);
    const m = svgRef.current?.getScreenCTM(), r = raiz.current?.getBoundingClientRect();
    if (i < 0 || !m || !r) return null;
    const { x, y } = posicion(i);
    const enPantalla = (q: Punto): Punto => {
      const p = new DOMPoint(zoom.x + zoom.k * q[0], zoom.y + zoom.k * q[1]).matrixTransform(m);
      return [p.x - r.left, p.y - r.top];
    };
    const medio = Math.min(150, (r.width - 24) / 2);
    const [ax, ay] = enPantalla(iso(x + 0.85, y + 0.35, 86));
    const left = clamp(ax, 12 + medio, r.width - 12 - medio);
    if (ay >= 180) return { left, top: Math.min(ay, r.height - 8), abajo: false };
    const [, by] = enPantalla(iso(x + 0.85, y + 1.2));
    return { left, top: clamp(by, 56, r.height - 180), abajo: true };
  })();

  return <div ref={raiz} className="absolute inset-0 flex flex-col">
    <style>{`
      .interior-caja { cursor: pointer; transition: transform .18s ease, filter .18s ease; outline: none; }
      .interior-caja:hover, .interior-caja:focus-visible { transform: translateY(-3px); filter: drop-shadow(0 6px 6px rgb(0 63 49 / .2)); }
      @media (prefers-reduced-motion: no-preference) { .interior-luz { animation: interior-luz 1.8s ease-in-out infinite; } }
      @keyframes interior-luz { 50% { opacity: .45; } }
      .interior-brazo { transform-box: fill-box; transform-origin: 50% 0; }
      @media (prefers-reduced-motion: no-preference) { .interior-brazo { animation: interior-brazo .7s ease-in-out infinite alternate; } }
      @keyframes interior-brazo { from { transform: rotate(10deg); } to { transform: rotate(-55deg); } }
    `}</style>
    <div className="relative z-10 flex flex-wrap items-center gap-2 p-3">
      <button type="button" onClick={onVolver} className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-sm hover:bg-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a la calle
      </button>
      <div className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
        {local.nombre} · {activas.length} caja{activas.length === 1 ? "" : "s"} · {abiertas} en uso
      </div>
      {lleno && <div className="rounded-full bg-[#ff711f] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Local lleno · {racha} ventas seguidas</div>}
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onMasDetalles} className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-sm hover:bg-white">
          <Settings2 className="h-3.5 w-3.5" /> Más detalles
        </button>
        <div className="flex overflow-hidden rounded-full bg-white/95 shadow-sm">
          <button type="button" className="grid h-8 w-8 place-items-center text-navy hover:bg-slate-100" onClick={() => zoomEn(1.3)} aria-label="Acercar"><Plus className="h-4 w-4" /></button>
          <button type="button" className="grid h-8 w-8 place-items-center border-x border-slate-100 text-navy hover:bg-slate-100 disabled:opacity-40" disabled={zoom.k <= 1} onClick={() => zoomEn(1 / 1.3)} aria-label="Alejar"><Minus className="h-4 w-4" /></button>
          <button type="button" className="grid h-8 w-8 place-items-center text-navy hover:bg-slate-100 disabled:opacity-40" disabled={zoom.k <= 1} onClick={() => setZoom({ k: 1, x: 0, y: 0 })} aria-label="Ver todo el local"><LocateFixed className="h-4 w-4" /></button>
        </div>
      </div>
    </div>

    <svg ref={svgRef} onPointerDown={abajo} style={{ touchAction: zoom.k > 1 ? "none" : "pan-y" }}
      className={`min-h-0 w-full flex-1 ${zoom.k > 1 ? "cursor-grab active:cursor-grabbing" : ""}`} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" role="presentation">
      <g transform={`translate(${zoom.x.toFixed(2)} ${zoom.y.toFixed(2)}) scale(${zoom.k.toFixed(3)})`}>
      {/* Piso de baldosas */}
      {Array.from({ length: Math.ceil(W) * Math.ceil(D) }, (_, i) => {
        const x = i % Math.ceil(W), y = Math.floor(i / Math.ceil(W));
        const x1 = Math.min(x + 1, W), y1 = Math.min(y + 1, D);
        return <polygon key={i} points={pts([iso(x, y), iso(x1, y), iso(x1, y1), iso(x, y1)])} fill={(x + y) % 2 ? "#efe6d8" : "#f8f3ea"} />;
      })}
      <polygon points={pts([iso(0, D), iso(W, D), iso(W, D, -8), iso(0, D, -8)])} fill="#c9b79c" />
      <polygon points={pts([iso(W, 0), iso(W, D), iso(W, D, -8), iso(W, 0, -8)])} fill="#b8a487" />
      {/* Paredes del fondo */}
      <polygon points={pts([iso(0, 0), iso(0, D), iso(0, D, ALTO_PARED), iso(0, 0, ALTO_PARED)])} fill={mayorista ? "#d7efe9" : "#f6e4cf"} />
      <polygon points={pts([iso(0, 0), iso(W, 0), iso(W, 0, ALTO_PARED), iso(0, 0, ALTO_PARED)])} fill={mayorista ? "#e6f6f2" : "#fbefe0"} />
      <polygon points={pts([iso(0, 0), iso(W, 0), iso(W, 0, 10), iso(0, 0, 10)])} fill={tono(acento, 0.9)} />
      <polygon points={pts([iso(0, 0), iso(0, D), iso(0, D, 10), iso(0, 0, 10)])} fill={tono(acento, 0.75)} />
      <Linea a={iso(0, D, ALTO_PARED)} b={iso(0, 0, ALTO_PARED)} color="#8a6a46" ancho={2} />
      <Linea a={iso(0, 0, ALTO_PARED)} b={iso(W, 0, ALTO_PARED)} color="#8a6a46" ancho={2} />
      {/* Cartel del local y ventanas */}
      <polygon points={pts(frenteQuad(W * 0.22, 0, W * 0.56, ALTO_PARED, 0, 1, 0.66, 0.9))} fill={acento} />
      <TextoFrente x={W / 2} y={0} z={ALTO_PARED * 0.78} texto={corto(local.nombre.toUpperCase(), 26)} size={11} color="#ffffff" />
      {[0.06, W - 1.7].map(x => <polygon key={x} points={pts(frenteQuad(x, 0, 1.4, ALTO_PARED, 0, 1, 0.3, 0.6))} fill="#cfeaf7" stroke="#ffffff" strokeWidth={2} />)}
      {/* Mercadería */}
      <Heladera y={0.4} d={Math.min(D - 3.6, 3.4)} />
      {Array.from({ length: huecos }, (_, i) => <Gondola key={`a${i}`} x={1.6 + i * 2.6} y={1.0} w={2.1} semilla={i + 1} />)}
      {enPasillo[0].map((p, k) => <Persona key={`p0-${k}`} x={p.x} y={p.y} s={0.95} semilla={local.id * 3 + k} canasta={k % 2 === 0} demora={k * 0.37} />)}
      {Array.from({ length: huecos }, (_, i) => <Gondola key={`b${i}`} x={1.6 + i * 2.6} y={2.5} w={2.1} semilla={i + 7} />)}
      {enPasillo[1].map((p, k) => <Persona key={`p1-${k}`} x={p.x} y={p.y} s={0.95} semilla={local.id * 5 + k + 4} canasta={k % 2 === 1} demora={k * 0.53} />)}
      {/* Cajas, de atrás hacia adelante */}
      {activas.map((c, i) => {
        const { x, y } = posicion(i);
        const e = estadoDe(c.id);
        const conCajero = e.estado === "abierta" || e.estado === "arqueo" || e.estado === "traspaso";
        return <g key={c.id} role="button" tabIndex={0} aria-label={`Caja ${c.numero}: ${ESTADO[e.estado].texto}${e.responsable ? `, responsable ${e.responsable}` : ""}`} aria-pressed={elegida === c.id}
          className="interior-caja" onClick={() => elegir(c.id)}
          onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setElegida(c.id); setConfirmarQuitar(false); } }}>
          {elegida === c.id && <polygon points={pts([iso(x - 0.2, y - 0.75), iso(x + 1.9, y - 0.75), iso(x + 1.9, y + 1.0), iso(x - 0.2, y + 1.0)])} fill="rgb(255 113 31 / .18)" stroke="#ff711f" strokeWidth={2} />}
          {conCajero && <Cajero x={x + 0.85} y={y - 0.35} cobrando={e.estado === "abierta"} />}
          <Mostrador x={x} y={y} estado={e.estado} activa={conCajero} />
          {Array.from({ length: enCaja.get(i) ?? 0 }, (_, k) => <Persona key={k} x={x + 0.75 - k * 0.08} y={y + 1.05 + k * 0.58} semilla={c.id * 7 + k} canasta={k === 0} demora={k * 0.41 + i * 0.2} />)}
        </g>;
      })}
      {puedeAgregar && (() => {
        const { x, y } = posicion(activas.length);
        const [sx, sy] = iso(x + 0.85, y + 0.35);
        return <g role="button" tabIndex={0} aria-label="Agregar una caja" className="interior-caja" onClick={() => !ocupado && onCambiarCantidad(activas.length + 1)}
          onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); if (!ocupado) onCambiarCantidad(activas.length + 1); } }}>
          <polygon points={pts([iso(x, y), iso(x + 1.7, y), iso(x + 1.7, y + 0.7), iso(x, y + 0.7)])} fill="rgb(255 255 255 / .6)" stroke={acento} strokeWidth={2} strokeDasharray="6 5" />
          <circle cx={sx} cy={sy - 14} r={11} fill="#ffffff" stroke={acento} strokeWidth={2} />
          <text x={sx} y={sy - 9.5} textAnchor="middle" fontSize={15} fontWeight={800} fill={acento}>{ocupado ? "…" : "+"}</text>
        </g>;
      })()}
      {/* Carteles de cada caja */}
      {activas.map((c, i) => {
        const { x, y } = posicion(i);
        const e = estadoDe(c.id);
        const [cx, cy] = iso(x + 0.85, y + 0.35, 52);
        const linea2 = e.responsable ? corto(e.responsable, 16) : ESTADO[e.estado].texto;
        const ancho = Math.max(64, linea2.length * 5.8 + 22);
        return <g key={`cartel-${c.id}`} pointerEvents="none" transform={`translate(${cx} ${cy})`}>
          <rect x={-ancho / 2} y={-30} width={ancho} height={30} rx={8} fill={elegida === c.id ? "#003f31" : "rgb(255 255 255 / .95)"} stroke={elegida === c.id ? "#003f31" : "#d7e3dc"} />
          <circle cx={-ancho / 2 + 10} cy={-19} r={3.5} fill={ESTADO[e.estado].luz} />
          <text x={-ancho / 2 + 18} y={-16} fontSize={11} fontWeight={800} fill={elegida === c.id ? "#ffffff" : "#003f31"}>Caja {c.numero}</text>
          <text x={-ancho / 2 + 10} y={-5} fontSize={9} fill={elegida === c.id ? "#ffb07d" : ESTADO[e.estado].tinta}>{linea2}</text>
        </g>;
      })}
      </g>
    </svg>

    <div className="relative z-10 p-3 pt-0">
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-sm">{error}</p>}
      {!cajaElegida && <p className="w-fit rounded-full bg-white/85 px-3 py-1 text-[11px] text-slate-500">Tocá una caja para ver su estado{puedeAgregar ? " o el lugar libre para agregar otra" : ""}<span className="hidden sm:inline"> · Ctrl + rueda para acercar · Esc para volver</span></p>}
    </div>
    {cajaElegida && previa && (() => {
      const e = estadoDe(cajaElegida.id);
      return <div role="dialog" aria-label={`Caja ${cajaElegida.numero}`} onPointerDown={ev => ev.stopPropagation()}
        className={`absolute z-20 w-[min(19rem,calc(100%-1.5rem))] -translate-x-1/2 ${previa.abajo ? "" : "-translate-y-full"} rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200`}
        style={{ left: previa.left, top: previa.top }}>
        <div className="flex items-start justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-navy">Caja {cajaElegida.numero}
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ESTADO[e.estado].fondo, color: ESTADO[e.estado].tinta }}>{ESTADO[e.estado].texto}</span>
          </p>
          <button type="button" onClick={() => setElegida(null)} className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700"><Clock className="h-3 w-3" />{e.ultimaVenta ? `Última venta ${hace(e.ultimaVenta)}` : "Sin ventas en 30 días"}</span>
          {e.ventasTurno !== null
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800"><Receipt className="h-3 w-3" />Ventas del turno {money(e.ventasTurno)}</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2.5 py-1 text-slate-600"><Receipt className="h-3 w-3" />Sin turno abierto</span>}
          {e.responsable && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700"><User className="h-3 w-3 shrink-0" /><span className="truncate">{e.responsable}</span></span>}
        </div>
        <button type="button" onClick={() => { setDetalleCaja(cajaElegida.id); setElegida(null); setConfirmarQuitar(false); }} className="btn-primary mt-3 min-h-9 w-full py-1.5 text-xs">Más detalles <ChevronRight className="h-3.5 w-3.5" /></button>
      </div>;
    })()}

    {detalleCaja !== null && (() => {
      const c = activas.find(x => x.id === detalleCaja);
      if (!c) return null;
      const e = estadoDe(c.id);
      const esUltima = ultima?.id === c.id;
      const promedio = e.ventasTurno !== null && e.ticketsTurno ? e.ventasTurno / e.ticketsTurno : null;
      const dato = (titulo: string, valor: string, nota?: string) => <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
        <p className="mt-1 text-xl font-bold text-navy">{valor}</p>
        {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
      </div>;
      return <TarjetaFlotante titulo={`Caja ${c.numero}`} subtitulo={local.nombre} ancho="max-w-xl" onCerrar={cerrarDetalleCaja}>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: ESTADO[e.estado].fondo, color: ESTADO[e.estado].tinta }}>{ESTADO[e.estado].texto}</span>
            <span className="text-slate-600">{e.responsable ? `Responsable: ${e.responsable} · turno #${e.turnoId}` : "Sin turno abierto"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {dato("Ventas del turno", e.ventasTurno !== null ? money(e.ventasTurno) : "—", e.ventasTurno !== null ? `${e.ticketsTurno} ticket${e.ticketsTurno === 1 ? "" : "s"}` : "Caja cerrada")}
            {dato("Ticket promedio", promedio !== null ? money(promedio) : "—")}
            {dato("Última venta", e.ultimaVenta ? hace(e.ultimaVenta) : "—", e.ultimaVenta ? fechaHora(e.ultimaVenta) : "Sin ventas en 30 días")}
          </div>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={ocupado} className="btn-primary" onClick={() => onIrACaja(c.id)}><ExternalLink className="h-4 w-4" /> Ir a la caja</button>
            {esUltima && activas.length > 1 && (e.estado === "cerrada"
              ? confirmarQuitar
                ? <button type="button" disabled={ocupado} className="btn bg-rose-600 font-semibold text-white hover:bg-rose-700" onClick={() => { onCambiarCantidad(activas.length - 1); setElegida(null); setDetalleCaja(null); setConfirmarQuitar(false); }}><Trash2 className="h-4 w-4" /> Confirmar: quitar Caja {c.numero}</button>
                : <button type="button" disabled={ocupado} className="btn-ghost border border-slate-200" onClick={() => setConfirmarQuitar(true)}><Trash2 className="h-4 w-4" /> Quitar caja</button>
              : <p className="text-xs text-slate-500">Cerrá y aprobá el turno para poder quitarla.</p>)}
            {!esUltima && <p className="text-xs text-slate-500">Solo se puede quitar la última caja (Caja {ultima?.numero}).</p>}
          </div>
        </div>
      </TarjetaFlotante>;
    })()}
    {!puedeAgregar && <span className="sr-only">Este local ya tiene el máximo de {MAX_CAJAS} cajas.</span>}
  </div>;
}
