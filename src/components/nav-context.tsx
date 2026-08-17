"use client";

// El drawer de navegación se abre desde dos lugares distintos (la barra inferior
// en mobile y el botón de menú), y el panel de configuración desde tres. El
// estado vive acá para que no haya dos copias desincronizadas.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type NavCtx = {
  menuAbierto: boolean;
  setMenuAbierto: (v: boolean) => void;
  configAbierta: boolean;
  setConfigAbierta: (v: boolean) => void;
};

const Ctx = createContext<NavCtx | null>(null);

export function useNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNav debe usarse dentro de <NavProvider>");
  return ctx;
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const path = usePathname();

  // Al navegar se cierra el drawer solo.
  useEffect(() => {
    setMenuAbierto(false);
  }, [path]);

  // Bloquear el scroll del body mientras hay una capa encima.
  useEffect(() => {
    const bloquear = menuAbierto || configAbierta;
    document.body.style.overflow = bloquear ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto, configAbierta]);

  const value = useMemo(
    () => ({ menuAbierto, setMenuAbierto, configAbierta, setConfigAbierta }),
    [menuAbierto, configAbierta]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
