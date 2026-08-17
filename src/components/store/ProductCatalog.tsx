"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/store/ProductCard";
import { cn } from "@/lib/cn";

export function ProductCatalog({ products, query }: { products: Product[]; query?: string }) {
  const [cat, setCat] = useState<string>("todos");
  const q = query?.trim().toLowerCase();
  const searched = q
    ? products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      )
    : products;
  const categories = [
    { id: "todos", label: "Todos" },
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((category) => ({ id: category, label: category })),
  ];
  const list = cat === "todos" ? searched : searched.filter((p) => p.category === cat);

  return (
    <>
      {/* Filtros de categoría */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              cat === c.id
                ? "bg-brand-red text-white"
                : "bg-white text-brand-ink/70 hover:bg-black/5"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-ink/60">
          No encontramos productos{q ? ` para “${query?.trim()}”` : ""}.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </>
  );
}
