"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { CORRIENTES_CENTER, isInsideCorrientes } from "@/lib/geo";
import { AVISO_MAPA } from "@/lib/entrega";
import { geocodeDireccion } from "@/lib/geocode";

export interface MapPoint {
  lat: number;
  lng: number;
}

type Busqueda = "idle" | "buscando" | "encontrada" | "sin-resultado";

/**
 * Mini mapa (Leaflet + OpenStreetMap, sin API key) para que el cliente marque
 * el punto exacto de entrega: toca el mapa o arrastra el pin. Si recibe
 * `searchQuery` (la dirección escrita), la geocodifica con debounce y pre-ubica
 * el pin ahí; el cliente después lo ajusta a mano. El botón "Usar mi ubicación"
 * centra con el GPS del teléfono. Valida en vivo que el punto esté dentro de
 * la zona de reparto (ciudad de Corrientes).
 */
export function MapPicker({
  value,
  onChange,
  searchQuery,
  compact = false,
}: {
  value: MapPoint | null;
  onChange: (point: MapPoint) => void;
  /** Dirección escrita por el cliente; se busca en el mapa mientras escribe. */
  searchQuery?: string;
  /** Versión chica (mapa más bajo) para ubicarlo al final del carrito. */
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda>("idle");
  const ultimaBusquedaRef = useRef("");

  useEffect(() => {
    let cancelado = false;

    import("leaflet").then((L) => {
      if (cancelado || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: value ? [value.lat, value.lng] : [CORRIENTES_CENTER.lat, CORRIENTES_CENTER.lng],
        zoom: value ? 16 : 13,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Pin propio (SVG inline): evita los íconos rotos del default de Leaflet
      // con bundlers y queda con los colores de la marca.
      const icon = L.divIcon({
        className: "",
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="rgb(200,16,46)" stroke="#fff" stroke-width="1"><path d="M20 10c0 6-8 13-8 13S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#F6B40A" stroke="none"/></svg>`,
        iconSize: [38, 38],
        iconAnchor: [19, 36],
      });

      const setPoint = (lat: number, lng: number) => {
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const p = markerRef.current!.getLatLng();
            // El ajuste manual pisa cualquier estado de la búsqueda automática.
            setBusqueda("idle");
            onChangeRef.current({ lat: p.lat, lng: p.lng });
          });
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
        onChangeRef.current({ lat, lng });
      };

      if (value) setPoint(value.lat, value.lng);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        // Un toque manual limpia el aviso de la búsqueda automática (la
        // búsqueda con éxito re-marca "encontrada" justo después del fire).
        setBusqueda("idle");
        setPoint(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
    });

    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo al montar: el valor inicial se toma una vez; después manda el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocodifica la dirección escrita (con debounce) y pre-ubica el pin ahí.
  useEffect(() => {
    const q = (searchQuery ?? "").trim();
    if (q.length < 4) {
      setBusqueda("idle");
      return;
    }
    if (q === ultimaBusquedaRef.current) return;

    const controller = new AbortController();
    // El debounce espera a que termine de escribir y de paso respeta el
    // límite de uso de Nominatim (1 request por segundo).
    const timer = setTimeout(() => {
      setBusqueda("buscando");
      geocodeDireccion(q, controller.signal)
        .then((r) => {
          ultimaBusquedaRef.current = q;
          if (!r) {
            setBusqueda("sin-resultado");
            return;
          }
          mapRef.current?.setView([r.lat, r.lng], 17);
          // Reusa el flujo del click del mapa para crear/mover el pin.
          mapRef.current?.fire("click", { latlng: { lat: r.lat, lng: r.lng } });
          setBusqueda("encontrada");
        })
        .catch(() => {
          if (!controller.signal.aborted) setBusqueda("sin-resultado");
        });
    }, 900);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const usarMiUbicacion = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("Tu navegador no permite usar la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.setView([lat, lng], 16);
        // Simula un click en ese punto para crear/mover el pin.
        mapRef.current?.fire("click", { latlng: { lat, lng } });
      },
      () => setGpsError("No pudimos leer tu ubicación. Marcá el punto tocando el mapa."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const fueraDeZona = value ? !isInsideCorrientes(value.lat, value.lng) : false;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`${compact ? "h-36" : "h-52"} w-full overflow-hidden rounded-xl border ${
          fueraDeZona ? "border-brand-red" : "border-black/10"
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={usarMiUbicacion} className="btn-gold px-3 py-1.5 text-xs">
          <LocateFixed size={14} /> Usar mi ubicación
        </button>
        <span className="text-[11px] text-brand-ink/50">
          {busqueda === "buscando"
            ? "Buscando tu dirección en el mapa…"
            : busqueda === "encontrada"
              ? "📍 Ubicamos tu dirección: ajustá el pin si hace falta."
              : value
                ? "Podés arrastrar el pin para ajustar."
                : "Tocá el mapa para marcar tu casa."}
        </span>
      </div>
      {busqueda === "sin-resultado" && (
        <p className="text-xs text-brand-red">
          No encontramos esa dirección en el mapa. Marcá el punto tocando el mapa.
        </p>
      )}
      {gpsError && <p className="text-xs text-brand-red">{gpsError}</p>}
      {fueraDeZona && (
        <p className="rounded-lg bg-brand-red/10 px-3 py-2 text-xs font-semibold text-brand-red">
          Ese punto está fuera de la ciudad de Corrientes. Por el momento solo entregamos dentro
          de la ciudad.
        </p>
      )}
      <p className="rounded-lg bg-brand-cream px-3 py-2 text-xs font-semibold text-brand-ink">
        {AVISO_MAPA}
      </p>
    </div>
  );
}
