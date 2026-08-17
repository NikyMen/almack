"use client";

import { create } from "zustand";

export type ToastVariant = "info" | "cart";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** Milisegundos que el toast permanece visible. */
  duration: number;
  leaving: boolean;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, opts?: { variant?: ToastVariant; duration?: number }) => void;
  dismiss: (id: number) => void;
}

const DURATION = 5000;
const EXIT_MS = 300;
let nextId = 0;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, opts) => {
    const id = ++nextId;
    const variant = opts?.variant ?? "info";
    const duration = opts?.duration ?? DURATION;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, duration, leaving: false }] }));
    setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) => {
    // Marca el toast como saliente para reproducir el slide antes de quitarlo
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, EXIT_MS);
  },
}));
