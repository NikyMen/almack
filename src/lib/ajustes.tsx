"use client";

// Preferencias de la terminal (no del usuario en DB): viven en localStorage
// porque son propias del dispositivo — la calidad del fondo depende de la
// potencia del equipo y los atajos de cobro, de quién está en la caja.

import { useSyncExternalStore, useCallback } from "react";

export type FondoCalidad = "off" | "baja" | "media" | "alta";

export const CALIDADES: { id: FondoCalidad; label: string; hint: string }[] = [
  { id: "off", label: "Apagado", hint: "Fondo estático, máximo rendimiento" },
  { id: "baja", label: "Baja", hint: "Recomendado en celulares" },
  { id: "media", label: "Media", hint: "Equilibrio" },
  { id: "alta", label: "Alta", hint: "Solo equipos potentes" },
];

export type Ajustes = {
  fondoCalidad: FondoCalidad;
  /** Enter en el buscador vacío con carrito cargado → abre el cobro */
  autocobrador: boolean;
  /** tecla → id del medio de pago, en el modal de cobro */
  teclasPago: Record<string, string>;
};

export const AJUSTES_DEFAULT: Ajustes = {
  fondoCalidad: "baja",
  autocobrador: false,
  teclasPago: { "1": "efectivo", "2": "qr", "3": "tarjeta" },
};

const KEY = "gestoria:ajustes";

let cache: Ajustes = AJUSTES_DEFAULT;
let cargado = false;
const listeners = new Set<() => void>();

function leer(): Ajustes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return AJUSTES_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Ajustes>;
    return {
      ...AJUSTES_DEFAULT,
      ...parsed,
      teclasPago: { ...AJUSTES_DEFAULT.teclasPago, ...(parsed.teclasPago ?? {}) },
    };
  } catch {
    return AJUSTES_DEFAULT;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Sincroniza entre pestañas del mismo navegador
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = leer();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Ajustes {
  // La primera lectura en cliente hidrata el cache desde localStorage. Se hace
  // acá (y no en un efecto) para que el primer render ya tenga el valor real.
  if (!cargado) {
    cache = leer();
    cargado = true;
  }
  return cache;
}

// En el servidor siempre devolvemos los defaults: el snapshot debe ser estable
// para que React no tire "getServerSnapshot should be cached".
function getServerSnapshot(): Ajustes {
  return AJUSTES_DEFAULT;
}

export function useAjustes() {
  const ajustes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((patch: Partial<Ajustes>) => {
    cache = { ...getSnapshot(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* modo privado / cuota llena → queda solo en memoria */
    }
    listeners.forEach((l) => l());
  }, []);

  return [ajustes, set] as const;
}
