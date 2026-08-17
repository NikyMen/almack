"use client";

// Barra de navegación inferior (solo mobile). Cinco slots con el central
// elevado: es el escáner de código de barras, la acción más repetida del día
// en el mostrador y la que tiene que estar siempre a un pulgar de distancia.

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  ScanBarcode,
  TrendingUp,
  Truck,
  Boxes,
  Users,
  UserCog,
  ReceiptText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { tieneAcceso, MODULOS_VISIBLES, type ModuloKey, type UsuarioActual } from "@/lib/permisos";
import { BarcodeScanner } from "@/components/barcode-scanner";

const ICONOS: Record<ModuloKey, LucideIcon> = {
  panel: LayoutDashboard,
  caja: ScanLine,
  stock: Boxes,
  ventas: TrendingUp,
  compras: Truck,
  clientes: Users,
  facturacion: ReceiptText,
  tienda: Boxes,
  whatsapp: Users,
  ia: Sparkles,
  equipo: UserCog,
};

// Orden de preferencia para los dos slots de cada lado. Si el usuario no tiene
// permiso sobre alguno, se cae al siguiente de la lista.
const IZQUIERDA: ModuloKey[] = ["caja", "panel", "stock", "clientes"];
const DERECHA: ModuloKey[] = ["ventas", "compras", "stock", "facturacion"];

export function BottomNav({ usuario }: { usuario: UsuarioActual }) {
  const path = usePathname();
  const router = useRouter();
  const [escaneando, setEscaneando] = useState(false);

  function elegir(prefs: ModuloKey[], usados: Set<ModuloKey>, cantidad: number) {
    const out: ModuloKey[] = [];
    const candidatos = [...prefs, ...MODULOS_VISIBLES.map((m) => m.key)];
    for (const k of candidatos) {
      if (out.length === cantidad) break;
      if (usados.has(k) || !tieneAcceso(usuario, k)) continue;
      usados.add(k);
      out.push(k);
    }
    return out;
  }

  const usados = new Set<ModuloKey>();
  const izq = elegir(IZQUIERDA, usados, 2);
  const der = elegir(DERECHA, usados, 2);
  const puedeCaja = tieneAcceso(usuario, "caja");

  function onDetect(codigo: string) {
    setEscaneando(false);
    if (path === "/caja") {
      // El POS ya está montado con su carrito: le pasamos el código sin navegar
      // para no perder lo que hay cargado.
      window.dispatchEvent(new CustomEvent("gestoria:scan", { detail: codigo }));
    } else {
      router.push(`/caja?scan=${encodeURIComponent(codigo)}`);
    }
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur safe-b md:hidden"
        aria-label="Navegación principal"
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
          {izq.map((k) => (
            <ItemNav key={k} modulo={k} path={path} />
          ))}

          {/* Botón central elevado: abre la cámara */}
          <div className="relative w-16 shrink-0">
            <button
              onClick={() => (puedeCaja ? setEscaneando(true) : router.push("/caja"))}
              className="absolute -top-5 left-1/2 flex h-14 w-14 -translate-x-1/2 flex-col items-center justify-center rounded-full bg-lime text-navy shadow-lg shadow-lime/30 transition active:scale-95"
              aria-label="Escanear código de barras"
            >
              <ScanBarcode className="h-6 w-6" strokeWidth={2.2} />
            </button>
            <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] font-medium text-slate-500">
              Escanear
            </span>
          </div>

          {der.map((k) => (
            <ItemNav key={k} modulo={k} path={path} />
          ))}

        </div>
      </nav>

      {escaneando && (
        <BarcodeScanner onDetect={onDetect} onClose={() => setEscaneando(false)} titulo="Escanear producto" />
      )}
    </>
  );
}

function ItemNav({ modulo, path }: { modulo: ModuloKey; path: string }) {
  const info = MODULOS_VISIBLES.find((m) => m.key === modulo);
  if (!info) return null;
  const Icon = ICONOS[modulo];
  const activo = info.href === "/" ? path === "/" : path.startsWith(info.href);

  return (
    <Link
      href={info.href}
      aria-current={activo ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
        activo ? "text-navy" : "text-slate-500"
      }`}
    >
      <span className={`rounded-lg px-3 py-0.5 transition ${activo ? "bg-lime/25" : ""}`}>
        <Icon className="h-5 w-5" strokeWidth={activo ? 2.4 : 2} />
      </span>
      <span className="max-w-full truncate px-0.5">{info.label}</span>
    </Link>
  );
}
