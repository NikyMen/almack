"use client";

import { useState } from "react";
import { MapPin, Phone, ExternalLink } from "lucide-react";
import { sucursales } from "@/lib/sucursales";
import { cn } from "@/lib/cn";

export function SucursalesMap({ initialId }: { initialId?: string }) {
  const [selected, setSelected] = useState(
    () => sucursales.find((s) => s.id === initialId) ?? sucursales[0]
  );

  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(selected.mapsQuery)}&z=15&output=embed`;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.mapsQuery)}`;

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr] md:gap-6">
      {/* Lista de sucursales */}
      <ul className="no-scrollbar flex gap-2 overflow-x-auto md:max-h-[600px] md:flex-col md:overflow-y-auto">
        {sucursales.map((s) => {
          const active = s.id === selected.id;
          return (
            <li key={s.id} className="shrink-0 md:shrink">
              <button
                onClick={() => setSelected(s)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition md:p-4",
                  active
                    ? "border-brand-red bg-brand-red/5"
                    : "border-black/5 bg-white hover:border-brand-red/40"
                )}
              >
                <p className="flex items-center gap-2 text-sm font-bold text-brand-ink">
                  <MapPin size={16} className={active ? "text-brand-red" : "text-brand-ink/40"} />
                  {s.name}
                </p>
                <p className="mt-1 text-xs text-brand-ink/60 md:text-sm">{s.address}</p>
                {s.phone && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-ink/60">
                    <Phone size={13} /> WhatsApp {s.phone}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Mapa */}
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
          <p className="text-sm font-semibold text-brand-ink">{selected.name}</p>
          <a
          href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-red hover:underline"
          >
            Abrir en Google Maps <ExternalLink size={13} />
          </a>
        </div>
        <iframe
          key={selected.id}
          title={`Mapa de ${selected.name}`}
          src={embedSrc}
          className="h-[320px] w-full md:h-[548px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </div>
  );
}
