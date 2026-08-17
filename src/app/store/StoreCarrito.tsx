"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, ShoppingCart, Loader2 } from "lucide-react";
import type { Producto } from "@/db/schema";
import { money } from "@/lib/format";

type Linea = { producto: Producto; cantidad: number };

export function StoreCarrito({ productos, disponible }: { productos: Producto[]; disponible: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Stock disponible considerando lo que ya está en el carrito.
  const enCarrito = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of carrito) m.set(l.producto.id, l.cantidad);
    return m;
  }, [carrito]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => `${p.nombre} ${p.categoria}`.toLowerCase().includes(q));
  }, [busqueda, productos]);

  const total = carrito.reduce((a, l) => a + l.producto.precioVenta * l.cantidad, 0);
  const unidades = carrito.reduce((a, l) => a + l.cantidad, 0);

  function agregar(p: Producto, delta = 1) {
    setError("");
    setCarrito((prev) => {
      const existe = prev.find((l) => l.producto.id === p.id);
      const actual = existe?.cantidad ?? 0;
      const siguiente = actual + delta;
      if (siguiente > p.stock) {
        setError(`Sin stock suficiente de "${p.nombre}" (quedan ${p.stock}).`);
        return prev;
      }
      if (siguiente <= 0) return prev.filter((l) => l.producto.id !== p.id);
      if (existe) return prev.map((l) => (l.producto.id === p.id ? { ...l, cantidad: siguiente } : l));
      return [...prev, { producto: p, cantidad: 1 }];
    });
  }

  function quitar(id: number) {
    setCarrito((prev) => prev.filter((l) => l.producto.id !== id));
  }

  async function pagar() {
    if (carrito.length === 0 || !disponible) return;
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/mp/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: carrito.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        }),
      });
      const data = (await res.json()) as { initPoint?: string; error?: string };
      if (!res.ok || !data.initPoint) {
        setError(data.error || "No se pudo iniciar el pago.");
        setCargando(false);
        return;
      }
      // Redirige al checkout de MercadoPago.
      window.location.href = data.initPoint;
    } catch {
      setError("No se pudo conectar con el medio de pago. Probá de nuevo.");
      setCargando(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Catálogo */}
      <div className="card flex flex-col p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar productos…"
            className="input pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtrados.map((p) => {
            const usado = enCarrito.get(p.id) ?? 0;
            const agotado = p.stock - usado <= 0;
            return (
              <button
                key={p.id}
                onClick={() => agregar(p)}
                disabled={agotado}
                className="flex flex-col rounded-xl border border-slate-200 p-3 text-left transition hover:border-lime hover:bg-lime/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="line-clamp-2 text-sm font-medium leading-tight">{p.nombre}</span>
                <span className="mt-1 text-[11px] text-slate-400">{p.categoria}</span>
                <div className="mt-2 flex items-end justify-between">
                  <span className="text-base font-bold text-navy">{money(p.precioVenta)}</span>
                  <span className={`text-[11px] ${agotado ? "text-rose-500" : "text-slate-400"}`}>
                    {agotado ? "sin stock" : `stock ${p.stock - usado}`}
                  </span>
                </div>
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">
              No hay productos que coincidan con “{busqueda}”.
            </p>
          )}
        </div>
      </div>

      {/* Carrito */}
      <div className="card flex h-fit flex-col p-4 lg:sticky lg:top-4">
        <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShoppingCart className="h-4 w-4 text-slate-500" />
          <h2 className="font-semibold">Tu pedido</h2>
          {unidades > 0 && <span className="ml-auto badge bg-lime/15 text-navy">{unidades} u.</span>}
        </div>

        {carrito.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Agregá productos para empezar.</div>
        ) : (
          <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
            {carrito.map((l) => (
              <div key={l.producto.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.producto.nombre}</p>
                  <p className="text-xs text-slate-400">{money(l.producto.precioVenta)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost px-1.5 py-1" onClick={() => agregar(l.producto, -1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{l.cantidad}</span>
                  <button className="btn-ghost px-1.5 py-1" onClick={() => agregar(l.producto, 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-semibold">
                  {money(l.producto.precioVenta * l.cantidad)}
                </span>
                <button className="btn-ghost px-1.5 py-1 text-rose-500" onClick={() => quitar(l.producto.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-3 flex items-end justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-2xl font-bold text-navy">{money(total)}</span>
          </div>
          <button
            className="btn-primary w-full justify-center py-3 text-base"
            disabled={carrito.length === 0 || cargando || !disponible}
            onClick={pagar}
          >
            {cargando ? <Loader2 className="h-5 w-5 animate-spin" /> : "Pagar con MercadoPago"}
          </button>
          {!disponible && (
            <p className="mt-2 text-center text-xs text-slate-400">Pagos online no disponibles ahora.</p>
          )}
        </div>
      </div>
    </div>
  );
}
