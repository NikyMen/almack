/**
 * Geografía del reparto: por ahora solo se entrega dentro de la ciudad de
 * Corrientes (capital). La validación corre en el cliente (para avisar al
 * marcar el punto) y de nuevo en el servidor (no se confía en el navegador).
 */

/** Centro aproximado de la ciudad de Corrientes. */
export const CORRIENTES_CENTER = { lat: -27.4692, lng: -58.8306 };

/** Monto mínimo de compra para poder cerrar el pedido. */
export const MIN_ENVIO_TOTAL = 50_000;

/**
 * Caja que encierra el ejido urbano de Corrientes capital.
 * El límite oeste (-58.88) deja afuera la orilla chaqueña del Paraná
 * (Barranqueras/Resistencia), que de otro modo entraría por distancia.
 * También se usa como viewbox para geocodificar direcciones (lib/geocode).
 */
export const CORRIENTES_BOUNDS = {
  latMin: -27.6,
  latMax: -27.4,
  lngMin: -58.88,
  lngMax: -58.7,
};

/** Radio máximo (km) desde el centro; refuerza la caja en las esquinas. */
const MAX_KM = 14;

/** Distancia haversine en km entre dos puntos. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ¿El punto está dentro de la zona de reparto (ciudad de Corrientes)? */
export function isInsideCorrientes(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < CORRIENTES_BOUNDS.latMin || lat > CORRIENTES_BOUNDS.latMax) return false;
  if (lng < CORRIENTES_BOUNDS.lngMin || lng > CORRIENTES_BOUNDS.lngMax) return false;
  return distanceKm({ lat, lng }, CORRIENTES_CENTER) <= MAX_KM;
}
