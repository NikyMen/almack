"use client";
import { Overlay } from "@/components/overlay";

import { ConfigProductoStock, MultiplicadorStock } from "@/components/stock-configuracion";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Sparkles, Loader2, Plus, Pencil, Trash2, Eye, EyeOff, ScanLine, Store, Settings2, Tag, Ellipsis, CopyCheck, Camera } from "lucide-react";
import type { Producto, Sucursal } from "@/db/schema";
import { vaciarStock, cargarProductosDuplicados, buscarCodigoStock } from "@/app/admin/(protected)/stock/actions";
import { money } from "@/lib/format";
import { FilterableTable, Col } from "@/components/filterable-table";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { CampoImagenProducto } from "@/components/product-image-input";
import { ControlDuplicados } from "@/components/stock-duplicados";
import { ajustarStock, crearProducto, editarProducto, eliminarProducto, accionDescripcion, togglePublicado, toggleOfertaTienda } from "@/app/actions";

/**
 * Producto con su stock ya resuelto para la vista actual:
 *   stockLocal   → lo que se muestra en la columna Stock (el total en "Todas",
 *                  lo del local si hay una sucursal abierta).
 *   porSucursal  → desglose completo, para el detalle y para los formularios.
 */
export type ProductoConStock = Producto & {
  alertaActiva: boolean; multiplicadorCosto: number | null;
  stockLocal: number;
  transitoLocal: number;
  porSucursal: Record<number, number>;
  transitoPorSucursal: Record<number, number>;
};

type Contexto = {
  administrador: boolean; multiplicadorGeneral: number | null;
  sucursales: Sucursal[];
  /** null = el panel está en "Todas": hay que preguntar a qué local va cada carga. */
  sucursalActivaId: number | null;
};

export function StockManager({
  items,
  totalProductos,
  totalResultados, paginaActual, paginas,
  sucursales,
  sucursalActivaId, administrador, multiplicadorGeneral,
}: { items: ProductoConStock[]; totalProductos: number; totalResultados: number; paginaActual: number; paginas: number } & Contexto) {
  const [configurando, setConfigurando] = useState<ProductoConStock | null>(null);
  const [open, setOpen] = useState(false);
  const [vaciando, setVaciando] = useState(false);
  const [controlDuplicados, setControlDuplicados] = useState(false);
  const [datosDuplicados, setDatosDuplicados] = useState<Awaited<ReturnType<typeof cargarProductosDuplicados>> | null>(null);
  const [cargandoDuplicados, setCargandoDuplicados] = useState(false);
  const [error, setError] = useState("");
  const [escaneandoStock, setEscaneandoStock] = useState(false);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState<string | null>(null);
  const [skuInicial, setSkuInicial] = useState("");
  const [productoEncontrado, setProductoEncontrado] = useState<ProductoConStock | null>(null);
  const [coincidencias, setCoincidencias] = useState<ProductoConStock[]>([]);
  const [editando, setEditando] = useState<ProductoConStock | null>(null);
  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  // Ajuste (+1/−1) pendiente de que el usuario diga en qué sucursal aplicarlo.
  const [ajuste, setAjuste] = useState<{ producto: ProductoConStock; delta: number } | null>(null);
  const [, startTransition] = useTransition();

  const ctx: Contexto = { sucursales, sucursalActivaId, administrador, multiplicadorGeneral };
  // El desglose por local solo aporta cuando estás mirando todo junto y hay
  // más de un local.
  const mostrarDesglose = sucursalActivaId === null && sucursales.length > 1;

  const toggleOculto = (id: number) =>
    setOcultos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Dentro de una sucursal el ajuste va derecho a ese local. En "Todas" no se
  // puede adivinar de dónde sacar la mercadería: se pregunta.
  function ajustar(p: ProductoConStock, delta: number) {
    if (sucursalActivaId) {
      startTransition(() => ajustarStock(p.id, delta, sucursalActivaId));
    } else if (sucursales.length <= 1) {
      startTransition(() => ajustarStock(p.id, delta, sucursales[0]?.id ?? null));
    } else {
      setAjuste({ producto: p, delta });
    }
  }

  function borrar(p: ProductoConStock) {
    if (!confirm(`¿Retirar "${p.nombre}" del inventario y de la venta? Se conservará su historial de movimientos.`)) return;
    setError("");
    startTransition(async () => {
      const resultado = await eliminarProducto(p.id);
      if (resultado && !resultado.ok) setError(resultado.error);
    });
  }

  async function abrirDuplicados(pagina = 1) {
    setCargandoDuplicados(true);
    setError("");
    try {
      setDatosDuplicados(await cargarProductosDuplicados(pagina));
      setControlDuplicados(true);
    } catch {
      setControlDuplicados(false);
      setError("No se pudo cargar el control de duplicados.");
    } finally {
      setCargandoDuplicados(false);
    }
  }

  async function procesarCodigo(codigo: string) {
    setEscaneandoStock(false);
    setBuscandoCodigo(true);
    setError("");
    try {
      const resultado = await buscarCodigoStock(codigo);
      if (!resultado.items.length) setCodigoNuevo(codigo);
      else if (resultado.items.length === 1) setProductoEncontrado(resultado.items[0]);
      else if (administrador && resultado.grupo) {
        setDatosDuplicados({ items: resultado.items, grupos: [resultado.grupo], paginaActual: 1, paginas: 1, ids: resultado.grupo.ids });
        setControlDuplicados(true);
      } else setCoincidencias(resultado.items);
    } catch {
      setError("No se pudo consultar el código escaneado. Intentá de nuevo.");
    } finally {
      setBuscandoCodigo(false);
    }
  }

  function acciones(p: ProductoConStock) {
    return <AccionesStock nombre={p.nombre}>
      <button className="btn-ghost w-full justify-start" onClick={() => ajustar(p, -1)}>− Quitar 1</button>
      <button className="btn-ghost w-full justify-start" onClick={() => ajustar(p, 1)}>+ Sumar 1</button>
      {administrador && <button className="btn-ghost w-full justify-start" onClick={() => setConfigurando(p)}><Settings2 className="h-4 w-4" /> Precio y alertas</button>}
      <button className="btn-ghost w-full justify-start" onClick={() => setEditando(p)}><Pencil className="h-4 w-4" /> Editar</button>
      <button className="btn-ghost w-full justify-start" onClick={() => startTransition(() => togglePublicado(p.id))}><Store className="h-4 w-4" /> {p.publicado ? "Ocultar de la tienda" : "Publicar en la tienda"}</button>
      <button className="btn-ghost w-full justify-start" onClick={() => startTransition(() => toggleOfertaTienda(p.id))}><Tag className="h-4 w-4" /> Alternar oferta</button>
      <button className="btn-ghost w-full justify-start" onClick={() => toggleOculto(p.id)}>{ocultos.has(p.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {ocultos.has(p.id) ? "Mostrar fila" : "Ocultar fila"}</button>
      {administrador && <button className="btn-ghost w-full justify-start text-rose-600" onClick={() => borrar(p)}><Trash2 className="h-4 w-4" /> Eliminar producto</button>}
    </AccionesStock>;
  }

  const cols: Col<ProductoConStock>[] = [
    { key: "sku", head: "SKU", width: 13, cell: (p) => <span className="font-mono text-xs text-slate-500">{p.sku}</span>, value: (p) => p.sku },
    { key: "nombre", head: "Producto", width: 21, cell: (p) => <span className="font-medium">{p.nombre}</span>, value: (p) => p.nombre },
    { key: "categoria", head: "Categoría", width: 10, cell: (p) => <span className="text-slate-500">{p.categoria}</span>, value: (p) => p.categoria ?? "General" },
    { key: "precio", head: "Costo / venta", width: 17, cell: (p) => <PreciosStock producto={p} />, value: (p) => p.precioVenta },
    {
      key: "stock", head: sucursalActivaId ? "Stock acá" : "Stock total", width: 10, value: (p) => p.stockLocal,
      cell: (p) => {
        const bajo = p.alertaActiva && p.stockLocal < p.stockMinimo;
        return (
          <span className={bajo ? "font-semibold text-rose-600" : "font-medium"}>
            {p.stockLocal} {p.unidadMedida === "kg" ? "kg" : "u"}{bajo && <span className="block text-xs text-rose-500">bajo</span>}
          </span>
        );
      },
    },
    { key: "transito", head: "En tránsito", width: 8, value: (p) => p.transitoLocal,
      cell: (p) => <span className={p.transitoLocal ? "rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800" : "text-slate-400"}>{p.transitoLocal}</span> },
    ...(mostrarDesglose
      ? [
          {
            key: "desglose", head: "Por sucursal", width: 12,
            cell: (p: ProductoConStock) => <Desglose producto={p} sucursales={sucursales} />,
            value: (p: ProductoConStock) => p.stockLocal,
          } satisfies Col<ProductoConStock>,
        ]
      : []),
    { key: "acciones", head: "Acciones", width: 9, cell: (p) => acciones(p) },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {administrador && <MultiplicadorStock valor={multiplicadorGeneral} />}
        <p className="mr-auto text-sm text-slate-500">{totalResultados} resultado(s) · página {paginaActual} de {paginas}</p>
        {administrador && <button className="btn-ghost" disabled={cargandoDuplicados} onClick={() => abrirDuplicados()}><CopyCheck className="h-4 w-4" /> {cargandoDuplicados ? "Cargando duplicados…" : "Control de duplicados"}</button>}
        <button type="button" className="btn-ghost border border-slate-200 px-3 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 lg:hidden" disabled={buscandoCodigo} onClick={() => setEscaneandoStock(true)} aria-label="Escanear código para consultar stock" title="Escanear código para consultar stock"><Camera className="h-4 w-4" /> <span className="sm:hidden">Escanear</span></button>
        {administrador && <button className="btn-ghost text-rose-600" disabled={!totalProductos} onClick={() => setVaciando(true)}><Trash2 className="h-4 w-4" /> Vaciar stock</button>}
        <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : <><Plus className="h-4 w-4" /> Nuevo producto</>}
        </button>
      </div>

      {open && <NuevoProducto key={skuInicial || "nuevo"} ctx={ctx} skuInicial={skuInicial} onDone={() => { setOpen(false); setSkuInicial(""); }} />}
      {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <FilterableTable
        compact
        showResultCount={false}
        rows={items}
        cols={cols}
        rowKey={(p) => p.id}
        rowClassName={(p) => (ocultos.has(p.id) ? "bg-slate-100 text-slate-400 opacity-60" : "")}
        mobileCard={(p) => {
          const bajo = p.alertaActiva && p.stockLocal < p.stockMinimo;
          return (
            <div>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                    {p.sku} · {p.categoria}
                  </p>
                </div>
              </div>
              <div className="mt-2"><PreciosStock producto={p} /></div>
              {mostrarDesglose && (
                <p className="mt-1 truncate text-[11px] text-slate-400">
                  {sucursales
                    .map((s) => `${s.nombre} ${p.porSucursal[s.id] ?? 0}`)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${bajo ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                  stock {p.stockLocal} {p.unidadMedida === "kg" ? "kg" : "u"}
                  {bajo && " · bajo"}
                  {p.transitoLocal > 0 && ` · tránsito ${p.transitoLocal}`}
                </span>
                {acciones(p)}
              </div>
            </div>
          );
        }}
      />

      {vaciando && <VaciarStock cantidad={totalProductos} cerrar={() => setVaciando(false)} />}
      {escaneandoStock && <BarcodeScanner titulo="Consultar stock" ayuda="Apuntá al código para buscar el artículo en todo el inventario." onDetect={procesarCodigo} onClose={() => setEscaneandoStock(false)} />}
      {codigoNuevo && <Overlay className="overlay" onClick={() => setCodigoNuevo(null)}><div className="sheet p-5 sm:max-w-md" role="dialog" aria-modal="true" aria-label="Código sin producto" onClick={e => e.stopPropagation()}><h2 className="text-lg font-semibold">Código sin producto</h2><p className="mt-2 text-sm text-slate-600">No encontramos un artículo con el código <strong className="break-all font-mono">{codigoNuevo}</strong>. ¿Querés crear uno nuevo con este código?</p><div className="mt-5 flex flex-wrap gap-2"><button className="btn-primary" onClick={() => { setSkuInicial(codigoNuevo); setOpen(true); setCodigoNuevo(null); }}>Crear artículo</button><button className="btn-ghost" onClick={() => setCodigoNuevo(null)}>Cancelar</button></div></div></Overlay>}
      {productoEncontrado && <Overlay className="overlay" onClick={() => setProductoEncontrado(null)}><div className="sheet p-5 sm:max-w-md" role="dialog" aria-modal="true" aria-label="Artículo encontrado" onClick={e => e.stopPropagation()}><h2 className="text-lg font-semibold">Artículo encontrado</h2><p className="mt-3 font-semibold">{productoEncontrado.nombre}</p><p className="mt-1 break-all font-mono text-sm text-slate-500">{productoEncontrado.sku}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><p>Stock: <strong>{productoEncontrado.stockLocal}</strong></p><p>En tránsito: <strong>{productoEncontrado.transitoLocal}</strong></p><p>Costo: <strong>{money(productoEncontrado.precioCompra)}</strong></p><p>Venta: <strong>{money(productoEncontrado.precioVenta)}</strong></p></div><div className="mt-5 flex gap-2"><button className="btn-primary" onClick={() => { setEditando(productoEncontrado); setProductoEncontrado(null); }}>Editar artículo</button><button className="btn-ghost" onClick={() => setProductoEncontrado(null)}>Cerrar</button></div></div></Overlay>}
      {coincidencias.length > 1 && <Overlay className="overlay" onClick={() => setCoincidencias([])}><div className="sheet p-5 sm:max-w-md" role="dialog" aria-modal="true" aria-label="Artículos con el mismo código" onClick={e => e.stopPropagation()}><h2 className="text-lg font-semibold">Código duplicado</h2><p className="mt-1 text-sm text-slate-500">{coincidencias.length} artículos comparten este código.</p><div className="mt-4 space-y-2">{coincidencias.map(p => <button key={p.id} className="btn-ghost w-full justify-between text-left" onClick={() => { setProductoEncontrado(p); setCoincidencias([]); }}><span>{p.nombre}</span><span>{p.stockLocal} en stock</span></button>)}</div><button className="btn-ghost mt-4" onClick={() => setCoincidencias([])}>Cerrar</button></div></Overlay>}
      {controlDuplicados && datosDuplicados && <ControlDuplicados key={datosDuplicados.paginaActual} items={datosDuplicados.items} grupos={datosDuplicados.grupos} pagina={datosDuplicados.paginaActual} paginas={datosDuplicados.paginas} cargando={cargandoDuplicados} onPagina={abrirDuplicados} onClose={() => setControlDuplicados(false)} onEdit={p => { setControlDuplicados(false); setEditando(p); }} />}
      {configurando && <ConfigProductoStock producto={configurando} global={multiplicadorGeneral} cerrar={() => setConfigurando(null)} />}
      {editando && <EditarProducto producto={editando} ctx={ctx} onDone={() => setEditando(null)} />}

      {ajuste && (
        <ElegirSucursal
          titulo={`${ajuste.delta > 0 ? "Sumar" : "Quitar"} 1 · ${ajuste.producto.nombre}`}
          ayuda={`¿En qué sucursal ${ajuste.delta > 0 ? "entra" : "sale"} la mercadería?`}
          sucursales={sucursales}
          detalle={(id) => `${ajuste.producto.porSucursal[id] ?? 0} en stock`}
          onElegir={(id) => {
            startTransition(() => ajustarStock(ajuste.producto.id, ajuste.delta, id));
            setAjuste(null);
          }}
          onCerrar={() => setAjuste(null)}
        />
      )}
    </>
  );
}

function AccionesStock({ nombre, children }: { nombre: string; children: ReactNode }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  return <>
    <button className="btn-ghost px-2" popoverTarget={id} title={"Acciones de " + nombre} aria-label={"Acciones de " + nombre} onClick={e => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (menu.current) {
        menu.current.style.left = Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)) + "px";
        menu.current.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 408)) + "px";
      }
    }}><Ellipsis className="h-4 w-4" /></button>
    <div id={id} ref={menu} popover="auto" className="fixed inset-auto m-0 w-60 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl" style={{ maxHeight: "calc(100dvh - 16px)" }} onClickCapture={e => {
      if (e.target instanceof Element && e.target.closest("button")) menu.current?.hidePopover();
    }}>{children}</div>
  </>;
}

function VaciarStock({ cantidad, cerrar }: { cantidad: number; cerrar: () => void }) {
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return <Overlay className="overlay" onClick={() => { if (!pendiente) cerrar(); }} onKeyDown={e => { if (e.key === "Escape" && !pendiente) cerrar(); }}>
    <form className="sheet p-6 sm:max-w-md" onClick={e => e.stopPropagation()} onSubmit={e => {
      e.preventDefault(); setError("");
      iniciar(async () => {
        try {
          const resultado = await vaciarStock(confirmacion, cantidad);
          if (!resultado.ok) setError(resultado.error); else cerrar();
        } catch { setError("No se pudo confirmar el vaciado. Actualizá la página antes de intentar nuevamente."); }
      });
    }}>
      <h3 className="text-lg font-semibold">Vaciar todo el stock</h3>
      <p className="mt-3 text-sm">Se retirarán los {cantidad} productos activos, incluidos los que tienen cantidad 0, y se eliminarán sus existencias de todas las sucursales. Incluye productos fuera de los filtros actuales.</p>
      <p className="mt-2 text-sm text-slate-500">Primero se guardará un respaldo en Stock → Respaldos. Las ventas, compras y movimientos conservarán su historial. Restaurar el respaldo no es automático.</p>
      <label className="label mt-4" htmlFor="confirmar-vaciado">Escribí VACIAR para confirmar</label>
      <input id="confirmar-vaciado" className="input" autoComplete="off" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} disabled={pendiente} />
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pendiente || confirmacion !== "VACIAR"}>{pendiente ? "Vaciando…" : "Vaciar todo el stock"}</button>
        <button type="button" className="btn-ghost" disabled={pendiente} onClick={cerrar}>Cancelar</button>
      </div>
    </form>
  </Overlay>;
}

function PreciosStock({ producto: p }: { producto: ProductoConStock }) {
  const unidad = p.unidadMedida === "kg" ? "kg" : "u";
  return <div className="space-y-1 text-xs tabular-nums">
    <p><span className="text-slate-500">Costo: </span><span className={p.precioCompra > 0 ? "" : "text-amber-700"}>{p.precioCompra > 0 ? `${money(p.precioCompra)} / ${unidad}` : "Sin cargar"}</span></p>
    <p><span className="text-slate-500">Venta: </span><span className="font-semibold">{money(p.precioVenta)} / {unidad}</span></p>
  </div>;
}

function Desglose({ producto, sucursales }: { producto: ProductoConStock; sucursales: Sucursal[] }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      {sucursales.map((s) => {
        const n = producto.porSucursal[s.id] ?? 0;
        return (
          <span
            key={s.id}
            title={s.nombre}
            className={`max-w-full text-xs ${n > 0 ? "text-slate-600" : "text-slate-400"}`}
          >
            {s.nombre}: <b className="ml-1 tabular-nums">{n}</b>
          </span>
        );
      })}
    </span>
  );
}

/** Diálogo corto: elegir el local sobre el que aplicar una acción. */
function ElegirSucursal({
  titulo,
  ayuda,
  sucursales,
  detalle,
  onElegir,
  onCerrar,
}: {
  titulo: string;
  ayuda: string;
  sucursales: Sucursal[];
  detalle?: (id: number) => string;
  onElegir: (id: number) => void;
  onCerrar: () => void;
}) {
  return (
    <Overlay className="overlay" onClick={onCerrar}>
      <div className="sheet p-6 sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{titulo}</h3>
        <p className="mt-1 text-sm text-slate-500">{ayuda}</p>
        <div className="mt-4 space-y-2">
          {sucursales.map((s) => (
            <button
              key={s.id}
              className="btn-ghost w-full justify-between"
              onClick={() => onElegir(s.id)}
            >
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4 text-slate-400" /> {s.nombre}
              </span>
              {detalle && <span className="text-xs text-slate-400">{detalle(s.id)}</span>}
            </button>
          ))}
        </div>
        <button className="btn-ghost mt-4 w-full" onClick={onCerrar}>Cancelar</button>
      </div>
    </Overlay>
  );
}

// El SKU casi siempre ya viene impreso como código de barras en el envase, así
// que además de tipearlo se puede leer con la cámara. Es el único campo
// controlado del formulario: el escáner necesita poder escribirle el valor.
function CampoSku({ p, inicial = "" }: { p?: Producto; inicial?: string }) {
  const id = useId();
  const [sku, setSku] = useState(p?.sku ?? inicial);
  const [escaneando, setEscaneando] = useState(false);

  return (
    <div>
      <label className="label" htmlFor={id}>SKU</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name="sku"
          className="input min-w-0 flex-1"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder={p ? undefined : "auto"}
        />
        <button
          type="button"
          className="btn-ghost shrink-0 px-3"
          onClick={() => setEscaneando(true)}
          aria-label="Escanear el SKU con la cámara"
          title="Escanear con la cámara"
        >
          <ScanLine className="h-4 w-4" />
        </button>
      </div>

      {escaneando && (
        <BarcodeScanner
          titulo="Escanear SKU"
          ayuda="Apuntá al código de barras del envase para cargar el SKU."
          onDetect={(codigo) => { setSku(codigo); setEscaneando(false); }}
          onClose={() => setEscaneando(false)}
        />
      )}
    </div>
  );
}

/**
 * Campo Stock + a qué sucursal corresponde.
 *
 * Si el panel está parado dentro de una sucursal no se pregunta nada: el local
 * viaja en un hidden. Si está en "Todas", se elige de una lista y el número que
 * se muestra es siempre el de ESE local (nunca el total), así guardar no
 * multiplica la mercadería.
 */
function CampoStock({ p, ctx }: { p?: ProductoConStock; ctx: Contexto }) {
  const { sucursales, sucursalActivaId } = ctx;
  const [sucursalId, setSucursalId] = useState<number>(
    sucursalActivaId ?? sucursales[0]?.id ?? 0
  );
  const cantidad = p ? p.porSucursal[sucursalId] ?? 0 : 0;
  const preguntar = sucursalActivaId === null && sucursales.length > 1;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="label">Stock{preguntar ? " en" : ""}</label>
        {/* key: al cambiar de local el input tiene que volver a arrancar con
            el número de ese local, no con el que quedó tipeado. */}
        <input
          key={sucursalId}
          name="stock"
          type="number"
          step="0.001"
          className="input"
          defaultValue={p ? cantidad : 0}
        />
      </div>
      <div>
        <label className="label">Mínimo</label>
        <input name="stockMinimo" disabled={!ctx.administrador} min="0" step="0.001" type="number" className="input" defaultValue={p?.stockMinimo ?? 5} />
      </div>
      {preguntar ? (
        <div className="col-span-2">
          <label className="label">Sucursal</label>
          <select
            name="sucursalId"
            className="input"
            value={sucursalId}
            onChange={(e) => setSucursalId(Number(e.target.value))}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {p ? ` · ${p.porSucursal[s.id] ?? 0} en stock` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="sucursalId" value={sucursalId || ""} />
      )}
    </div>
  );
}

// Campos compartidos por los formularios de alta y edición.
function CamposProducto({
  p,
  ctx,
  skuInicial,
  onArchivo,
}: {
  p?: ProductoConStock;
  ctx: Contexto;
  skuInicial?: string;
  onArchivo: (a: File | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div><label className="label">Nombre *</label><input name="nombre" className="input" defaultValue={p?.nombre} required /></div>
      <CampoSku p={p} inicial={skuInicial} />
      <div><label className="label">Categoría</label><input name="categoria" className="input" defaultValue={p?.categoria ?? ""} /></div>
      <div><label className="label">Se vende por</label><select name="unidadMedida" className="input" defaultValue={p?.unidadMedida ?? "unidad"}><option value="unidad">Unidad</option><option value="kg">Peso (kg, hasta 3 decimales)</option></select></div>
      <div><label className="label">Precio venta {p?.unidadMedida === "kg" ? "por kg" : "por unidad"}</label><input name="precioVenta" disabled={!ctx.administrador} type="number" step="0.01" className="input" defaultValue={p?.precioVenta ?? 0} /></div>
      <div><label className="label">Precio compra</label><input name="precioCompra" type="number" step="0.01" className="input" defaultValue={p?.precioCompra ?? 0} /></div>
      <CampoStock p={p} ctx={ctx} />
      <div className="md:col-span-3"><CampoImagenProducto valorInicial={p?.imagen ?? ""} onArchivo={onArchivo} /></div>
    </div>
  );
}

function EditarProducto({
  producto: p,
  ctx,
  onDone,
}: {
  producto: ProductoConStock;
  ctx: Contexto;
  onDone: () => void;
}) {
  // La foto no viaja en el <input type="file"> del form: se guarda acá y se
  // suma al FormData al enviar, así también funciona cuando se arrastró.
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState("");

  return (
    <Overlay className="overlay" onClick={onDone}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={async (fd) => {
          if (archivo) fd.set("imagenArchivo", archivo);
          const r = await editarProducto(p.id, fd);
          if (r?.ok === false) return setError(r.error);
          onDone();
        }}
        className="sheet p-6 sm:max-w-2xl"
      >
        <h3 className="mb-4 text-lg font-semibold">Editar producto</h3>
        <CamposProducto p={p} ctx={ctx} onArchivo={setArchivo} />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="submit" className="btn-primary">Guardar cambios</button>
          <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
        </div>
      </form>
    </Overlay>
  );
}

function NuevoProducto({ ctx, skuInicial, onDone }: { ctx: Contexto; skuInicial: string; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [descripcion, setDescripcion] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>('input[name="nombre"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Lee nombre/categoría directo del form: los campos quedan no controlados.
  async function generar(form: HTMLFormElement) {
    const fd = new FormData(form);
    const nombre = String(fd.get("nombre") || "").trim();
    if (!nombre) return setError("Escribí primero el nombre del producto.");
    setError("");
    setGenLoading(true);
    const r = await accionDescripcion(nombre, String(fd.get("categoria") || ""), descripcion);
    setGenLoading(false);
    if (r.ok) setDescripcion(r.texto);
    else setError(r.error);
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        if (archivo) fd.set("imagenArchivo", archivo);
        const r = await crearProducto(fd);
        if (r?.ok === false) return setError(r.error);
        onDone();
      }}
      className="card mb-4 scroll-mt-4 p-4"
    >
      <h2 className="mb-3 text-lg font-semibold">Nuevo producto</h2>
      <CamposProducto ctx={ctx} skuInicial={skuInicial} onArchivo={setArchivo} />

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0">Descripción</label>
          <button
            type="button"
            onClick={(e) => generar(e.currentTarget.form!)}
            disabled={genLoading}
            className="btn-ghost px-3 py-1 text-xs"
          >
            {genLoading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Generar con IA</>
            )}
          </button>
        </div>
        <textarea name="descripcion" rows={2} className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn-primary">Guardar producto</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}
