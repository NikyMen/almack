"use client";
import { Overlay } from "@/components/overlay";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, Zap, Camera, ChevronUp, X, Pencil, TriangleAlert,
  ListFilter,
} from "lucide-react";
import type { Producto } from "@/db/schema";
import { money, moneyPreciso } from "@/lib/format";
import { cobrarVenta } from "@/app/actions";
import { ETIQUETA_MEDIO, type MedioPago } from "@/lib/medios-pago";
import { useAjustes } from "@/lib/ajustes";
import { useNav } from "@/components/nav-context";
import { useCarrito, type Linea } from "@/components/carrito";
import { SelectorPago } from "@/components/selector-pago";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { usePromocionAutomatica } from "@/components/use-promocion-automatica";
import type { AjustePrecio } from "@/lib/caja";
import { ajusteVigente } from "@/lib/ajuste-carrito";
import { RightDrawer } from "@/components/right-drawer";

type Ticket = { ventaId: number; total: number; items: number; medioPago: MedioPago; efectivoRecibido: number | null; vuelto: number | null };

export function CajaPOS({ productos }: { productos: Producto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [eligiendoPago, setEligiendoPago] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [editandoPrecio, setEditandoPrecio] = useState<{ tipo: "producto" | "total"; productoId?: number } | null>(null);
  const [precioNuevo, setPrecioNuevo] = useState("");
  const [ajustePorConfirmar, setAjustePorConfirmar] = useState<AjustePrecio | null>(null);
  const [nombrePromocion, setNombrePromocion] = useState("");
  const [productosPromocion, setProductosPromocion] = useState<number[]>([]);
  const [actualizarStock, setActualizarStock] = useState(true);
  const [ajustePrecio, setAjustePrecio] = useState<AjustePrecio | null>(null);
  const [firmaAjuste, setFirmaAjuste] = useState("");
  const [pendiente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  const router = useRouter();

  const [ajustes, setAjustes] = useAjustes();
  const { configAbierta, menuAbierto } = useNav();
  const permitirSinStock = ajustes.permitirSinStock;
  const {
    carrito, error, setError, enCarrito, total, unidades,
    agregar, cambiarCantidad, quitar, vaciar, buscar, agregarPorCodigo, items,
  } = useCarrito(productos, permitirSinStock);
  const promocion = usePromocionAutomatica(carrito.map(l => ({ productoId: l.producto.id, cantidad: l.cantidad })));
  const firmaCarrito = carrito.map(l => `${l.producto.id}:${l.cantidad}`).join("|");
  const ajusteActivo = ajusteVigente(ajustePrecio, firmaAjuste, firmaCarrito, carrito.map(l => l.producto.id));
  useEffect(() => { if (ajustePrecio && !ajusteActivo) setAjustePrecio(null); }, [ajustePrecio, ajusteActivo]);
  const precioItem = (l: Linea) => ajusteActivo?.tipo === "producto" && ajusteActivo.productoId === l.producto.id ? ajusteActivo.precio! : l.producto.precioVenta;
  const totalVisible = ajusteActivo?.tipo === "total" ? ajusteActivo.precio! : ajusteActivo?.tipo === "producto" ? carrito.reduce((sum, l) => sum + precioItem(l) * l.cantidad, 0) : promocion?.total ?? total;
  function guardarAjuste(e: React.FormEvent) {
    e.preventDefault();
    const precio = Number(precioNuevo);
    if (!precioNuevo || !Number.isFinite(precio) || precio <= 0 || Math.abs(Math.round(precio * 100) - precio * 100) > 0.000001) { setError("Ingresá un importe válido con hasta dos decimales."); return; }
    if ((!actualizarStock || editandoPrecio?.tipo === "total") && !nombrePromocion.trim()) { setError("Indicá el nombre de la promoción."); return; }
    if (editandoPrecio?.tipo === "total" && productosPromocion.length === 0) { setError("Seleccioná los productos de la promoción."); return; }
    if (editandoPrecio?.tipo === "total" && precio >= (promocion?.total ?? total)) { setError("El total promocional debe ser menor al actual."); return; }
    if (editandoPrecio?.tipo === "total" && precio <= carrito.filter(l => !productosPromocion.includes(l.producto.id)).reduce((sum, l) => sum + l.producto.precioVenta * l.cantidad, 0)) { setError("El total debe cubrir los productos no incluidos en la promoción."); return; }
    if (editandoPrecio?.tipo === "producto" && !actualizarStock && precio >= (carrito.find(l => l.producto.id === editandoPrecio.productoId)?.producto.precioVenta ?? 0)) { setError("El precio promocional debe ser menor al precio del producto."); return; }
    if (!editandoPrecio) return;
    setAjustePorConfirmar({ tipo: editandoPrecio.tipo, productoId: editandoPrecio.productoId, precio, actualizarStock: editandoPrecio.tipo === "producto" && actualizarStock, nombrePromocion: nombrePromocion.trim(), productoIds: editandoPrecio.tipo === "total" ? productosPromocion : undefined });
    setError("");
  }
  function confirmarAjuste() {
    if (!ajustePorConfirmar) return;
    setAjustePrecio(ajustePorConfirmar);
    setFirmaAjuste(firmaCarrito);
    setAjustePorConfirmar(null);
    setEditandoPrecio(null);
  }

  const filtrados = catalogoAbierto ? buscar(busqueda) : [];

  useEffect(() => {
    if (catalogoAbierto && window.matchMedia("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus();
  }, [catalogoAbierto]);

  useEffect(() => {
    const captarTeclado = (event: KeyboardEvent) => {
      if (eligiendoPago || escaneando || pedidoAbierto || configAbierta || menuAbierto || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key.length !== 1 || event.key === " ") return;
      event.preventDefault();
      setCatalogoAbierto(true);
      inputRef.current?.focus();
      setBusqueda((prev) => prev + event.key);
    };
    document.addEventListener("keydown", captarTeclado);
    return () => document.removeEventListener("keydown", captarTeclado);
  }, [eligiendoPago, escaneando, pedidoAbierto, configAbierta, menuAbierto]);

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
    window.history.replaceState(null, "", "/admin/caja");
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

  function confirmarPago(medioPago: MedioPago, efectivoRecibido?: number) {
    if (carrito.length === 0) return;
    setError("");
    const pedido = items();
    const unidadesPedido = unidades;
    startTransition(async () => {
      const r = await cobrarVenta(pedido, medioPago, { permitirSinStock, efectivoRecibido, ajustePrecio: ajusteActivo ?? undefined });
      if (!r.ok) return setError(r.error);
      setTicket({ ventaId: r.ventaId, total: r.total, items: unidadesPedido, medioPago, efectivoRecibido: r.efectivoRecibido, vuelto: r.vuelto });
      vaciar();
      setAjustePrecio(null);
      setBusqueda("");
      setEligiendoPago(false);
      setPedidoAbierto(false);
      router.refresh();
    });
  }

  const panelPedido = (
    <>
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <ShoppingCart className="h-4 w-4 text-slate-500" />
        <h2 className="font-semibold">Pedido</h2>
        {unidades > 0 && <span className="badge ml-auto bg-lime/15 text-navy">{carrito.length} productos</span>}
      </div>

      {carrito.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          {ticket ? (
            <div className="flex flex-col items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
              <p className="font-semibold">¡Cobrado!</p>
              <p className="text-slate-500">
                Venta #{ticket.ventaId} · {ticket.items} productos · {moneyPreciso(ticket.total)}
              </p>
              <p className="text-xs text-slate-400">Pago: {ETIQUETA_MEDIO[ticket.medioPago]}</p>
              {ticket.vuelto !== null && <p className="text-sm font-semibold">Recibido: {moneyPreciso(ticket.efectivoRecibido ?? 0)} · Vuelto: {moneyPreciso(ticket.vuelto)}</p>}
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
                <p className="text-xs text-slate-400">{money(precioItem(l))} / {l.producto.unidadMedida === "kg" ? "kg" : "u"}</p>
                <button type="button" className="group mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-emerald-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" title={`Editar precio de ${l.producto.nombre}`} aria-label={`Editar precio de ${l.producto.nombre}`} onClick={() => { setEditandoPrecio({ tipo: "producto", productoId: l.producto.id }); setAjustePorConfirmar(null); setPrecioNuevo(String(precioItem(l))); setActualizarStock(true); setNombrePromocion(""); setError(""); }}><Pencil className="h-4 w-4 transition-transform group-hover:scale-110" /></button>
                {l.producto.precioCompra <= 0 && <p className="text-xs text-amber-700">Precio de costo no cargado</p>}
              </div>
              <div className="flex items-center gap-1">
                <button className="btn-ghost px-2 py-1.5" onClick={() => agregar(l.producto, l.producto.unidadMedida === "kg" ? -0.1 : -1)} aria-label={l.producto.unidadMedida === "kg" ? "Quitar 100 gramos" : "Quitar una unidad"}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <CantidadCarrito linea={l} cambiarCantidad={cambiarCantidad} />
                <button className="btn-ghost px-2 py-1.5" onClick={() => agregar(l.producto, l.producto.unidadMedida === "kg" ? 0.1 : 1)} aria-label={l.producto.unidadMedida === "kg" ? "Agregar 100 gramos" : "Agregar una unidad"}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="w-20 text-right text-sm font-semibold tabular-nums">
                {money(precioItem(l) * l.cantidad)}
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
        {!ajusteActivo && promocion && <p className="mb-2 text-sm text-emerald-700">{promocion.description}{promocion.discount > 0 ? ` · -${money(promocion.discount)}` : ""}</p>}
        {ajusteActivo && <div className="mb-2 flex items-center justify-between gap-2 text-xs text-emerald-700"><span>Cambio de precio pendiente · se aplicará al cobrar</span><button type="button" className="underline" onClick={() => setAjustePrecio(null)}>Quitar</button></div>}
        <div className="mb-3 flex items-end justify-between">
          <span className="flex items-center gap-1 text-sm text-slate-500">Total{carrito.length > 0 && <button type="button" className="group inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-emerald-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" title="Editar monto total" aria-label="Editar monto total" onClick={() => { setEditandoPrecio({ tipo: "total" }); setAjustePorConfirmar(null); setPrecioNuevo(String(totalVisible)); setActualizarStock(false); setNombrePromocion(""); setProductosPromocion(carrito.map(l => l.producto.id)); setError(""); }}><Pencil className="h-4 w-4 transition-transform group-hover:scale-110" /></button>}</span>
          <span className="text-2xl font-bold tabular-nums text-navy">{money(totalVisible)}</span>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1 justify-center py-3 text-base" disabled={carrito.length === 0 || pendiente} onClick={cobrar}>
            {pendiente ? <Loader2 className="h-5 w-5 animate-spin" /> : "Cobrar"}
          </button>
          {carrito.length > 0 && (
            <button className="btn-ghost" disabled={pendiente} onClick={() => { vaciar(); setAjustePrecio(null); }}>
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

  const catalogo = catalogoAbierto ? (
      <div className="card flex min-w-0 flex-col p-3 sm:p-4">
        <div className="mb-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
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

        {/* Las filas conservan su altura natural: el scroll limita el catálogo,
            sin comprimir los nombres para hacer entrar todos los productos. */}
        <div className="grid max-h-[58vh] min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] content-start gap-2 overflow-y-auto p-0.5">
          {filtrados.map((p) => {
            const usado = enCarrito.get(p.id) ?? 0;
            const restante = p.stock - usado;
            const agotado = !permitirSinStock && restante <= 0;
            return (
              <button
                key={p.id}
                onClick={() => { setTicket(null); agregar(p); setCatalogoAbierto(false); }}
                disabled={agotado}
                className="flex h-full min-h-32 min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 p-3 text-left transition hover:border-lime hover:bg-lime/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="min-h-10 shrink-0 break-words text-sm font-medium leading-5">{p.nombre}</span>
                <span className="mt-1 shrink-0 break-all font-mono text-[11px] leading-4 text-slate-400">{p.sku}</span>
                {p.precioCompra <= 0 && <span className="mt-1 text-xs text-amber-700">Precio de costo no cargado</span>}
                <div className="mt-auto flex shrink-0 flex-wrap items-end justify-between gap-2 pt-3">
                  <span className={`text-[11px] leading-tight ${agotado ? "text-rose-500" : "text-slate-400"}`}>
                    {restante <= 0 ? `stock ${restante}` : `stock ${restante} ${p.unidadMedida === "kg" ? "kg" : "u"}`}
                  </span>
                  <span className="text-right text-base font-bold tabular-nums leading-none text-navy">
                    {money(p.precioVenta)} / {p.unidadMedida === "kg" ? "kg" : "u"}
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
  ) : null;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex justify-end"><button type="button" className="btn-ghost border border-slate-200 bg-white shadow-sm transition hover:border-lime hover:bg-lime/10" onClick={() => setCatalogoAbierto(true)} aria-haspopup="dialog" aria-expanded={catalogoAbierto}><ListFilter className="h-4 w-4" /> Buscar productos</button></div>
      <RightDrawer title="Productos de caja" open={catalogoAbierto} onClose={() => setCatalogoAbierto(false)} width="max-w-xl">{catalogo}</RightDrawer>
      {carrito.length === 0 && !ticket && <div className="card px-5 py-12 text-center lg:hidden"><ShoppingCart className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-navy">El pedido está vacío</p><p className="mt-1 text-sm text-slate-500">Buscá un producto o escaneá su código para empezar.</p><button type="button" className="btn-primary mt-4" onClick={() => setCatalogoAbierto(true)}>Buscar productos</button></div>}

      {/* Pedido: columna fija en escritorio */}
      <div className="card hidden min-h-[24rem] min-w-0 flex-col p-5 lg:flex">{panelPedido}</div>

      {/* Pedido en mobile: barra resumen + hoja deslizante */}
      {carrito.length > 0 && !pedidoAbierto && (
        <button
          onClick={() => setPedidoAbierto(true)}
          className="fixed inset-x-0 bottom-16 z-30 flex items-center justify-between gap-3 border-t border-lime/40 bg-navy px-4 py-3 text-white shadow-lg safe-mb lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm">
            <ShoppingCart className="h-4 w-4 text-lime" />
            {carrito.length} productos
          </span>
          <span className="text-lg font-bold tabular-nums text-lime">{money(totalVisible)}</span>
          <span className="flex items-center gap-1 text-sm font-semibold">
            Ver pedido <ChevronUp className="h-4 w-4" />
          </span>
        </button>
      )}

      {pedidoAbierto && (
        <Overlay className="overlay" onClick={() => setPedidoAbierto(false)}>
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
        </Overlay>
      )}

      {/* El ticket recién cobrado también se avisa en mobile */}
      {ticket && carrito.length === 0 && (
        <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/80 p-4 text-emerald-700 lg:hidden">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Venta #{ticket.ventaId} cobrada</p>
            <p className="text-emerald-600">
              {ticket.items} u. · {moneyPreciso(ticket.total)} · {ETIQUETA_MEDIO[ticket.medioPago]}
            </p>
            {ticket.vuelto !== null && <p className="font-semibold">Vuelto: {moneyPreciso(ticket.vuelto)}</p>}
          </div>
        </div>
      )}

      {editandoPrecio && <Overlay className="overlay" onClick={() => { setEditandoPrecio(null); setAjustePorConfirmar(null); }}>
        {ajustePorConfirmar ? <div role="alertdialog" aria-modal="true" aria-labelledby="advertencia-precio" className="card mx-auto w-[min(92vw,440px)] space-y-4 p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3"><div className="rounded-full bg-amber-100 p-2 text-amber-800"><TriangleAlert className="h-5 w-5" /></div><div><h2 id="advertencia-precio" className="text-lg font-semibold">Confirmá el cambio de precio</h2><p className="mt-1 text-sm font-semibold text-amber-900">{ajustePorConfirmar.tipo === "total" ? "Nuevo total" : "Nuevo precio por unidad o kilo"}: {moneyPreciso(ajustePorConfirmar.precio ?? 0)}</p><p className="mt-1 text-sm text-slate-600">{ajustePorConfirmar.actualizarStock ? "Al cobrar, el precio del producto también se actualizará en Stock." : `Al cobrar, se creará la promoción «${ajustePorConfirmar.nombrePromocion}» y quedará activa.`} El cambio quedará registrado con el usuario y el medio de pago de la venta.</p></div></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAjustePorConfirmar(null)}>Volver</button><button type="button" className="btn-primary" onClick={confirmarAjuste}>Entendido, aplicar al pedido</button></div>
        </div> :
        <form onSubmit={guardarAjuste} className="card mx-auto max-h-[90vh] w-[min(92vw,440px)] space-y-4 overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{editandoPrecio.tipo === "total" ? "Cambiar monto total" : "Cambiar precio del producto"}</h2><button type="button" className="btn-ghost" onClick={() => setEditandoPrecio(null)} aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
          <label className="block text-sm">{editandoPrecio.tipo === "total" ? "Nuevo total de la venta" : "Nuevo precio por unidad o kilo"}<input className="input mt-1" type="number" min="0.01" step="0.01" required value={precioNuevo} onChange={e => setPrecioNuevo(e.target.value)} /></label>
          {editandoPrecio.tipo === "producto" && <div><p className="text-sm font-medium">Motivo del cambio</p><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={actualizarStock} onChange={() => setActualizarStock(true)} />Corregir precio en stock</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={!actualizarStock} onChange={() => setActualizarStock(false)} />Promoción no cargada</label></div>}
          {(editandoPrecio.tipo === "total" || !actualizarStock) && <label className="block text-sm">Nombre de la promoción<input className="input mt-1" maxLength={100} required value={nombrePromocion} onChange={e => setNombrePromocion(e.target.value)} /></label>}
          {editandoPrecio.tipo === "total" && <div><p className="text-sm font-medium">Productos de la promoción</p><div className="mt-2 max-h-32 space-y-1 overflow-auto">{carrito.map(l => <label className="flex items-center gap-2 text-sm" key={l.producto.id}><input type="checkbox" checked={productosPromocion.includes(l.producto.id)} onChange={e => setProductosPromocion(prev => e.target.checked ? [...prev, l.producto.id] : prev.filter(id => id !== l.producto.id))} />{l.producto.nombre} ({l.cantidad})</label>)}</div><p className="mt-1 text-xs text-slate-500">El descuento se asigna a los productos seleccionados.</p></div>}
          {editandoPrecio.tipo === "producto" && !actualizarStock && <p className="text-xs text-slate-500">La promoción incluirá {carrito.find(l => l.producto.id === editandoPrecio.productoId)?.producto.nombre} con la cantidad actual.</p>}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <button className="btn-primary w-full justify-center">Aplicar al pedido</button>
        </form>
        }
      </Overlay>}
      {eligiendoPago && (
        <SelectorPago
          total={totalVisible}
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


function CantidadCarrito({ linea, cambiarCantidad }: { linea: Linea; cambiarCantidad: (producto: Linea["producto"], cantidad: number) => void }) {
  const [texto, setTexto] = useState(String(linea.cantidad));
  useEffect(() => setTexto(String(linea.cantidad)), [linea.cantidad]);
  return <input className="input w-20 px-1 text-center text-sm" type="number"
    min={linea.producto.unidadMedida === "kg" ? "0.001" : "1"}
    step={linea.producto.unidadMedida === "kg" ? "0.001" : "1"}
    value={texto} onChange={e => setTexto(e.target.value)}
    onBlur={() => { cambiarCantidad(linea.producto, Number(texto)); setTexto(String(linea.cantidad)); }}
    aria-label={linea.producto.unidadMedida === "kg" ? "Cantidad en kilos" : "Cantidad en unidades"} />;
}
