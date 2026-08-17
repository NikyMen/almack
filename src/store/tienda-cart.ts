"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TiendaProducto } from "@/lib/tienda";

export type TiendaLinea = { product: TiendaProducto; qty: number };

type CartState = {
  lines: TiendaLinea[];
  add: (product: TiendaProducto, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  total: () => number;
};

export const useTiendaCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (product, qty = 1) => {
        if (!product.available || product.stock <= 0 || qty <= 0) return;
        set((state) => {
          const existing = state.lines.find((line) => line.product.id === product.id);
          if (existing) {
            const next = Math.min(existing.qty + qty, product.stock);
            return {
              lines: state.lines.map((line) =>
                line.product.id === product.id ? { product, qty: next } : line
              ),
            };
          }
          return { lines: [...state.lines, { product, qty: Math.min(qty, product.stock) }] };
        });
      },
      setQty: (productId, qty) =>
        set((state) => {
          const line = state.lines.find((item) => item.product.id === productId);
          const next = line ? Math.min(qty, line.product.stock) : qty;
          return {
            lines:
              next <= 0
                ? state.lines.filter((item) => item.product.id !== productId)
                : state.lines.map((item) =>
                    item.product.id === productId ? { ...item, qty: next } : item
                  ),
          };
        }),
      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((item) => item.product.id !== productId) })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((sum, line) => sum + line.qty, 0),
      total: () => get().lines.reduce((sum, line) => sum + line.qty * line.product.price, 0),
    }),
    { name: "gestoria-tienda-cart" }
  )
);
