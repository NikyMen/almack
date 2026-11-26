"use client";

// Interior de un local de ventas, con la misma estética del mapa: góndolas,
// heladeras y una fila de cajas registradoras con su estado. Desde acá se
// agregan o quitan cajas y se entra a operar cada una.

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import type { cajas, sucursales } from "@/db/schema";
import { iso, pts, caja, Bloque, frenteQuad, TextoFrente, Linea, corto, tono, type Punto } from "@/components/mapa-iso";

type Local = typeof sucursales.$inferSelect;
type Caja = typeof cajas.$inferSelect;

export type EstadoCaja = {
  cajaId: number;
  estado: "abierta" | "arqueo" | "traspaso" | "pendiente" | "cerrada";
  responsable: string | null;
  turnoId: number | null;
};

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

function Cajero({ x, y }: { x: number; y: number }) {
  const [px, py] = iso(x, y);
  return <g>
    <ellipse cx={px} cy={py} rx={9} ry={4} fill="rgb(0 63 49 / .18)" />
    <path d={`M${px - 8},${py - 2} Q${px - 8},${py - 26} ${px},${py - 26} Q${px + 8},${py - 26} ${px + 8},${py - 2} Z`} fill="#003f31" />
    <rect x={px - 3} y={py - 25} width={6} height={10} fill="#ff711f" />
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

export function InteriorLocal({ local, cajas, estados, ocupado, error, onVolver, onCambiarCantidad, onIrACaja }: {
  local: Local; cajas: Caja[]; estados: EstadoCaja[]; ocupado: boolean; error: string;
  onVolver: () => void; onCambiarCantidad: (cantidad: number) => void; onIrACaja: (cajaId: number) => void;
}) {
  const activas = useMemo(() => cajas.filter(c => c.activa).sort((a, b) => a.numero - b.numero), [cajas]);
  const [elegida, setElegida] = useState<number | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const estadoDe = (id: number) => estados.find(e => e.cajaId === id) ?? { cajaId: id, estado: "cerrada" as const, responsable: null, turnoId: null };
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

  return <div className="absolute inset-0 flex flex-col">
    <style>{`
      .interior-caja { cursor: pointer; transition: transform .18s ease, filter .18s ease; outline: none; }
      .interior-caja:hover, .interior-caja:focus-visible { transform: translateY(-3px); filter: drop-shadow(0 6px 6px rgb(0 63 49 / .2)); }
      @media (prefers-reduced-motion: no-preference) { .interior-luz { animation: interior-luz 1.8s ease-in-out infinite; } }
      @keyframes interior-luz { 50% { opacity: .45; } }
    `}</style>
    <div className="relative z-10 flex flex-wrap items-center gap-2 p-3">
      <button type="button" onClick={onVolver} className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-sm hover:bg-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a la calle
      </button>
      <div className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
        {local.nombre} · {activas.length} caja{activas.length === 1 ? "" : "s"} · {abiertas} en uso
      </div>
    </div>

    <svg className="min-h-0 w-full flex-1" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" role="presentation">
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
      {Array.from({ length: Math.max(1, Math.floor((W - 2.2) / 2.6)) }, (_, i) => <Gondola key={`a${i}`} x={1.6 + i * 2.6} y={1.0} w={2.1} semilla={i + 1} />)}
      {Array.from({ length: Math.max(1, Math.floor((W - 2.2) / 2.6)) }, (_, i) => <Gondola key={`b${i}`} x={1.6 + i * 2.6} y={2.5} w={2.1} semilla={i + 7} />)}
      {/* Cajas, de atrás hacia adelante */}
      {activas.map((c, i) => {
        const { x, y } = posicion(i);
        const e = estadoDe(c.id);
        const conCajero = e.estado === "abierta" || e.estado === "arqueo" || e.estado === "traspaso";
        return <g key={c.id} role="button" tabIndex={0} aria-label={`Caja ${c.numero}: ${ESTADO[e.estado].texto}${e.responsable ? `, responsable ${e.responsable}` : ""}`} aria-pressed={elegida === c.id}
          className="interior-caja" onClick={() => { setElegida(c.id); setConfirmarQuitar(false); }}
          onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setElegida(c.id); setConfirmarQuitar(false); } }}>
          {elegida === c.id && <polygon points={pts([iso(x - 0.2, y - 0.75), iso(x + 1.9, y - 0.75), iso(x + 1.9, y + 1.0), iso(x - 0.2, y + 1.0)])} fill="rgb(255 113 31 / .18)" stroke="#ff711f" strokeWidth={2} />}
          {conCajero && <Cajero x={x + 0.85} y={y - 0.35} />}
          <Mostrador x={x} y={y} estado={e.estado} activa={conCajero} />
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
    </svg>

    <div className="relative z-10 p-3 pt-0">
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-sm">{error}</p>}
      {cajaElegida ? (() => {
        const e = estadoDe(cajaElegida.id);
        const esUltima = ultima?.id === cajaElegida.id;
        return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white/95 px-4 py-3 text-sm shadow-md">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-navy">Caja {cajaElegida.numero}
              <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: ESTADO[e.estado].fondo, color: ESTADO[e.estado].tinta }}>{ESTADO[e.estado].texto}</span>
            </p>
            <p className="text-xs text-slate-500">{e.responsable ? `Responsable: ${e.responsable} · turno #${e.turnoId}` : "Sin turno abierto"}</p>
          </div>
          <button type="button" className="btn-primary min-h-9 py-1.5" onClick={() => onIrACaja(cajaElegida.id)}><ExternalLink className="h-4 w-4" /> Ir a la caja</button>
          {esUltima && activas.length > 1 && (e.estado === "cerrada"
            ? confirmarQuitar
              ? <button type="button" disabled={ocupado} className="btn min-h-9 bg-rose-600 py-1.5 font-semibold text-white hover:bg-rose-700" onClick={() => { onCambiarCantidad(activas.length - 1); setElegida(null); setConfirmarQuitar(false); }}><Trash2 className="h-4 w-4" /> Confirmar: quitar Caja {cajaElegida.numero}</button>
              : <button type="button" disabled={ocupado} className="btn-ghost min-h-9 border border-slate-200 py-1.5" onClick={() => setConfirmarQuitar(true)}><Trash2 className="h-4 w-4" /> Quitar caja</button>
            : <p className="text-xs text-slate-500">Cerrá y aprobá el turno para poder quitarla.</p>)}
          {!esUltima && <p className="text-xs text-slate-500">Solo se puede quitar la última caja (Caja {ultima?.numero}).</p>}
        </div>;
      })() : <p className="w-fit rounded-full bg-white/85 px-3 py-1 text-[11px] text-slate-500">Tocá una caja para ver su estado{puedeAgregar ? " o el lugar libre para agregar otra" : ""} · Esc para volver</p>}
    </div>
    {!puedeAgregar && <span className="sr-only">Este local ya tiene el máximo de {MAX_CAJAS} cajas.</span>}
  </div>;
}
