"use client";
import { Overlay } from "@/components/overlay";

import { ConfigProductoStock } from "@/components/stock-configuracion";
import { useId, useState, useTransition } from "react";
import { Sparkles, Loader2, Plus, Pencil, Trash2, Eye, EyeOff, ScanLine, Store, Settings2, Tag } from "lucide-react";
import type { Producto, Sucursal } from "@/db/schema";
import { money } from "@/lib/format";
import { FilterableTable, Col } from "@/components/filterable-table";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { CampoImagenProducto } from "@/components/product-image-input";
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
  sucursales,
  sucursalActivaId, administrador, multiplicadorGeneral,
}: { items: ProductoConStock[] } & Contexto) {
  const [configurando, setConfigurando] = useState<ProductoConStock | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
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

  const cols: Col<ProductoConStock>[] = [
    { key: "sku", head: "SKU", cell: (p) => <span className="font-mono text-xs text-slate-500">{p.sku}</span>, value: (p) => p.sku },
    { key: "nombre", head: "Producto", className: "min-w-48 max-w-72", cell: (p) => <span className="font-medium">{p.nombre}</span>, value: (p) => p.nombre },
    { key: "categoria", head: "Categoría", cell: (p) => <span className="text-slate-500">{p.categoria}</span>, value: (p) => p.categoria ?? "General", filter: true },
    { key: "precio", head: "Precio", className: "whitespace-nowrap", cell: (p) => <>{money(p.precioVenta)} / {p.unidadMedida === "kg" ? "kg" : "u"}</>, value: (p) => p.precioVenta, sort: true },
    {
      key: "stock", head: sucursalActivaId ? "Stock acá" : "Stock total", className: "whitespace-nowrap", value: (p) => p.stockLocal, sort: true,
      cell: (p) => {
        const bajo = p.alertaActiva && p.stockLocal < p.stockMinimo;
        return (
          <span className={bajo ? "font-semibold text-rose-600" : "font-medium"}>
            {p.stockLocal} {p.unidadMedida === "kg" ? "kg" : "u"}{bajo && <span className="ml-2 text-xs text-rose-500">bajo</span>}
          </span>
        );
      },
    },
    { key: "transito", head: "En tránsito", value: (p) => p.transitoLocal, sort: true,
      cell: (p) => <span className={p.transitoLocal ? "rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800" : "text-slate-400"}>{p.transitoLocal}</span> },
    ...(mostrarDesglose
      ? [
          {
            key: "desglose", head: "Por sucursal",
            cell: (p: ProductoConStock) => <Desglose producto={p} sucursales={sucursales} />,
            value: (p: ProductoConStock) => p.stockLocal,
          } satisfies Col<ProductoConStock>,
        ]
      : []),
    // La columna "Tienda" (publicar/despublicar) se sacó junto con el módulo de
    // Tienda online. El dato `publicado` sigue en la DB intacto.
    {
      key: "acciones", head: "Acciones",
      cell: (p) => (
        <div className="flex min-w-72 flex-nowrap items-center gap-1">
          <button className="btn-ghost px-2 py-1" title="Quitar 1" onClick={() => ajustar(p, -1)}>−</button>
          <button className="btn-ghost px-2 py-1" title="Sumar 1" onClick={() => ajustar(p, 1)}>+</button>
          {administrador && <button className="btn-ghost px-2 py-1" title="Precio y alertas" aria-label={`Precio y alertas de ${p.nombre}`} onClick={() => setConfigurando(p)}><Settings2 className="h-3.5 w-3.5" /></button>}
          <button className="btn-ghost px-2 py-1" title="Editar" onClick={() => setEditando(p)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn-ghost px-2 py-1" title={p.publicado ? "Ocultar de la tienda" : "Publicar en la tienda"} aria-label={p.publicado ? "Ocultar de la tienda" : "Publicar en la tienda"} onClick={() => startTransition(() => togglePublicado(p.id))}><Store className={`h-3.5 w-3.5 ${p.publicado ? "text-emerald-600" : ""}`} /></button>
          <button className="btn-ghost px-2 py-1" title="Alternar oferta" aria-label="Alternar oferta" onClick={() => startTransition(() => toggleOfertaTienda(p.id))}><Tag className="h-3.5 w-3.5" /></button>
          {administrador && <button className="btn-ghost px-2 py-1 text-rose-600" title="Eliminar" onClick={() => borrar(p)}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      ),
    },
    {
      key: "ocultar", head: "",
      cell: (p) => {
        const oculto = ocultos.has(p.id);
        return (
          <button
            className="btn-ghost px-2 py-1"
            title={oculto ? "Mostrar fila" : "Ocultar fila"}
            onClick={() => toggleOculto(p.id)}
          >
            {oculto ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        );
      },
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : <><Plus className="h-4 w-4" /> Nuevo producto</>}
        </button>
      </div>

      {open && <NuevoProducto ctx={ctx} onDone={() => setOpen(false)} />}
      {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <FilterableTable
        rows={items}
        cols={cols}
        rowKey={(p) => p.id}
        rowClassName={(p) => (ocultos.has(p.id) ? "bg-slate-100 text-slate-400 opacity-60" : "")}
        search={(p) => `${p.sku} ${p.nombre} ${p.categoria} ${p.precioVenta}`}
        searchPlaceholder="Buscar producto por nombre, SKU, categoría…"
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
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.precioVenta)}</span>
              </div>
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
                <div className="flex flex-wrap items-center gap-1">
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Quitar una unidad" onClick={() => ajustar(p, -1)}>−</button>
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Sumar una unidad" onClick={() => ajustar(p, 1)}>+</button>
                  {administrador && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfigurando(p)}>Precio y alertas</button>}
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Editar producto" onClick={() => setEditando(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost px-2.5 py-1.5 text-xs" aria-label="Publicar u ocultar en tienda" onClick={() => startTransition(() => togglePublicado(p.id))}>{p.publicado ? "Ocultar" : "Publicar"}</button>
                  {administrador && <button
                    className="btn-ghost px-2.5 py-1.5 text-rose-600"
                    aria-label="Eliminar producto"
                    onClick={() => borrar(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>}
                </div>
              </div>
            </div>
          );
        }}
      />

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

function Desglose({ producto, sucursales }: { producto: ProductoConStock; sucursales: Sucursal[] }) {
  return (
    <span className="flex min-w-36 flex-col gap-1 whitespace-nowrap">
      {sucursales.map((s) => {
        const n = producto.porSucursal[s.id] ?? 0;
        return (
          <span
            key={s.id}
            title={s.nombre}
            className={`badge ${n > 0 ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300"}`}
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
function CampoSku({ p }: { p?: Producto }) {
  const id = useId();
  const [sku, setSku] = useState(p?.sku ?? "");
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
  onArchivo,
}: {
  p?: ProductoConStock;
  ctx: Contexto;
  onArchivo: (a: File | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div><label className="label">Nombre *</label><input name="nombre" className="input" defaultValue={p?.nombre} required /></div>
      <CampoSku p={p} />
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

function NuevoProducto({ ctx, onDone }: { ctx: Contexto; onDone: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

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
      action={async (fd) => {
        if (archivo) fd.set("imagenArchivo", archivo);
        const r = await crearProducto(fd);
        if (r?.ok === false) return setError(r.error);
        onDone();
      }}
      className="card mb-6 p-5"
    >
      <CamposProducto ctx={ctx} onArchivo={setArchivo} />

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
        <textarea name="descripcion" rows={4} className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn-primary">Guardar producto</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}
