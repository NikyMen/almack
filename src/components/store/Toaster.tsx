"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShoppingCart, X } from "lucide-react";
import { useToast, type Toast } from "@/store/toast";
import { useUI } from "@/store/ui";

export function Toaster() {
  const toasts = useToast((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 md:bottom-6">
      {toasts.map((t) =>
        t.variant === "cart" ? <CartToast key={t.id} toast={t} /> : <InfoToast key={t.id} toast={t} />
      )}
    </div>
  );
}

/** Toast genérico (avisos, errores de validación, etc.). */
function InfoToast({ toast }: { toast: Toast }) {
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div
      role="status"
      className={`flex items-center gap-2 self-end rounded-xl bg-brand-ink px-4 py-3 text-sm text-white shadow-card ${
        toast.leaving ? "animate-toast-out" : "animate-toast-in"
      }`}
    >
      <CheckCircle2 size={18} className="shrink-0 text-brand-gold" />
      <span>{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="ml-2 shrink-0 text-white/60 hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Toast de "agregado al carrito": tocable (abre el carrito), con botón
 * "Ver mi pedido" y un contador visible de los segundos que quedan antes
 * de desaparecer (barra + número).
 */
function CartToast({ toast }: { toast: Toast }) {
  const dismiss = useToast((s) => s.dismiss);
  const openCart = useUI((s) => s.openCart);
  const [restante, setRestante] = useState(Math.ceil(toast.duration / 1000));

  useEffect(() => {
    const inicio = Date.now();
    const timer = setInterval(() => {
      const quedan = Math.max(0, Math.ceil((toast.duration - (Date.now() - inicio)) / 1000));
      setRestante(quedan);
    }, 250);
    return () => clearInterval(timer);
  }, [toast.duration]);

  const verCarrito = () => {
    dismiss(toast.id);
    openCart();
  };

  return (
    <div
      role="status"
      onClick={verCarrito}
      className={`relative cursor-pointer overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5 transition hover:ring-brand-red/40 ${
        toast.leaving ? "animate-toast-out" : "animate-toast-in"
      }`}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold/20 text-brand-red">
          <ShoppingCart size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-brand-ink">¡Listo! Ya está en tu pedido</p>
          <p className="truncate text-xs text-brand-ink/60">{toast.message}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss(toast.id);
          }}
          aria-label="Cerrar notificación"
          className="shrink-0 self-start rounded-md p-0.5 text-brand-ink/40 hover:text-brand-ink"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            verCarrito();
          }}
          className="btn-primary flex-1 py-2 text-xs"
        >
          <ShoppingCart size={14} /> Ver mi pedido
        </button>
        <span
          className="w-8 shrink-0 text-center text-xs font-bold tabular-nums text-brand-ink/50"
          aria-label={`Desaparece en ${restante} segundos`}
        >
          {restante}s
        </span>
      </div>

      {/* Barra de tiempo restante */}
      <div className="h-1 w-full bg-black/5">
        <div
          className="toast-progress h-full bg-brand-gold"
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      </div>
    </div>
  );
}
