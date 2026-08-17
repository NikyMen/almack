"use client";

// Alta manual de venta desde el módulo Ventas. Usa el mismo carrito y la misma
// server action que la Caja (cobrarVenta), así el stock se descuenta igual y no
// hay dos caminos distintos para registrar una venta.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, Trash2, X, Loader2, ShoppingCart } from "lucide-react";
import type { Producto } from "@/db/schema";
import { money } from "@/lib/format";
import { cobrarVenta } from "@/app/actions";
import { MEDIOS_PAGO_UI, type MedioPago } from "@/lib/medios-pago";
import { useCarrito } from "@/components/carrito";

export function NuevaVentaModal({
  productos,
  clientes,
  onClose,
}: {
  productos: Producto[];
  clientes: { id: number; nombre: string }[];
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [guardando, startTransition] = useTransition();
  const router = useRouter();

  const { carrito, error, setError, enCarrito, total, unidades, agregar, quitar, buscar, items } =
    useCarrito(productos);

  const resultados = buscar(busqueda, 8);

  function guardar() {
    if (carrito.length === 0) return setError("Agregá al menos un producto.");
    setError("");
    const pedido = items();
    startTransition(async () => {
      const r = await cobrarVenta(pedido, medio, {
        clienteId: clienteId ? Number(clienteId) : null,
      });
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="overlay" onClick={() => !guardando && onClose()}>
      <div className="sheet sm:max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold">Nueva venta</h3>
            <p className="text-sm text-slate-500">Descuenta stock igual que la caja.</p>
          </div>
          <button className="btn-ghost px-2 py-1.5" disabled={guardando} onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Buscador de productos */}
          <div>
            <label className="label">Productos</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por nombre, SKU o categoría…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoComplete="off"
              />
            </div>

            {busqueda.trim() && (
              <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {resultados.map((p) => {
                  const restante = p.stock - (enCarrito.get(p.id) ?? 0);
                  return (
                    <button
                      key={p.id}
                      disabled={restante <= 0}
                      onClick={() => agregar(p)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-lime/5 disabled:opacity-40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.nombre}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {p.sku} · {restante <= 0 ? "sin stock" : `stock ${restante}`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{money(p.precioVenta)}</span>
                    </button>
                  );
                })}
                {resultados.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">Sin coincidencias.</p>
                )}
              </div>
            )}
          </div>

          {/* Carrito */}
          <div>
            <label className="label flex items-center gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" /> Detalle {unidades > 0 && `· ${unidades} u.`}
            </label>
            {carrito.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">
                Buscá y agregá productos para armar la venta.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {carrito.map((l) => (
                  <div key={l.producto.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.producto.nombre}</p>
                      <p className="text-xs text-slate-400">{money(l.producto.precioVenta)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost px-2 py-1.5" onClick={() => agregar(l.producto, -1)} aria-label="Quitar una unidad">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{l.cantidad}</span>
                      <button className="btn-ghost px-2 py-1.5" onClick={() => agregar(l.producto, 1)} aria-label="Agregar una unidad">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      {money(l.producto.precioVenta * l.cantidad)}
                    </span>
                    <button className="btn-ghost px-2 py-1.5 text-rose-500" onClick={() => quitar(l.producto.id)} aria-label="Quitar del detalle">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Cliente</label>
              <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Medio de pago</label>
              <div className="grid grid-cols-3 gap-2">
                {MEDIOS_PAGO_UI.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMedio(m.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition ${
                      medio === m.id ? "border-lime bg-lime/10 text-navy" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-2xl font-bold tabular-nums text-navy">{money(total)}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={guardando} onClick={onClose}>Cancelar</button>
              <button className="btn-primary" disabled={guardando || carrito.length === 0} onClick={guardar}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar venta"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
