"use client";

import { Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatARS } from "@/lib/format";
import { useCart } from "@/store/cart";
import { useToast } from "@/store/toast";

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add);
  const showToast = useToast((s) => s.show);
  const enCarrito = useCart((s) => s.lines.find((l) => l.product.id === product.id)?.qty ?? 0);

  const agotado = product.stock <= 0;
  const noDisponible = !product.available;
  const noSePuedeComprar = agotado || noDisponible;
  const alcanzoElTope = enCarrito >= product.stock;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-soft">
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-cream">
        {product.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-brand-ink/25">📷</div>
        )}
        {product.badge && (
          <span className="chip absolute left-2 top-2 bg-brand-gold text-brand-ink shadow">
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-9 text-sm font-semibold leading-tight text-brand-ink">
          {product.name}
        </h3>
        <p className="mt-0.5 min-h-8 line-clamp-2 text-xs leading-4 text-brand-ink/55">
          {product.description}
        </p>

        <div className="mt-auto">
          <div className="mt-2 flex items-end gap-2">
            <span className="text-base font-bold text-brand-ink">{formatARS(product.price)}</span>
            {product.oldPrice && (
              <span className="text-xs text-brand-ink/40 line-through">
                {formatARS(product.oldPrice)}
              </span>
            )}
          </div>

          <span className="mt-1 block min-h-4 text-xs font-semibold text-brand-red">
            {noSePuedeComprar ? (agotado ? "Agotado" : "No disponible") : null}
          </span>

          <button
            onClick={() => {
              add(product);
              showToast(product.name, { variant: "cart" });
            }}
            disabled={noSePuedeComprar || alcanzoElTope}
            className="btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Agregar ${product.name}`}
          >
            <Plus size={16} />
            {agotado ? "Agotado" : noDisponible ? "No disponible" : alcanzoElTope ? "Máximo disponible" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
