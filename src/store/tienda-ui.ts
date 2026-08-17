"use client";

import { create } from "zustand";

type UIState = {
  cartOpen: boolean;
  menuOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleMenu: () => void;
  closeMenu: () => void;
};

export const useTiendaUI = create<UIState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  openCart: () => set({ cartOpen: true, menuOpen: false }),
  closeCart: () => set({ cartOpen: false }),
  toggleMenu: () => set((state) => ({ menuOpen: !state.menuOpen, cartOpen: false })),
  closeMenu: () => set({ menuOpen: false }),
}));
