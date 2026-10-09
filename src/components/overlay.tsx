"use client";
import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
let abiertos = 0;
let overflowAnterior = "";
export function Overlay({ children, className = "overlay", ...props }: HTMLAttributes<HTMLDivElement>) {
  const [montado, setMontado] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setMontado(true); }, []);
  useEffect(() => {
    if (!montado) return;
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (abiertos++ === 0) { overflowAnterior = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const elemento = root.current;
    const ajustar = () => {
      if (!elemento) return;
      elemento.style.setProperty("--dialog-height", `${window.visualViewport?.height ?? window.innerHeight}px`);
      elemento.style.setProperty("--dialog-top", `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    ajustar(); elemento?.focus({ preventScroll: true });
    window.visualViewport?.addEventListener("resize", ajustar);
    window.visualViewport?.addEventListener("scroll", ajustar);
    window.addEventListener("resize", ajustar);
    return () => {
      window.visualViewport?.removeEventListener("resize", ajustar);
      window.visualViewport?.removeEventListener("scroll", ajustar);
      window.removeEventListener("resize", ajustar);
      if (--abiertos === 0) document.body.style.overflow = overflowAnterior;
      if (previo?.isConnected) previo.focus({ preventScroll: true });
    };
  }, [montado]);
  if (!montado) return null;
  return createPortal(<div {...props} ref={root} className={className} tabIndex={-1} onKeyDown={event => {
    props.onKeyDown?.(event);
    if (event.key !== "Tab") return;
    const elementos = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const primero = elementos[0], ultimo = elementos.at(-1);
    if (!primero) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === primero || document.activeElement === root.current)) { event.preventDefault(); ultimo?.focus(); }
    else if (!event.shiftKey && (document.activeElement === ultimo || document.activeElement === root.current)) { event.preventDefault(); primero.focus(); }
  }}>{children}</div>, document.body);
}
