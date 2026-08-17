"use client";

// Dot Field — grilla de puntos que reaccionan al puntero (estilo React Bits).
// Canvas 2D puro: el login tiene que abrir rápido incluso en un celular viejo,
// así que acá no entra WebGL ni ninguna dependencia extra.

import { useEffect, useRef } from "react";

export default function DotField({
  espaciado = 26,
  radio = 1.6,
  color = "197, 237, 27", // lima de marca en RGB, la opacidad se calcula por punto
  radioInfluencia = 170,
  className = "",
}: {
  espaciado?: number;
  radio?: number;
  color?: string;
  radioInfluencia?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ancho = 0;
    let alto = 0;
    let dpr = 1;
    const puntero = { x: -9999, y: -9999 };

    function resize() {
      const r = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = Math.max(1, r.width);
      alto = Math.max(1, r.height);
      canvas!.width = Math.round(ancho * dpr);
      canvas!.height = Math.round(alto * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function onMove(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      puntero.x = e.clientX - r.left;
      puntero.y = e.clientY - r.top;
    }
    function onLeave() {
      puntero.x = -9999;
      puntero.y = -9999;
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const t0 = performance.now();

    function dibujar(now: number) {
      raf = requestAnimationFrame(dibujar);
      const t = (now - t0) / 1000;
      ctx!.clearRect(0, 0, ancho, alto);

      const cols = Math.ceil(ancho / espaciado) + 1;
      const filas = Math.ceil(alto / espaciado) + 1;
      const infl2 = radioInfluencia * radioInfluencia;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < filas; j++) {
          const bx = i * espaciado;
          const by = j * espaciado;

          // Respiración lenta en diagonal: da vida sin distraer.
          const onda = reduce ? 0 : Math.sin(t * 0.7 + (i + j) * 0.28);
          let alpha = 0.14 + onda * 0.06;
          let r = radio;
          let x = bx;
          let y = by;

          const dx = bx - puntero.x;
          const dy = by - puntero.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < infl2) {
            // Los puntos cercanos se iluminan y se apartan del cursor.
            const f = 1 - Math.sqrt(d2) / radioInfluencia;
            alpha += f * 0.55;
            r += f * 1.6;
            const d = Math.max(Math.sqrt(d2), 0.001);
            x += (dx / d) * f * 8;
            y += (dy / d) * f * 8;
          }

          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${color}, ${Math.max(0, Math.min(alpha, 0.85)).toFixed(3)})`;
          ctx!.arc(x, y, r, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
    }
    raf = requestAnimationFrame(dibujar);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [espaciado, radio, color, radioInfluencia]);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
