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
