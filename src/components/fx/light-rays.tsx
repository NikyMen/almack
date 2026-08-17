"use client";

// Light Rays — haces de luz volumétrica (estilo React Bits) sobre ogl.
// Se monta únicamente dentro del sidebar de escritorio, que en celular ni
// siquiera se renderiza: así este WebGL nunca corre en un teléfono.

import { useEffect, useRef } from "react";

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uOrigen;      // origen de los rayos, en UV (0,0 = arriba izquierda)
  uniform vec2 uDireccion;
  uniform vec3 uColor;
  uniform float uVelocidad;
  uniform float uApertura;   // qué tan abierto es el abanico
  uniform float uLargo;
  uniform float uIntensidad;

  varying vec2 vUv;

  float ruido(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float fuerzaRayo(vec2 origen, vec2 dir, vec2 coord, float semillaA, float semillaB) {
    vec2 haciaCoord = coord - origen;
    float largo = length(haciaCoord);
    if (largo < 0.0001) return 1.0;

    float cosAngulo = dot(normalize(haciaCoord), dir);
    float anguloDistorsionado = cosAngulo + (ruido(coord * 0.02 + uTime * 0.08) - 0.5) * 0.04;
    float abanico = pow(max(anguloDistorsionado, 0.0), 1.0 / max(uApertura, 0.001));

    float maxDist = uResolution.x * uLargo;
    float caidaLargo = clamp((maxDist - largo) / maxDist, 0.0, 1.0);

    float base = clamp(
      (0.45 + 0.15 * sin(anguloDistorsionado * semillaA + uTime * uVelocidad)) +
      (0.30 + 0.20 * cos(-anguloDistorsionado * semillaB + uTime * uVelocidad)),
      0.0, 1.0
    );

    return base * caidaLargo * abanico;
  }

  void main() {
    // Coordenadas en píxeles con el origen arriba a la izquierda.
    vec2 coord = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    vec2 origen = uOrigen * uResolution;

    float r = fuerzaRayo(origen, normalize(uDireccion), coord, 36.2214, 21.1177) * 0.55
            + fuerzaRayo(origen, normalize(uDireccion), coord, 22.3991, 18.0234) * 0.40;

    r = clamp(r * uIntensidad, 0.0, 1.0);
    // Un poco más de brillo cerca del origen, como un foco real.
    float halo = smoothstep(0.75, 0.0, length(coord - origen) / (uResolution.y * 0.9));
    r = clamp(r + halo * 0.10 * uIntensidad, 0.0, 1.0);

    gl_FragColor = vec4(uColor * r, r);
  }
`;

export default function LightRays({
  color = "#c5ed1b",
  intensidad = 0.55,
  apertura = 0.75,
  largo = 2.2,
  velocidad = 0.6,
  className = "",
}: {
  color?: string;
  intensidad?: number;
  apertura?: number;
  largo?: number;
  velocidad?: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelado = false;
    let limpiar = () => {};

    // ogl se carga en dinámico para que no engorde el bundle inicial del shell.
    (async () => {
      const { Renderer, Program, Triangle, Mesh, Color } = await import("ogl");
      if (cancelado || !hostRef.current) return;

      const renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      host.appendChild(gl.canvas);
      gl.canvas.style.width = "100%";
      gl.canvas.style.height = "100%";
      gl.canvas.style.display = "block";

      const c = new Color(color);
      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1] },
          uOrigen: { value: [0.06, 0.02] }, // arriba a la izquierda
          uDireccion: { value: [0.55, 1.0] },
          uColor: { value: [c.r, c.g, c.b] },
          uVelocidad: { value: velocidad },
          uApertura: { value: apertura },
          uLargo: { value: largo },
          uIntensidad: { value: intensidad },
        },
        transparent: true,
        depthTest: false,
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

      function resize() {
        const r = host!.getBoundingClientRect();
        const w = Math.max(1, r.width);
        const h = Math.max(1, r.height);
        renderer.setSize(w, h);
        program.uniforms.uResolution.value = [w, h];
      }
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      let raf = 0;
      let visible = document.visibilityState === "visible";
      const onVisibility = () => { visible = document.visibilityState === "visible"; };
      document.addEventListener("visibilitychange", onVisibility);

      const t0 = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        program.uniforms.uTime.value = (now - t0) / 1000;
        renderer.render({ scene: mesh });
      };
      raf = requestAnimationFrame(frame);

      limpiar = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        gl.canvas.remove();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    })().catch(() => {
      /* sin WebGL → el sidebar se ve igual, solo sin rayos */
    });

    return () => {
      cancelado = true;
      limpiar();
    };
  }, [color, intensidad, apertura, largo, velocidad]);

  return <div ref={hostRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
