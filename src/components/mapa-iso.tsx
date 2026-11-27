// Piezas de dibujo isométrico compartidas por el mapa de sucursales y el
// interior de cada local.

export type Punto = [number, number];

// Tile isométrico 2:1.
export const TW = 64;
export const TH = 32;

export const iso = (x: number, y: number, z = 0): Punto => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];
export const pts = (lista: Punto[]) => lista.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const corto = (t: string, n: number) => t.length > n ? `${t.slice(0, n - 1)}…` : t;

export function tono(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => clamp(Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)), 0, 255);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Caja isométrica: devuelve las tres caras visibles (frente izq., frente der., techo). */
export function caja(x: number, y: number, w: number, d: number, h: number, z = 0) {
  return {
    frente: [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)],
    lado: [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)],
    techo: [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)],
  };
}

export function Bloque({ x, y, w, d, h, z = 0, color, techo }: { x: number; y: number; w: number; d: number; h: number; z?: number; color: string; techo?: string }) {
  const c = caja(x, y, w, d, h, z);
  return <>
    <polygon points={pts(c.lado)} fill={tono(color, 0.78)} />
    <polygon points={pts(c.frente)} fill={tono(color, 0.92)} />
    <polygon points={pts(c.techo)} fill={techo ?? tono(color, 1.08)} />
  </>;
}

/** Cuadrilátero sobre la cara frontal (y = yf): u en ancho, v en alto (0..1). */
export function frenteQuad(x: number, yf: number, w: number, h: number, u0: number, u1: number, v0: number, v1: number): Punto[] {
  return [iso(x + w * u0, yf, h * v0), iso(x + w * u1, yf, h * v0), iso(x + w * u1, yf, h * v1), iso(x + w * u0, yf, h * v1)];
}

/** Texto "pintado" sobre una fachada frontal (plano x/z), centrado en (x, y, z). */
export function TextoFrente({ x, y, z, texto, size, color, peso = 800 }: { x: number; y: number; z: number; texto: string; size: number; color: string; peso?: number }) {
  const [px, py] = iso(x, y, z);
  return <text transform={`matrix(0.894 0.447 0 1 ${px.toFixed(1)} ${py.toFixed(1)})`} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight={peso} fill={color} letterSpacing={0.4}>{texto}</text>;
}

export function Linea({ a, b, color, ancho = 1 }: { a: Punto; b: Punto; color: string; ancho?: number }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={ancho} />;
}

const CAMISAS = ["#2563eb", "#db2777", "#16a34a", "#9333ea", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#0d9488", "#ea580c"];
const PELOS = ["#3b2a20", "#111827", "#7c4a1e", "#d6a66a", "#6b7280", "#5b3a29"];
const PIELES = ["#f2c9a5", "#e0ac82", "#c68b5e", "#8d5a3b", "#f5d6bd"];

/** Persona parada en (x, y); `semilla` elige ropa, pelo y piel. */
export function Persona({ x, y, s = 1, semilla, canasta = false, demora = 0 }: { x: number; y: number; s?: number; semilla: number; canasta?: boolean; demora?: number }) {
  const [px, py] = iso(x, y);
  const camisa = CAMISAS[semilla % CAMISAS.length];
  const pelo = PELOS[(semilla * 7 + 3) % PELOS.length];
  const piel = PIELES[(semilla * 5 + 1) % PIELES.length];
  return <g transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${s})`}>
    <ellipse cx={0} cy={0} rx={8} ry={3.5} fill="rgb(0 63 49 / .18)" />
    <g className="mapa-persona" style={{ animationDelay: `${-demora}s` }}>
      <rect x={-5} y={-13} width={4.2} height={13} rx={1.6} fill="#334155" />
      <rect x={0.8} y={-13} width={4.2} height={13} rx={1.6} fill="#1e293b" />
      <path d="M-7,-11 Q-7.5,-28 0,-28 Q7.5,-28 7,-11 Z" fill={camisa} />
      <circle cx={0} cy={-34} r={6.5} fill={piel} />
      <path d="M-6.8,-35 Q0,-44 6.8,-35 Z" fill={pelo} />
      {canasta && <g>
        <path d="M6,-20 L9,-13" stroke={piel} strokeWidth={2.2} strokeLinecap="round" />
        <path d="M5,-15 Q10,-22 15,-15" fill="none" stroke="#b91c1c" strokeWidth={1.3} />
        <path d="M4.5,-15 L15.5,-15 L14,-8 L6,-8 Z" fill="#ef4444" />
        <rect x={7} y={-18} width={3} height={3} fill="#facc15" />
        <rect x={10.5} y={-19} width={3} height={4} fill="#22c55e" />
      </g>}
    </g>
  </g>;
}

/** Rueda sobre la cara frontal (plano x/z), con centro en (x, yf, z) y radio r en píxeles. */
function Rueda({ x, yf, z, r }: { x: number; yf: number; z: number; r: number }) {
  const u = r / Math.hypot(TW / 2, TH / 2);
  const circulo = (k: number) => Array.from({ length: 14 }, (_, i) => {
    const t = (i / 14) * Math.PI * 2;
    return iso(x + Math.cos(t) * u * k, yf, z + Math.sin(t) * r * k);
  });
  return <>
    <polygon points={pts(circulo(1))} fill="#111827" />
    <polygon points={pts(circulo(0.45))} fill="#9ca3af" />
  </>;
}

/** Camión de reparto pequeño: furgón, cabina con parabrisas, ruedas y faros. Avanza hacia +x. */
export function Camioncito() {
  const y = -0.25, d = 0.5, yf = y + d, piso = 3;
  const carga = { x: -0.55, w: 0.75, h: 13 };
  const cab = { x: 0.2, w: 0.36, h: 10 };
  const xc = cab.x + cab.w;
  return <>
    <ellipse cx={iso(0, y + d / 2)[0]} cy={iso(0, y + d / 2)[1] + 2} rx={26} ry={8} fill="rgb(0 0 0 / .18)" />
    {/* Chasis */}
    <Bloque x={carga.x - 0.02} y={y + 0.04} w={xc - carga.x + 0.02} d={d - 0.08} h={2.5} z={piso - 2} color="#374151" />
    {/* Furgón */}
    <Bloque x={carga.x} y={y} w={carga.w} d={d} h={carga.h} z={piso} color="#f8fafc" techo="#ffffff" />
    <polygon points={pts(frenteQuad(carga.x, yf, carga.w, carga.h, 0.06, 0.94, 0.35, 0.62).map(([a, b]) => [a, b - piso] as Punto))} fill="#ff711f" />
    <polygon points={pts(frenteQuad(carga.x, yf, carga.w, carga.h, 0.06, 0.94, 0.27, 0.33).map(([a, b]) => [a, b - piso] as Punto))} fill="#003f31" />
    {/* Cabina */}
    <Bloque x={cab.x} y={y + 0.02} w={cab.w} d={d - 0.04} h={cab.h} z={piso} color="#ff711f" techo="#ff9a5b" />
    <polygon points={pts([iso(xc, y + 0.07, piso + cab.h * 0.5), iso(xc, yf - 0.07, piso + cab.h * 0.5), iso(xc, yf - 0.07, piso + cab.h * 0.92), iso(xc, y + 0.07, piso + cab.h * 0.92)])} fill="#bfe6fb" stroke="#c94d09" strokeWidth={0.6} />
    <polygon points={pts(frenteQuad(cab.x, yf - 0.02, cab.w, cab.h, 0.18, 0.86, 0.5, 0.9).map(([a, b]) => [a, b - piso] as Punto))} fill="#bfe6fb" />
    <polygon points={pts([iso(xc, yf - 0.12, piso + 1.5), iso(xc, yf - 0.03, piso + 1.5), iso(xc, yf - 0.03, piso + 3.5), iso(xc, yf - 0.12, piso + 3.5)])} fill="#fde68a" />
    <polygon points={pts([iso(xc, y + 0.03, piso + 1.5), iso(xc, y + 0.12, piso + 1.5), iso(xc, y + 0.12, piso + 3.5), iso(xc, y + 0.03, piso + 3.5)])} fill="#fde68a" />
    {/* Ruedas del lado visible */}
    <Rueda x={carga.x + 0.18} yf={yf + 0.01} z={2.6} r={3} />
    <Rueda x={xc - 0.14} yf={yf + 0.01} z={2.6} r={3} />
  </>;
}
