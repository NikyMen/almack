"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, Zap, Camera, ChevronUp, X,
} from "lucide-react";
import type { Producto } from "@/db/schema";
import { money } from "@/lib/format";
import { cobrarVenta } from "@/app/actions";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { useAjustes } from "@/lib/ajustes";
import { useCarrito } from "@/components/carrito";
import { SelectorPago } from "@/components/selector-pago";
import { BarcodeScanner } from "@/components/barcode-scanner";

type Ticket = { ventaId: number; total: number; items: number; medioPago: MedioPago };

export function CajaPOS({ productos }: { productos: Producto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [eligiendoPago, setEligiendoPago] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();

  const [ajustes, setAjustes] = useAjustes();
  const {
    carrito, error, setError, enCarrito, total, unidades,
    agregar, quitar, vaciar, buscar, agregarPorCodigo, items,
  } = useCarrito(productos);

  const filtrados = buscar(busqueda);

  useEffect(() => {
    // El foco automático es útil con teclado/lector USB, pero abre el teclado
    // virtual al entrar a Caja desde un celular.
    if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
  }, []);

  const porCodigo = useCallback(
    (codigo: string) => {
      setTicket(null);
      agregarPorCodigo(codigo);
      setBusqueda("");
      setPedidoAbierto(true);
    },
    [agregarPorCodigo]
  );

  // Códigos que llegan de la cámara del nav inferior (mismo /caja, sin recargar)
  useEffect(() => {
    const onScan = (e: Event) => porCodigo((e as CustomEvent<string>).detail);
    window.addEventListener("gestoria:scan", onScan);
    return () => window.removeEventListener("gestoria:scan", onScan);
  }, [porCodigo]);

  // …o del query param, cuando se escaneó estando en otra sección.
  const scanParam = params.get("scan");
  const scanUsado = useRef<string | null>(null);
  useEffect(() => {
    if (!scanParam || scanUsado.current === scanParam) return;
    scanUsado.current = scanParam;
    porCodigo(scanParam);
    // Limpiamos la URL para que un refresh no vuelva a cargar el producto.
    window.history.replaceState(null, "", "/caja");
  }, [scanParam, porCodigo]);

  function cobrar() {
    if (carrito.length === 0) return;
    setError("");
    setEligiendoPago(true);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = busqueda.trim();

    // Autocobrador: buscador vacío + carrito con productos = cobrar.
    if (!q) {
      if (ajustes.autocobrador && carrito.length > 0) cobrar();
      return;
    }
    setTicket(null);
    agregarPorCodigo(q);
    setBusqueda("");
  }

  function confirmarPago(medioPago: MedioPago) {
    if (carrito.length === 0) return;
    setError("");
    const pedido = items();
    const unidadesPedido = unidades;
    startTransition(async () => {
      const r = await cobrarVenta(pedido, medioPago);
      if (!r.ok) return setError(r.error);
      setTicket({ ventaId: r.ventaId, total: r.total, items: unidadesPedido, medioPago });
      vaciar();
      setBusqueda("");
      setEligiendoPago(false);
      setPedidoAbierto(false);
      if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
    });
  }

  const panelPedido = (
    <>
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <ShoppingCart className="h-4 w-4 text-slate-500" />
        <h2 className="font-semibold">Pedido</h2>
        {unidades > 0 && <span className="badge ml-auto bg-lime/15 text-navy">{unidades} u.</span>}
      </div>

      {carrito.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          {ticket ? (
            <div className="flex flex-col items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
              <p className="font-semibold">¡Cobrado!</p>
              <p className="text-slate-500">
                Venta #{ticket.ventaId} · {ticket.items} u. · {money(ticket.total)}
              </p>
              <p className="text-xs text-slate-400">Pago: {ETIQUETA_MEDIO[ticket.medioPago]}</p>
              <p className="mt-1 text-xs text-slate-400">Listo para el próximo cliente.</p>
            </div>
          ) : (
            "Tocá un producto o escaneá para empezar."
          )}
        </div>
      ) : (
        <div className="max-h-[46vh] divide-y divide-slate-100 overflow-y-auto">
          {carrito.map((l) => (
            <div key={l.producto.id} className="flex items-center gap-2 py-2">
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
              <button className="btn-ghost px-2 py-1.5 text-rose-500" onClick={() => quitar(l.producto.id)} aria-label="Quitar del pedido">
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
          <span className="text-2xl font-bold tabular-nums text-navy">{money(total)}</span>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1 justify-center py-3 text-base" disabled={carrito.length === 0 || pendiente} onClick={cobrar}>
            {pendiente ? <Loader2 className="h-5 w-5 animate-spin" /> : "Cobrar"}
          </button>
          {carrito.length > 0 && (
            <button className="btn-ghost" disabled={pendiente} onClick={vaciar}>
              Vaciar
            </button>
          )}
        </div>
        <button
          className="btn-ghost mt-2 w-full justify-center lg:hidden"
          onClick={() => { setPedidoAbierto(false); setEscaneando(true); }}
        >
          <Camera className="h-4 w-4" />
          Escanear otro producto
        </button>
      </div>
    </>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {/* Catálogo + buscador */}
      <div className="card flex flex-col p-3 sm:p-4">
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Buscar o escanear… (Enter agrega)"
              className="input pl-9"
              enterKeyHint="enter"
              autoComplete="off"
            />
          </div>

          {/* Cámara: alternativa al lector USB cuando se opera desde el celular */}
          <button
            onClick={() => setEscaneando(true)}
            className="btn-ghost shrink-0 px-3 lg:hidden"
            aria-label="Escanear con la cámara"
          >
            <Camera className="h-5 w-5" />
          </button>

          {/* Autocobrador */}
          <div className="group relative shrink-0">
            <button
              onClick={() => setAjustes({ autocobrador: !ajustes.autocobrador })}
              aria-pressed={ajustes.autocobrador}
              title="Autocobrador: con esto activo, apretar Enter en el buscador vacío teniendo productos en el carrito abre el cobro."
              className={`btn h-full border px-3 ${
                ajustes.autocobrador
                  ? "border-lime bg-lime/15 text-navy"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Zap className="h-5 w-5" strokeWidth={ajustes.autocobrador ? 2.4 : 2} />
            </button>
            <span role="tooltip" className="tip right-0 top-full mt-2">
              <b className="text-lime">Autocobrador {ajustes.autocobrador ? "activo" : "apagado"}.</b>{" "}
              Activa que, al apretar Enter con el buscador vacío y productos en el carrito, se pase
              directo a cobrar.
            </span>
          </div>
        </div>

        {/* auto-rows-fr + mt-auto en el pie: el precio queda SIEMPRE abajo a la
            derecha, sin importar si el nombre ocupa una o dos líneas. */}
        <div className="grid max-h-[58vh] auto-rows-fr grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((p) => {
            const usado = enCarrito.get(p.id) ?? 0;
            const restante = p.stock - usado;
            const agotado = restante <= 0;
            return (
              <button
                key={p.id}
                onClick={() => { setTicket(null); agregar(p); }}
                disabled={agotado}
                className="flex h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 p-3 text-left transition hover:border-lime hover:bg-lime/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="line-clamp-2 text-sm font-medium leading-tight">{p.nombre}</span>
                <span className="mt-1 font-mono text-[11px] text-slate-400">{p.sku}</span>
                <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                  <span className={`text-[11px] leading-tight ${agotado ? "text-rose-500" : "text-slate-400"}`}>
                    {agotado ? "sin stock" : `stock ${restante}`}
                  </span>
                  <span className="text-right text-base font-bold tabular-nums leading-none text-navy">
                    {money(p.precioVenta)}
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

      {/* Pedido: columna fija en escritorio */}
      <div className="card hidden h-fit flex-col p-4 lg:sticky lg:top-4 lg:flex">{panelPedido}</div>

      {/* Pedido en mobile: barra resumen + hoja deslizante */}
      {carrito.length > 0 && !pedidoAbierto && (
        <button
          onClick={() => setPedidoAbierto(true)}
          className="fixed inset-x-0 bottom-16 z-30 flex items-center justify-between gap-3 border-t border-lime/40 bg-navy px-4 py-3 text-white shadow-lg safe-mb lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm">
            <ShoppingCart className="h-4 w-4 text-lime" />
            {unidades} u.
          </span>
          <span className="text-lg font-bold tabular-nums text-lime">{money(total)}</span>
          <span className="flex items-center gap-1 text-sm font-semibold">
            Ver pedido <ChevronUp className="h-4 w-4" />
          </span>
        </button>
      )}

      {pedidoAbierto && (
        <div className="overlay lg:hidden" onClick={() => setPedidoAbierto(false)}>
          <div className="sheet p-4" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-ghost absolute right-4 top-4 px-2 py-1.5"
              onClick={() => setPedidoAbierto(false)}
              aria-label="Cerrar pedido"
            >
              <X className="h-4 w-4" />
            </button>
            {panelPedido}
          </div>
        </div>
      )}

      {/* El ticket recién cobrado también se avisa en mobile */}
      {ticket && carrito.length === 0 && (
        <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/80 p-4 text-emerald-700 lg:hidden">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Venta #{ticket.ventaId} cobrada</p>
            <p className="text-emerald-600">
              {ticket.items} u. · {money(ticket.total)} · {ETIQUETA_MEDIO[ticket.medioPago]}
            </p>
          </div>
        </div>
      )}

      {eligiendoPago && (
        <SelectorPago
          total={total}
          unidades={unidades}
          pendiente={pendiente}
          error={error}
          onSelect={confirmarPago}
          onClose={() => setEligiendoPago(false)}
        />
      )}

      {escaneando && (
        <BarcodeScanner
          onDetect={(c) => { porCodigo(c); setEscaneando(false); }}
          onClose={() => setEscaneando(false)}
          titulo="Escanear producto"
        />
      )}
    </div>
  );
}
