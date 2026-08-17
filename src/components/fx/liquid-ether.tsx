"use client";

// Liquid Ether — fondo de fluido animado (estilo React Bits) sobre three.js.
// Es una simulación de Navier-Stokes en render targets ping-pong: se advecta la
// velocidad, se proyecta a divergencia cero con Jacobi y se arrastra una "tinta"
// de color que es lo que se dibuja. Adaptado a la paleta de la marca y con un
// nivel de calidad configurable, porque en celular hay que pedirle poco.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { FondoCalidad } from "@/lib/ajustes";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ADVECT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDissipation;
  void main() {
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
    gl_FragColor = uDissipation * texture2D(uSource, coord);
    gl_FragColor.a = 1.0;
  }
`;

const DIVERGENCE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
  }
`;

const PRESSURE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 vel = texture2D(uVelocity, vUv).xy - vec2(r - l, t - b) * 0.5;
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`;

const SPLAT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float uAspect;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
    gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
  }
`;

// Salida: el color de la tinta con alpha proporcional a su intensidad, para que
// las zonas sin tinta dejen ver el fondo tal cual (nada de rectángulo negro).
const DISPLAY = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uOpacity;
  void main() {
    vec3 c = texture2D(uTexture, vUv).rgb;
    float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
    gl_FragColor = vec4(c, a * uOpacity);
  }
`;

type Preset = { sim: number; dye: number; dpr: number; iter: number };

const PRESETS: Record<Exclude<FondoCalidad, "off">, Preset> = {
  baja: { sim: 64, dye: 112, dpr: 1, iter: 6 },
  media: { sim: 96, dye: 192, dpr: 1.5, iter: 12 },
  alta: { sim: 128, dye: 256, dpr: 2, iter: 20 },
};

function crearRT(w: number, h: number) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  return rt;
}

// Constante de módulo: si fuese un literal por defecto en los props, cambiaría
// de identidad en cada render y reiniciaría la simulación entera.
const PALETA_MARCA = ["#c5ed1b", "#e4f78a", "#a8cc12"];

export default function LiquidEther({
  calidad = "baja",
  colores = PALETA_MARCA,
  opacidad = 0.32,
  className = "",
}: {
  calidad?: FondoCalidad;
  colores?: string[];
  opacidad?: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Los valores que pueden cambiar entre renders van por ref para no reconstruir
  // toda la simulación cuando el usuario mueve el slider de opacidad.
  const opacidadRef = useRef(opacidad);
  opacidadRef.current = opacidad;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || calidad === "off") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const preset = PRESETS[calidad];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // sin WebGL disponible → el gradiente CSS de atrás alcanza
    }
    if (!renderer.capabilities.isWebGL2 && !renderer.extensions.get("OES_texture_half_float")) {
      renderer.dispose();
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dpr));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(geo);
    scene.add(quad);

    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

    const simTexel = new THREE.Vector2(1 / preset.sim, 1 / preset.sim);
    const dyeTexel = new THREE.Vector2(1 / preset.dye, 1 / preset.dye);

    const advect = mat(ADVECT, {
      uVelocity: { value: null }, uSource: { value: null },
      uTexel: { value: simTexel }, uDt: { value: 0.016 }, uDissipation: { value: 1 },
    });
    const divergence = mat(DIVERGENCE, { uVelocity: { value: null }, uTexel: { value: simTexel } });
    const pressure = mat(PRESSURE, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: simTexel } });
    const gradient = mat(GRADIENT, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: simTexel } });
    const splat = mat(SPLAT, {
      uTarget: { value: null }, uAspect: { value: 1 },
      uColor: { value: new THREE.Vector3() }, uPoint: { value: new THREE.Vector2() }, uRadius: { value: 0.0004 },
    });
    const display = mat(DISPLAY, { uTexture: { value: null }, uOpacity: { value: opacidad } });
    display.transparent = true;
    const materiales = [advect, divergence, pressure, gradient, splat, display];

    let velA = crearRT(preset.sim, preset.sim);
    let velB = crearRT(preset.sim, preset.sim);
    let dyeA = crearRT(preset.dye, preset.dye);
    let dyeB = crearRT(preset.dye, preset.dye);
    const divRT = crearRT(preset.sim, preset.sim);
    let presA = crearRT(preset.sim, preset.sim);
    let presB = crearRT(preset.sim, preset.sim);
    const targets = () => [velA, velB, dyeA, dyeB, divRT, presA, presB];

    function pasar(material: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget | null) {
      quad.material = material;
      renderer.setRenderTarget(destino);
      renderer.render(scene, camera);
    }

    const paleta = colores.map((c) => new THREE.Color(c));

    function salpicar(x: number, y: number, dx: number, dy: number, color: THREE.Color) {
      splat.uniforms.uTarget.value = velA.texture;
      splat.uniforms.uPoint.value.set(x, y);
      splat.uniforms.uColor.value.set(dx, dy, 0);
      pasar(splat, velB);
      [velA, velB] = [velB, velA];

      splat.uniforms.uTarget.value = dyeA.texture;
      splat.uniforms.uColor.value.set(color.r, color.g, color.b);
      pasar(splat, dyeB);
      [dyeA, dyeB] = [dyeB, dyeA];
    }

    // --- Puntero: real si el usuario mueve, automático si está quieto ---------
    const puntero = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, activo: false };
    let ultimoMovimiento = 0;
    let ancho = 1;
    let alto = 1;

    function onPointerMove(e: PointerEvent) {
      const r = host!.getBoundingClientRect();
      puntero.x = (e.clientX - r.left) / r.width;
      puntero.y = 1 - (e.clientY - r.top) / r.height;
      puntero.activo = true;
      ultimoMovimiento = performance.now();
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    function resize() {
      const r = host!.getBoundingClientRect();
      ancho = Math.max(1, r.width);
      alto = Math.max(1, r.height);
      renderer.setSize(ancho, alto, false);
      splat.uniforms.uAspect.value = ancho / alto;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // --- Bucle ---------------------------------------------------------------
    let raf = 0;
    let visible = true;
    let enPantalla = true;
    let t0 = performance.now();
    let color = 0;

    const io = new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; });
    io.observe(host);
    const onVisibility = () => { visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVisibility);

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible || !enPantalla) { t0 = now; return; }
      const dt = Math.min((now - t0) / 1000, 1 / 30);
      t0 = now;

      // Sin interacción reciente el fluido se mueve solo, para que el fondo
      // respire aunque nadie toque la pantalla (clave en mobile).
      if (!puntero.activo || now - ultimoMovimiento > 1800) {
        const s = now / 1000;
        puntero.x = 0.5 + 0.34 * Math.cos(s * 0.32) * Math.sin(s * 0.13);
        puntero.y = 0.5 + 0.3 * Math.sin(s * 0.27);
      }

      const dx = (puntero.x - puntero.px) * 900;
      const dy = (puntero.y - puntero.py) * 900;
      puntero.px = puntero.x;
      puntero.py = puntero.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.4) {
        salpicar(puntero.x, puntero.y, dx, dy, paleta[color % paleta.length]);
        if (Math.random() < 0.02) color++;
      }

      advect.uniforms.uDt.value = dt * 60;
      advect.uniforms.uTexel.value = simTexel;

      // Velocidad
      advect.uniforms.uVelocity.value = velA.texture;
      advect.uniforms.uSource.value = velA.texture;
      advect.uniforms.uDissipation.value = 0.985;
      pasar(advect, velB);
      [velA, velB] = [velB, velA];

      // Proyección a divergencia cero
      divergence.uniforms.uVelocity.value = velA.texture;
      pasar(divergence, divRT);
      pressure.uniforms.uDivergence.value = divRT.texture;
      for (let i = 0; i < preset.iter; i++) {
        pressure.uniforms.uPressure.value = presA.texture;
        pasar(pressure, presB);
        [presA, presB] = [presB, presA];
      }
      gradient.uniforms.uPressure.value = presA.texture;
      gradient.uniforms.uVelocity.value = velA.texture;
      pasar(gradient, velB);
      [velA, velB] = [velB, velA];

      // Tinta
      advect.uniforms.uTexel.value = dyeTexel;
      advect.uniforms.uVelocity.value = velA.texture;
      advect.uniforms.uSource.value = dyeA.texture;
      advect.uniforms.uDissipation.value = 0.975;
      pasar(advect, dyeB);
      [dyeA, dyeB] = [dyeB, dyeA];

      display.uniforms.uTexture.value = dyeA.texture;
      display.uniforms.uOpacity.value = opacidadRef.current;
      pasar(display, null);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      targets().forEach((t) => t.dispose());
      materiales.forEach((m) => m.dispose());
      geo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // La opacidad se lee por ref dentro del bucle: no debe reiniciar la sim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calidad, colores]);

  return <div ref={hostRef} aria-hidden className={`pointer-events-none h-full w-full ${className}`} />;
}
