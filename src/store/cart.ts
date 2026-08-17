"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/lib/types";
import { track } from "@/lib/track";

export interface CartLine {
  product: Product;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: Product, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: () => number;
  total: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (product, qty = 1) => {
        if (!product.available || product.stock <= 0 || qty <= 0) return;
        track("cart_add", { productId: product.id });
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id);
          if (existing) {
            const nextQty = Math.min(existing.qty + qty, product.stock);
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id ? { ...l, product, qty: nextQty } : l
              ),
            };
          }
          return { lines: [...state.lines, { product, qty: Math.min(qty, product.stock) }] };
        });
      },
      remove: (productId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.product.id !== productId),
        })),
      setQty: (productId, qty) =>
        set((state) => {
          const line = state.lines.find((l) => l.product.id === productId);
          const nextQty = line ? Math.min(qty, line.product.stock) : qty;
          return {
            lines:
              nextQty <= 0
                ? state.lines.filter((l) => l.product.id !== productId)
                : state.lines.map((l) =>
                    l.product.id === productId ? { ...l, qty: nextQty } : l
                  ),
          };
        }),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((acc, l) => acc + l.qty, 0),
      total: () => get().lines.reduce((acc, l) => acc + l.qty * l.product.price, 0),
    }),
    { name: "gestoria-store-cart" }
  )
);
