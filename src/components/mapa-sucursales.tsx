"use client";

// Mapa isométrico del Panel de sucursal: cada local es un edificio sobre una
// manzana con calle. Se mueve arrastrando (o con las flechas), se acerca con la
// rueda o pellizcando, y al tocar un edificio se abre su configuración.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, LocateFixed, Route, Move, Check } from "lucide-react";
import type { cajas, sucursales } from "@/db/schema";
import { InteriorLocal, type EstadoCaja } from "@/components/mapa-interior";
import { iso, pts, clamp, tono, caja, Bloque, frenteQuad, TextoFrente, Linea, corto, type Punto } from "@/components/mapa-iso";

type Local = typeof sucursales.$inferSelect;
type Caja = typeof cajas.$inferSelect;

const POR_FILA = 4; // terrenos por cuadra
const ANCHO_TERRENO = 4; // 3 de edificio + 1 de separación
const ALTO_CUADRA = 8; // 3 terreno + 1 vereda + 2 calle + 1 vereda + 1 pasto

type Tipo = "deposito" | "mixto" | "venta" | "mayorista";
const tipoDe = (l: Local): Tipo => l.esDeposito ? (l.esPuntoVenta || l.esMayorista ? "mixto" : "deposito") : l.esMayorista && !l.esPuntoVenta ? "mayorista" : "venta";
const ETIQUETA: Record<Tipo, string> = { deposito: "Depósito", mixto: "Depósito y venta", venta: "Punto de venta", mayorista: "Mayorista" };
const TOLDO: Record<Tipo, [string, string]> = { deposito: ["#ff711f", "#fff1e8"], mixto: ["#ff711f", "#fff1e8"], venta: ["#ff711f", "#fff1e8"], mayorista: ["#0f766e", "#ecfdf5"] };

/** Toldo a rayas sobre el frente, entre u0 y u1 (fracción del ancho). */
function Toldo({ x, y, w, altura, u0, u1, colores }: { x: number; y: number; w: number; altura: number; u0: number; u1: number; colores: [string, string] }) {
  const n = 6;
  return <>{Array.from({ length: n }, (_, i) => {
    const a = x + w * (u0 + ((u1 - u0) * i) / n);
    const b = x + w * (u0 + ((u1 - u0) * (i + 1)) / n);
    return <polygon key={i} points={pts([iso(a, y, altura), iso(b, y, altura), iso(b, y + 0.45, altura - 9), iso(a, y + 0.45, altura - 9)])} fill={colores[i % 2]} stroke={tono(colores[0], 0.8)} strokeWidth={0.4} />;
  })}</>;
}

/** Galpón de chapa a dos aguas con andén de carga. */
function Deposito({ x, y, conTienda }: { x: number; y: number; conTienda: boolean }) {
  const w = 3, d = 2.7, h = 36, r = 20, y0 = y + 0.15, ym = y0 + d / 2, yf = y0 + d;
  const c = caja(x, y0, w, d, h);
  const chapa = "#b9c6d6";
  const portones: [number, number][] = conTienda ? [[0.06, 0.4]] : [[0.08, 0.44], [0.56, 0.92]];
  return <>
    <polygon points={pts([iso(x, y0, h), iso(x + w, y0, h), iso(x + w, ym, h + r), iso(x, ym, h + r)])} fill="#6b7f96" />
    <polygon points={pts(c.lado)} fill={tono(chapa, 0.76)} />
    {Array.from({ length: 10 }, (_, i) => <Linea key={`l${i}`} a={iso(x + w, y0 + (d * (i + 1)) / 11, 0)} b={iso(x + w, y0 + (d * (i + 1)) / 11, h)} color={tono(chapa, 0.66)} ancho={0.7} />)}
    <polygon points={pts([iso(x + w, y0, h), iso(x + w, yf, h), iso(x + w, ym, h + r)])} fill={tono(chapa, 0.7)} />
    <polygon points={pts([iso(x + w, ym - 0.22, h + 7), iso(x + w, ym + 0.22, h + 7), iso(x + w, ym + 0.22, h + 12), iso(x + w, ym - 0.22, h + 12)])} fill="#475569" />
    <polygon points={pts(c.frente)} fill={tono(chapa, 0.95)} />
    {Array.from({ length: 13 }, (_, i) => <Linea key={`f${i}`} a={iso(x + (w * (i + 1)) / 14, yf, 0)} b={iso(x + (w * (i + 1)) / 14, yf, h)} color={tono(chapa, 0.8)} ancho={0.7} />)}
    <polygon points={pts(frenteQuad(x, yf, w, h, 0.05, 0.95, 0.72, 0.94))} fill="#003f31" />
    <TextoFrente x={x + w / 2} y={yf} z={h * 0.83} texto="DEPÓSITO" size={8.5} color="#ffffff" />
    <Bloque x={x + w * portones[0][0] - 0.05} y={yf} w={w * (portones[portones.length - 1][1] - portones[0][0]) + 0.1} d={0.32} h={5} color="#9ca3af" />
    {portones.map(([u0, u1], i) => <g key={i}>
      <polygon points={pts(frenteQuad(x, yf, w, h, u0, u1, 0.14, 0.62))} fill="#64748b" stroke="#334155" strokeWidth={0.8} />
      {[0.24, 0.34, 0.44, 0.54].map(v => <Linea key={v} a={iso(x + w * u0, yf, h * v)} b={iso(x + w * u1, yf, h * v)} color="#475569" ancho={0.7} />)}
      <polygon points={pts(frenteQuad(x, yf + 0.33, w, h, u0 + 0.02, u0 + 0.06, 0.02, 0.14))} fill="#facc15" />
      <polygon points={pts(frenteQuad(x, yf + 0.33, w, h, u1 - 0.06, u1 - 0.02, 0.02, 0.14))} fill="#facc15" />
    </g>)}
    {conTienda && <>
      <polygon points={pts(frenteQuad(x, yf, w, h, 0.52, 0.94, 0, 0.5))} fill="#bae6fd" stroke="#f8fafc" strokeWidth={1.2} />
      <Linea a={iso(x + w * 0.73, yf, 0)} b={iso(x + w * 0.73, yf, h * 0.5)} color="#f8fafc" ancho={1} />
      <Toldo x={x} y={yf} w={w} altura={h * 0.62} u0={0.5} u1={0.96} colores={TOLDO.mixto} />
    </>}
    <polygon points={pts([iso(x, ym, h + r), iso(x + w, ym, h + r), iso(x + w, yf, h), iso(x, yf, h)])} fill="#8ea2b8" />
    {Array.from({ length: 11 }, (_, i) => <Linea key={`t${i}`} a={iso(x + (w * (i + 1)) / 12, ym, h + r)} b={iso(x + (w * (i + 1)) / 12, yf, h)} color="#7a8fa6" ancho={0.8} />)}
    {[0.55, 1.95].map(u => <polygon key={u} points={pts([iso(x + u, ym + 0.25, h + r * 0.82), iso(x + u + 0.5, ym + 0.25, h + r * 0.82), iso(x + u + 0.5, ym + 0.9, h + r * 0.34), iso(x + u, ym + 0.9, h + r * 0.34)])} fill="#dbeafe" opacity={0.9} />)}
    <Linea a={iso(x, ym, h + r)} b={iso(x + w, ym, h + r)} color="#5b6f86" ancho={2} />
    <Bloque x={x + 2.42} y={yf + 0.02} w={0.5} d={0.42} h={5} color="#c08a4a" />
    <Bloque x={x + 2.42} y={yf + 0.02} w={0.5} d={0.42} h={6} z={5} color="#d6a66a" />
  </>;
}

/** Local a la calle: vidrieras, puerta, toldo a rayas y marquesina con el nombre. */
function Tienda({ x, y, nombre }: { x: number; y: number; nombre: string }) {
  const w = 2.3, d = 1.9, h = 28, x0 = x + 0.35, y0 = y + 0.85, yf = y0 + d;
  const pared = "#f3dfc6";
  const parapeto = caja(x0, y0, w, d, 3, h);
  return <>
    <Bloque x={x0} y={y0} w={w} d={d} h={h} color={pared} techo="#e9d2b4" />
    <polygon points={pts(parapeto.frente)} fill={tono(pared, 0.85)} />
    <polygon points={pts(parapeto.lado)} fill={tono(pared, 0.7)} />
    <Bloque x={x0 + 1.3} y={y0 + 0.4} w={0.55} d={0.45} h={6} z={h} color="#e2e8f0" />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.05, 0.4, 0.06, 0.56))} fill="#bfe6fb" stroke="#7c4a1e" strokeWidth={1.2} />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.6, 0.95, 0.06, 0.56))} fill="#bfe6fb" stroke="#7c4a1e" strokeWidth={1.2} />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.08, 0.2, 0.36, 0.5))} fill="#ffffff" opacity={0.55} />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.44, 0.56, 0, 0.58))} fill="#7c4a1e" />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.46, 0.54, 0.05, 0.52))} fill="#bfe6fb" />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.03, 0.97, 0.73, 0.97))} fill="#ff711f" />
    <TextoFrente x={x0 + w / 2} y={yf} z={h * 0.85} texto={corto(nombre.toUpperCase(), 15)} size={6.8} color="#ffffff" />
    <Toldo x={x0} y={yf} w={w} altura={h * 0.7} u0={0.01} u1={0.99} colores={TOLDO.venta} />
    <polygon points={pts([iso(x0 + 0.1, yf + 0.55, 0), iso(x0 + 0.35, yf + 0.55, 0), iso(x0 + 0.35, yf + 0.45, 11), iso(x0 + 0.1, yf + 0.45, 11)])} fill="#1f2937" stroke="#8b5a2b" strokeWidth={1} />
    <Bloque x={x0 + w - 0.3} y={yf + 0.25} w={0.28} d={0.28} h={5} color="#b45309" />
    <circle cx={iso(x0 + w - 0.16, yf + 0.39, 9)[0]} cy={iso(x0 + w - 0.16, yf + 0.39, 9)[1]} r={5} fill="#4d9a5b" />
  </>;
}

/** Local mayorista: caja grande, marquesina plana y cajas apiladas. */
function Mayorista({ x, y }: { x: number; y: number }) {
  const w = 2.8, d = 2.3, h = 34, x0 = x + 0.1, y0 = y + 0.45, yf = y0 + d;
  return <>
    <Bloque x={x0} y={y0} w={w} d={d} h={h} color="#eef2f6" techo="#cbd5e1" />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0, 1, 0.72, 0.94))} fill="#0f766e" />
    <polygon points={pts([iso(x0 + w, y0, h * 0.72), iso(x0 + w, yf, h * 0.72), iso(x0 + w, yf, h * 0.94), iso(x0 + w, y0, h * 0.94)])} fill="#0b5f58" />
    <TextoFrente x={x0 + w / 2} y={yf} z={h * 0.83} texto="MAYORISTA" size={8.5} color="#ffffff" />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.3, 0.7, 0, 0.5))} fill="#a5f3fc" stroke="#0f766e" strokeWidth={1.4} />
    <Linea a={iso(x0 + w * 0.5, yf, 0)} b={iso(x0 + w * 0.5, yf, h * 0.5)} color="#0f766e" ancho={1.2} />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.06, 0.24, 0.2, 0.5))} fill="#cffafe" stroke="#94a3b8" strokeWidth={0.8} />
    <polygon points={pts(frenteQuad(x0, yf, w, h, 0.76, 0.94, 0.2, 0.5))} fill="#cffafe" stroke="#94a3b8" strokeWidth={0.8} />
    <polygon points={pts([iso(x0 + w * 0.24, yf, h * 0.58), iso(x0 + w * 0.76, yf, h * 0.58), iso(x0 + w * 0.76, yf + 0.5, h * 0.58), iso(x0 + w * 0.24, yf + 0.5, h * 0.58)])} fill="#14b8a6" stroke="#0f766e" strokeWidth={0.8} />
    <Bloque x={x0 + 0.4} y={y0 + 0.4} w={0.55} d={0.45} h={6} z={h} color="#e2e8f0" />
    <Bloque x={x0 + 1.6} y={y0 + 0.5} w={0.55} d={0.45} h={6} z={h} color="#e2e8f0" />
    <Bloque x={x0 + 0.1} y={yf + 0.15} w={0.42} d={0.4} h={7} color="#c08a4a" />
    <Bloque x={x0 + 0.1} y={yf + 0.15} w={0.42} d={0.4} h={7} z={7} color="#d6a66a" />
    <Bloque x={x0 + 0.56} y={yf + 0.2} w={0.36} d={0.34} h={6} color="#c08a4a" />
  </>;
}

function Edificio({ local, x, y }: { local: Local; x: number; y: number }) {
  const tipo = tipoDe(local);
  if (tipo === "deposito" || tipo === "mixto") return <Deposito x={x} y={y} conTienda={tipo === "mixto"} />;
  if (tipo === "mayorista") return <Mayorista x={x} y={y} />;
  return <Tienda x={x} y={y} nombre={local.nombre} />;
}

function Arbol({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const [bx, by] = iso(x, y);
  return <g>
    <ellipse cx={bx} cy={by} rx={9 * s} ry={4 * s} fill="rgb(0 63 49 / .15)" />
    <rect x={bx - 1.5} y={by - 12 * s} width={3} height={12 * s} fill="#8b5a2b" />
    <circle cx={bx} cy={by - 19 * s} r={10 * s} fill="#4d9a5b" />
    <circle cx={bx + 3 * s} cy={by - 22 * s} r={6 * s} fill="#6cbf70" />
  </g>;
}
function Farol({ x, y }: { x: number; y: number }) {
  const [bx, by] = iso(x, y);
  return <g>
    <rect x={bx - 1} y={by - 30} width={2} height={30} fill="#334155" />
    <rect x={bx - 1} y={by - 31} width={9} height={2} fill="#334155" />
    <circle cx={bx + 8} cy={by - 28} r={2.6} fill="#fde68a" />
  </g>;
}

function Camion({ desde, hasta, dur }: { desde: Punto; hasta: Punto; dur: number }) {
  const c = caja(-0.55, -0.3, 1.1, 0.6, 14);
  const cab = caja(0.55, -0.3, 0.35, 0.6, 10);
  return <g>
    <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={`M${desde[0]},${desde[1]} L${hasta[0]},${hasta[1]}`} />
    <polygon points={pts(cab.lado)} fill="#c94d09" /><polygon points={pts(cab.frente)} fill="#e85b0d" /><polygon points={pts(cab.techo)} fill="#ff9a5b" />
    <polygon points={pts(c.lado)} fill="#cbd5e1" /><polygon points={pts(c.frente)} fill="#f1f5f9" /><polygon points={pts(c.techo)} fill="#ffffff" />
    <polygon points={pts([iso(-0.4, 0.3, 4), iso(0.4, 0.3, 4), iso(0.4, 0.3, 10), iso(-0.4, 0.3, 10)])} fill="#003f31" />
  </g>;
}

type Lote = { local: Local | null; x: number; y: number; fila: number };

const MANTENER_MS = 2000;

/**
 * Botón de mantener apretado: el mapa queda quieto hasta que se sostiene 2 s,
 * así no se roba el scroll de la página ni en celulares ni con la rueda.
 */
function BotonMantener({ onCompletar }: { onCompletar: () => void }) {
  const [activo, setActivo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const C = 2 * Math.PI * 11;
  const iniciar = () => {
    if (timer.current) return;
    setActivo(true);
    timer.current = setTimeout(() => { timer.current = null; setActivo(false); onCompletar(); }, MANTENER_MS);
  };
  const cancelar = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setActivo(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <button
    type="button"
    aria-label="Mantené apretado 2 segundos para moverte por el mapa"
    onPointerDown={e => {
      e.stopPropagation();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* el puntero ya no está activo */ }
      iniciar();
    }}
    onPointerUp={cancelar}
    onPointerCancel={cancelar}
    onLostPointerCapture={cancelar}
    onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); iniciar(); } }}
    onKeyUp={e => { if (e.key === " " || e.key === "Enter") cancelar(); }}
    onBlur={cancelar}
    onContextMenu={e => e.preventDefault()}
    style={{ WebkitTouchCallout: "none" }}
    className={`inline-flex touch-none select-none items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-semibold shadow-md transition ${activo ? "scale-[1.04] bg-navy text-white" : "bg-white/95 text-navy hover:bg-white"}`}
  >
    <span className="relative grid h-8 w-8 place-items-center">
      <svg viewBox="0 0 28 28" className="absolute inset-0 h-8 w-8 -rotate-90" aria-hidden>
        <circle cx={14} cy={14} r={11} fill="none" stroke={activo ? "rgb(255 255 255 / .25)" : "#e2e8f0"} strokeWidth={3} />
        <circle cx={14} cy={14} r={11} fill="none" stroke="#ff711f" strokeWidth={3} strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={activo ? 0 : C} style={{ transition: activo ? `stroke-dashoffset ${MANTENER_MS}ms linear` : "stroke-dashoffset .2s ease-out" }} />
      </svg>
      <Move className="h-3.5 w-3.5" aria-hidden />
    </span>
    {activo ? "Seguí apretando…" : "Mantené para explorar"}
  </button>;
}

const vende = (l: Local) => l.esPuntoVenta || l.esMayorista;
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

export function MapaSucursales({ locales, cajas, estados, seleccion, onSeleccionar, onNuevo, creando, ocupadoCajas, errorCajas, onCambiarCajas, onIrACaja }: {
  locales: Local[]; cajas: Caja[]; estados: EstadoCaja[]; seleccion: number | null; onSeleccionar: (id: number) => void; onNuevo: () => void; creando: boolean;
  ocupadoCajas: boolean; errorCajas: string; onCambiarCajas: (localId: number, cantidad: number) => void; onIrACaja: (localId: number, cajaId: number) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState({ x: 0, y: 0, k: 1 });
  const [listo, setListo] = useState(false);
  const [rutas, setRutas] = useState(true);
  const [movimiento, setMovimiento] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [navegando, setNavegando] = useState(false);
  const navegandoRef = useRef(false);
  navegandoRef.current = navegando;
  const tarjeta = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movido: boolean } | null>(null);
  const punteros = useRef(new Map<number, Punto>());
  const pellizco = useRef<{ dist: number; k: number; cx: number; cy: number; vx: number; vy: number } | null>(null);
  const movio = useRef(false);
  // Interior del local: primero se acerca la cámara al edificio y después aparece el mercadito.
  const [interiorId, setInteriorId] = useState<number | null>(null);
  const [interiorVisible, setInteriorVisible] = useState(false);
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const animacion = useRef(0);
  const transicion = useRef(false);

  const lotes = useMemo<Lote[]>(() => [...locales, null].map((local, i) => {
    const fila = Math.floor(i / POR_FILA);
    return { local, fila, x: 1 + (i % POR_FILA) * ANCHO_TERRENO, y: fila * ALTO_CUADRA };
  }), [locales]);
  const filas = Math.ceil(lotes.length / POR_FILA);
  const W = 2 + Math.min(lotes.length, POR_FILA) * ANCHO_TERRENO;
  const H = filas * ALTO_CUADRA + 1;
  const cajasPorLocal = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of cajas) if (c.activa) m.set(c.sucursalId, (m.get(c.sucursalId) ?? 0) + 1);
    return m;
  }, [cajas]);
  const centro = (l: Lote): Punto => iso(l.x + 1.5, l.y + 1.6, tipoDe(l.local!) === "venta" ? 44 : tipoDe(l.local!) === "mayorista" ? 50 : 60);

  const limites = useMemo(() => {
    const esquinas = [iso(0, 0), iso(W, 0), iso(W, H), iso(0, H)];
    const xs = esquinas.map(p => p[0]), ys = esquinas.map(p => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys) - 110, maxY: Math.max(...ys) + 24 };
  }, [W, H]);

  const objetivoEncuadre = useCallback(() => {
    const el = contenedor.current;
    if (!el) return null;
    const { width, height } = el.getBoundingClientRect();
    const k = clamp(Math.min((width - 48) / (limites.maxX - limites.minX), (height - 48) / (limites.maxY - limites.minY)), 0.35, 1.6);
    return { k, x: width / 2 - ((limites.minX + limites.maxX) / 2) * k, y: height / 2 - ((limites.minY + limites.maxY) / 2) * k };
  }, [limites]);
  const encuadrar = useCallback(() => {
    if (transicion.current) return;
    const destino = objetivoEncuadre();
    if (!destino) return;
    setVista(destino);
    setListo(true);
  }, [objetivoEncuadre]);

  /** Mueve la cámara suavemente: interpola el punto central del mundo y el zoom (en escala logarítmica). */
  const animarA = useCallback((destino: { x: number; y: number; k: number }, ms: number) => new Promise<void>(resolver => {
    cancelAnimationFrame(animacion.current);
    const el = contenedor.current;
    if (!el || ms <= 0) { setVista(destino); resolver(); return; }
    const { width, height } = el.getBoundingClientRect();
    const desde = vistaRef.current;
    const c0 = [(width / 2 - desde.x) / desde.k, (height / 2 - desde.y) / desde.k];
    const c1 = [(width / 2 - destino.x) / destino.k, (height / 2 - destino.y) / destino.k];
    const suave = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / ms), e = suave(t);
      const k = desde.k * Math.pow(destino.k / desde.k, e);
      const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      setVista({ k, x: width / 2 - cx * k, y: height / 2 - cy * k });
      if (t < 1) animacion.current = requestAnimationFrame(paso); else resolver();
    };
    animacion.current = requestAnimationFrame(paso);
  }), []);
  useEffect(() => () => cancelAnimationFrame(animacion.current), []);

  useEffect(() => {
    encuadrar();
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(() => encuadrar());
    ro.observe(el);
    return () => ro.disconnect();
  }, [encuadrar]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMovimiento(!m.matches);
    const cambio = () => setMovimiento(!m.matches);
    m.addEventListener("change", cambio);
    return () => m.removeEventListener("change", cambio);
  }, []);

  const zoomEn = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = contenedor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    setVista(v => {
      const k = clamp(v.k * factor, 0.35, 3);
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  // La rueda necesita un listener no pasivo para que la página no se desplace.
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      if (!navegandoRef.current) return; // bloqueado: la rueda desplaza la página
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomEn(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [zoomEn]);

  // Al salir de navegación se cierra con "Listo", Esc o tocando fuera del mapa.
  useEffect(() => {
    if (!navegando) return;
    contenedor.current?.focus({ preventScroll: true });
    const fuera = (e: PointerEvent) => { if (!tarjeta.current?.contains(e.target as Node)) setNavegando(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [navegando]);

  function abajo(e: React.PointerEvent) {
    movio.current = false;
    if (!navegando) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const r = contenedor.current!.getBoundingClientRect();
      pellizco.current = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), k: vista.k, cx: (a[0] + b[0]) / 2 - r.left, cy: (a[1] + b[1]) / 2 - r.top, vx: vista.x, vy: vista.y };
      arrastre.current = null;
    } else {
      arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movido: false };
    }
  }
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      if (!punteros.current.has(e.pointerId)) return;
      punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
      const p = pellizco.current;
      if (p && punteros.current.size >= 2) {
        const [a, b] = [...punteros.current.values()];
        const k = clamp(p.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / p.dist, 0.35, 3);
        movio.current = true;
        setVista({ k, x: p.cx - (p.cx - p.vx) * (k / p.k), y: p.cy - (p.cy - p.vy) * (k / p.k) });
        return;
      }
      const d = arrastre.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.movido && Math.hypot(dx, dy) < 5) return;
      d.movido = true;
      movio.current = true;
      setVista(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    };
    const soltar = (e: PointerEvent) => {
      punteros.current.delete(e.pointerId);
      if (punteros.current.size < 2) pellizco.current = null;
      if (punteros.current.size === 0) arrastre.current = null;
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, []);

  function teclado(e: React.KeyboardEvent) {
    if (interiorId !== null) { if (e.key === "Escape") { e.preventDefault(); salir(); } return; }
    if (!navegando) return;
    if (e.key === "Escape") { e.preventDefault(); setNavegando(false); return; }
    const paso = 48;
    const mov: Record<string, [number, number]> = { ArrowLeft: [paso, 0], ArrowRight: [-paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mov[e.key]) { e.preventDefault(); setVista(v => ({ ...v, x: v.x + mov[e.key][0], y: v.y + mov[e.key][1] })); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomEn(1.2); }
    else if (e.key === "-") { e.preventDefault(); zoomEn(1 / 1.2); }
    else if (e.key === "0") { e.preventDefault(); encuadrar(); }
  }
  const activar = (accion: () => void) => ({
    onClick: () => { if (!movio.current) accion(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); accion(); } },
  });

  async function entrar(l: Lote) {
    const el = contenedor.current;
    if (!el || !l.local || transicion.current) return;
    transicion.current = true;
    setNavegando(false);
    const { width, height } = el.getBoundingClientRect();
    const [cx, cy] = iso(l.x + 1.5, l.y + 1.6, 20);
    const k = 2.8;
    await animarA({ k, x: width / 2 - cx * k, y: height / 2 - cy * k }, movimiento ? 700 : 0);
    setInteriorId(l.local.id);
    requestAnimationFrame(() => setInteriorVisible(true));
    transicion.current = false;
  }
  async function salir() {
    if (transicion.current) return;
    transicion.current = true;
    setInteriorVisible(false);
    await esperar(movimiento ? 320 : 0);
    setInteriorId(null);
    const destino = objetivoEncuadre();
    if (destino) await animarA(destino, movimiento ? 650 : 0);
    transicion.current = false;
    contenedor.current?.focus({ preventScroll: true });
  }
  const interiorLocal = interiorId !== null ? locales.find(l => l.id === interiorId) ?? null : null;
  // Si el local deja de existir o de vender mientras está abierto, volvemos a la calle.
  useEffect(() => {
    if (interiorId !== null && (!interiorLocal || !vende(interiorLocal))) { setInteriorVisible(false); setInteriorId(null); encuadrar(); }
  }, [interiorId, interiorLocal, encuadrar]);

  const porId = new Map(lotes.filter(l => l.local).map(l => [l.local!.id, l]));
  const rutasAbastecimiento = lotes.flatMap(l => {
    const dep = l.local?.depositoId ? porId.get(l.local.depositoId) : undefined;
    if (!l.local || !dep || dep.local!.id === l.local.id) return [];
    const a = centro(dep), b = centro(l);
    const medio: Punto = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 70 - Math.abs(a[0] - b[0]) * 0.12];
    return [{ id: l.local.id, d: `M${a[0]},${a[1]} Q${medio[0]},${medio[1]} ${b[0]},${b[1]}`, activa: seleccion === l.local.id || seleccion === dep.local!.id }];
  });

  const fondo = caja(0, 0, W, H, 14, -14);

  return <div ref={tarjeta} className={`card relative overflow-hidden transition-shadow ${navegando ? "ring-2 ring-lime ring-offset-2" : ""}`}>
    <style>{`
      .mapa-edificio { transition: transform .18s ease, filter .18s ease; cursor: pointer; outline: none; }
      .mapa-edificio:hover, .mapa-edificio:focus-visible { transform: translateY(-4px); filter: brightness(1.04) drop-shadow(0 6px 6px rgb(0 63 49 / .18)); }
      .mapa-ruta { stroke-dasharray: 7 7; }
      .mapa-anim .mapa-ruta { animation: mapa-ruta 1.1s linear infinite; }
      .mapa-anim .mapa-pulso { animation: mapa-pulso 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes mapa-ruta { to { stroke-dashoffset: -14; } }
      @keyframes mapa-pulso { 50% { opacity: .35; } }
    `}</style>
    <div
      ref={contenedor}
      tabIndex={0}
      role="application"
      aria-label={navegando
        ? "Mapa de sucursales en modo navegación. Flechas para moverte, más y menos para acercar, 0 para centrar, Escape para salir."
        : "Mapa de sucursales. Tocá un local para configurarlo; mantené apretado el botón Explorar para moverte por el mapa."}
      onKeyDown={teclado}
      onPointerDown={abajo}
      className={`relative h-[380px] select-none bg-gradient-to-b from-[#e8f3ee] to-[#fbf4ec] outline-none focus-visible:ring-2 focus-visible:ring-lime sm:h-[500px] ${navegando ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"}`}
    >
      <svg aria-hidden={interiorId !== null} className={`h-full w-full transition-opacity duration-300 ${listo && !interiorVisible ? "opacity-100" : "opacity-0"} ${movimiento ? "mapa-anim" : ""}`} role="presentation">
        <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.k})`}>
          {/* Isla de pasto */}
          <polygon points={pts(fondo.lado)} fill="#8a6a46" />
          <polygon points={pts(fondo.frente)} fill="#a07c52" />
          <polygon points={pts(fondo.techo)} fill="#bfe3b4" />
          {Array.from({ length: filas }, (_, f) => {
            const base = f * ALTO_CUADRA;
            return <g key={`calle-${f}`}>
              <polygon points={pts([iso(0, base + 3.1), iso(W, base + 3.1), iso(W, base + 4), iso(0, base + 4)])} fill="#e7e1d6" />
              <polygon points={pts([iso(0, base + 4), iso(W, base + 4), iso(W, base + 6), iso(0, base + 6)])} fill="#55606e" />
              <line x1={iso(0, base + 5)[0]} y1={iso(0, base + 5)[1]} x2={iso(W, base + 5)[0]} y2={iso(W, base + 5)[1]} stroke="#f8fafc" strokeWidth={2} strokeDasharray="14 12" />
              <polygon points={pts([iso(0, base + 6), iso(W, base + 6), iso(W, base + 6.9), iso(0, base + 6.9)])} fill="#e7e1d6" />
              {[0.6, 0.85, 1.1, 1.35].map(t => <polygon key={t} points={pts([iso(t, base + 4.1), iso(t + 0.14, base + 4.1), iso(t + 0.14, base + 5.9), iso(t, base + 5.9)])} fill="#f8fafc" />)}
            </g>;
          })}
          {/* Edificios y decoración, de atrás hacia adelante */}
          {Array.from({ length: filas }, (_, f) => {
            const base = f * ALTO_CUADRA;
            const deFila = lotes.filter(l => l.fila === f);
            return <g key={`fila-${f}`}>
              {deFila.map(l => {
                if (!l.local) {
                  const [sx, sy] = iso(l.x + 1.5, l.y + 1.6);
                  return <g key="nuevo" role="button" tabIndex={0} aria-label="Agregar una sucursal nueva" className="mapa-edificio" {...activar(onNuevo)}>
                    <polygon points={pts([iso(l.x + 0.2, l.y + 0.4), iso(l.x + 2.8, l.y + 0.4), iso(l.x + 2.8, l.y + 2.9), iso(l.x + 0.2, l.y + 2.9)])} fill={creando ? "rgb(255 113 31 / .18)" : "rgb(255 255 255 / .35)"} stroke={creando ? "#ff711f" : "#7aa384"} strokeWidth={2} strokeDasharray="6 5" />
                    <rect x={sx - 1.5} y={sy - 26} width={3} height={26} fill="#8b5a2b" />
                    <rect x={sx - 22} y={sy - 44} width={44} height={20} rx={4} fill="#ffffff" stroke="#ff711f" strokeWidth={1.5} />
                    <text x={sx} y={sy - 30} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ff711f">+</text>
                  </g>;
                }
                const sel = seleccion === l.local.id;
                return <g key={l.local.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={`${l.local.nombre}: ${ETIQUETA[tipoDe(l.local)]}`} className="mapa-edificio"
                  onPointerEnter={() => setHover(l.local!.id)} onPointerLeave={() => setHover(h => h === l.local!.id ? null : h)} onFocus={() => setHover(l.local!.id)} onBlur={() => setHover(null)}
                  {...activar(() => { onSeleccionar(l.local!.id); if (vende(l.local!)) void entrar(l); })}>
                  <polygon points={pts([iso(l.x - 0.05, l.y + 0.05), iso(l.x + 3.05, l.y + 0.05), iso(l.x + 3.05, l.y + 3.05), iso(l.x - 0.05, l.y + 3.05)])} fill={sel ? "rgb(255 113 31 / .22)" : "#a9d79c"} stroke={sel ? "#ff711f" : "none"} strokeWidth={2.5} className={sel ? "mapa-pulso" : undefined} />
                  <Edificio local={l.local} x={l.x} y={l.y} />
                </g>;
              })}
              {Array.from({ length: Math.min(lotes.length - f * POR_FILA, POR_FILA) + 1 }, (_, i) => <Farol key={`farol-${i}`} x={0.5 + i * ANCHO_TERRENO} y={base + 3.5} />)}
              {movimiento && <Camion desde={iso(-0.5, base + 5.5)} hasta={iso(W + 0.5, base + 5.5)} dur={9 + W * 0.6} />}
              {Array.from({ length: Math.min(lotes.length - f * POR_FILA, POR_FILA) * 2 }, (_, i) => <Arbol key={`arbol-${i}`} x={1.3 + i * (ANCHO_TERRENO / 2)} y={base + 6.5} s={i % 3 === 1 ? 0.85 : 1} />)}
            </g>;
          })}
          {rutas && rutasAbastecimiento.map(r => <path key={r.id} d={r.d} fill="none" stroke={r.activa ? "#ff711f" : "#003f31"} strokeOpacity={r.activa ? 1 : 0.45} strokeWidth={r.activa ? 3 : 2} strokeLinecap="round" className="mapa-ruta" pointerEvents="none" />)}
          {/* Carteles con el nombre, siempre arriba */}
          {lotes.map(l => {
            if (!l.local) return null;
            const [cx, cy] = centro(l);
            const destacado = seleccion === l.local.id || hover === l.local.id;
            const nombre = l.local.nombre.length > 22 ? `${l.local.nombre.slice(0, 21)}…` : l.local.nombre;
            const n = cajasPorLocal.get(l.local.id) ?? 0;
            const detalle = `${ETIQUETA[tipoDe(l.local)]}${n ? ` · ${n} caja${n === 1 ? "" : "s"}` : ""}`;
            const ancho = Math.max(nombre.length * 7.4, detalle.length * 5.6) + 22;
            return <g key={`cartel-${l.local.id}`} pointerEvents="none" transform={`translate(${cx} ${cy - 18})`}>
              <rect x={-ancho / 2} y={-34} width={ancho} height={34} rx={9} fill={destacado ? "#003f31" : "rgb(255 255 255 / .94)"} stroke={destacado ? "#003f31" : "#d7e3dc"} />
              <path d="M-6 0 L0 7 L6 0 Z" fill={destacado ? "#003f31" : "rgb(255 255 255 / .94)"} />
              <text y={-19} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={destacado ? "#ffffff" : "#003f31"}>{nombre}</text>
              <text y={-6} textAnchor="middle" fontSize={9.5} fill={destacado ? "#ffb07d" : "#64748b"}>{detalle}</text>
            </g>;
          })}
        </g>
      </svg>

      {interiorId === null && <>
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-1.5 text-[11px] font-medium text-navy sm:max-w-[calc(100%-11rem)]">
        <span className="rounded-full bg-white/90 px-2.5 py-1 shadow-sm"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-400" />Depósito</span>
        <span className="rounded-full bg-white/90 px-2.5 py-1 shadow-sm"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-lime" />Punto de venta</span>
        <span className="rounded-full bg-white/90 px-2.5 py-1 shadow-sm"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-teal-700" />Mayorista</span>
      </div>
      <div className="absolute right-3 top-3">
        <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => setRutas(r => !r)} aria-pressed={rutas} aria-label="Rutas de abastecimiento" title="Rutas de abastecimiento"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold shadow-sm transition sm:px-3 ${rutas ? "bg-navy text-white" : "bg-white/90 text-navy"}`}>
          <Route className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Abastecimiento</span>
        </button>
      </div>
      <div className="absolute bottom-3 right-3 flex items-end gap-2" onPointerDown={e => e.stopPropagation()}>
        {navegando ? <>
          <button type="button" onClick={() => setNavegando(false)} className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:brightness-110">
            <Check className="h-3.5 w-3.5" /> Listo
          </button>
          <div className="flex flex-col overflow-hidden rounded-xl bg-white/95 shadow-sm">
            <button type="button" className="grid h-9 w-9 place-items-center text-navy hover:bg-slate-100" onClick={() => zoomEn(1.25)} aria-label="Acercar"><Plus className="h-4 w-4" /></button>
            <button type="button" className="grid h-9 w-9 place-items-center border-y border-slate-100 text-navy hover:bg-slate-100" onClick={() => zoomEn(1 / 1.25)} aria-label="Alejar"><Minus className="h-4 w-4" /></button>
            <button type="button" className="grid h-9 w-9 place-items-center text-navy hover:bg-slate-100" onClick={encuadrar} aria-label="Centrar el mapa"><LocateFixed className="h-4 w-4" /></button>
          </div>
        </> : <BotonMantener onCompletar={() => setNavegando(true)} />}
      </div>
      <p aria-live="polite" className={`pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-10rem)] rounded-full bg-white/85 px-3 py-1 text-[11px] text-slate-500 ${navegando ? "block" : "hidden sm:block"}`}>
        {navegando
          ? <><span className="sm:hidden">Arrastrá o pellizcá</span><span className="hidden sm:inline">Arrastrá para moverte · rueda para acercar · Esc para salir</span></>
          : "Tocá un local para configurarlo"}
      </p>
      </>}
      {interiorLocal && vende(interiorLocal) && <div className={`absolute inset-0 bg-gradient-to-b from-[#fbf4ec] to-[#efe6d8] transition-all duration-300 ease-out ${interiorVisible ? "scale-100 opacity-100" : "pointer-events-none scale-[1.06] opacity-0"}`}>
        <InteriorLocal key={interiorLocal.id} local={interiorLocal} cajas={cajas.filter(c => c.sucursalId === interiorLocal.id)} estados={estados}
          ocupado={ocupadoCajas} error={errorCajas} onVolver={() => void salir()}
          onCambiarCantidad={n => onCambiarCajas(interiorLocal.id, n)} onIrACaja={id => onIrACaja(interiorLocal.id, id)} />
      </div>}
    </div>
  </div>;
}
