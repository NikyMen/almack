"use client";

import { create } from "zustand";

interface UIState {
  cartOpen: boolean;
  menuOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleMenu: () => void;
  closeMenu: () => void;
}

export const useUI = create<UIState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  openCart: () => set({ cartOpen: true, menuOpen: false }),
  closeCart: () => set({ cartOpen: false }),
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen, cartOpen: false })),
  closeMenu: () => set({ menuOpen: false }),
}));
