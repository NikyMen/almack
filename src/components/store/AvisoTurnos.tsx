import { Sunrise, Sunset } from "lucide-react";
import { AVISO_TURNOS_REGLAS } from "@/lib/entrega";
import { cn } from "@/lib/cn";

const ICONOS = { manana: Sunrise, tarde: Sunset } as const;

/**
 * Aviso principal de cuándo se recibe cada compra. Se muestra en la home.
 * Cada turno se muestra como una fila con su propio ícono (mañana / tarde),
 * para que se lea claro en vez de un párrafo largo. Los textos viven en
 * lib/entrega para que sean uno solo en toda la app.
 */
export function AvisoTurnos({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-brand-ink p-4 text-white shadow-soft md:p-5",
        className
      )}
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-gold">
        Horarios de entrega
      </p>
      <ul className="space-y-3">
        {AVISO_TURNOS_REGLAS.map((r) => {
          const Icon = ICONOS[r.turno];
          return (
            <li key={r.turno} className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-brand-gold"
                aria-hidden
              >
                <Icon size={20} />
              </span>
              <p className="text-sm font-semibold leading-snug md:text-base">
                <span className="font-extrabold">{r.compra}</span> y {r.entrega}.
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
