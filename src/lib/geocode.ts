/**
 * Geocodificación de direcciones con Nominatim (OpenStreetMap, sin API key,
 * igual que las tiles del mapa). Se usa en el checkout para pre-ubicar el pin
 * según la dirección que escribe el cliente. Las búsquedas quedan acotadas a
 * la caja de Corrientes capital: una dirección de otra ciudad no devuelve nada.
 */

import { CORRIENTES_BOUNDS } from "@/lib/geo";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Nombre normalizado que devuelve OSM (calle, barrio, ciudad…). */
  label: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Formato viewbox de Nominatim: lng-izq, lat-arriba, lng-der, lat-abajo. */
const VIEWBOX = [
  CORRIENTES_BOUNDS.lngMin,
  CORRIENTES_BOUNDS.latMax,
  CORRIENTES_BOUNDS.lngMax,
  CORRIENTES_BOUNDS.latMin,
].join(",");

async function buscar(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<GeocodeResult | null> {
  const qs = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "ar",
    viewbox: VIEWBOX,
    bounded: "1",
    ...params,
  });
  const res = await fetch(`${NOMINATIM_URL}?${qs}`, {
    signal,
    headers: { "Accept-Language": "es" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const hit = data[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: hit.display_name };
}

/**
 * Busca una dirección escrita libre ("Blas Parera 1749") dentro de Corrientes
 * capital. Devuelve null si no hay resultado dentro de la zona de reparto.
 */
export async function geocodeDireccion(
  direccion: string,
  signal?: AbortSignal
): Promise<GeocodeResult | null> {
  // Lo que viene después de una coma suele ser piso/depto y confunde al
  // geocodificador: "Blas Parera 1749, dpto 2" → "Blas Parera 1749".
  const q = direccion.split(",")[0].trim();
  if (!q) return null;

  // Primer intento: búsqueda libre con la ciudad como contexto.
  const libre = await buscar({ q: `${q}, Corrientes, Argentina` }, signal);
  if (libre) return libre;

  // Segundo intento: búsqueda estructurada por calle, que suele resolver
  // mejor el patrón "calle + altura" cuando la libre falla.
  return buscar({ street: q, city: "Corrientes", country: "Argentina" }, signal);
}
