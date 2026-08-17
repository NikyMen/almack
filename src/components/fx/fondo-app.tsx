"use client";

// Fondo global de la app. Siempre hay un gradiente CSS estático con la paleta de
// marca; encima, si la calidad configurada lo permite, se monta Liquid Ether.
// Con calidad "Apagado" no se descarga siquiera three.js.

import dynamic from "next/dynamic";
import { useAjustes } from "@/lib/ajustes";

const LiquidEther = dynamic(() => import("@/components/fx/liquid-ether"), { ssr: false });

export function FondoApp() {
  const [ajustes] = useAjustes();

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base estática: sirve de fallback si no hay WebGL o el fondo está apagado */}
      <div className="absolute inset-0 bg-[#f5f7f0]" />
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_15%_-10%,rgba(197,237,27,0.22),transparent_60%),radial-gradient(900px_500px_at_110%_10%,rgba(168,204,18,0.14),transparent_55%)]" />

      {ajustes.fondoCalidad !== "off" && (
        <div className="absolute inset-0">
          <LiquidEther calidad={ajustes.fondoCalidad} opacidad={0.3} />
        </div>
      )}

      {/* Velo claro: garantiza contraste del texto pase lo que pase con el fluido */}
      <div className="absolute inset-0 bg-[#f5f7f0]/45" />
    </div>
  );
}
