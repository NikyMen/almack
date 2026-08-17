"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import type { Producto } from "@/db/schema";
import { money } from "@/lib/format";
import { FilterableTable, Col } from "@/components/filterable-table";
import { ajustarStock, crearProducto, editarProducto, eliminarProducto, accionDescripcion, togglePublicado, toggleOfertaTienda } from "@/app/actions";

export function StockManager({ items }: { items: Producto[] }) {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  const toggleOculto = (id: number) =>
    setOcultos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const cols: Col<Producto>[] = [
    { key: "sku", head: "SKU", cell: (p) => <span className="font-mono text-xs text-slate-500">{p.sku}</span>, value: (p) => p.sku },
    { key: "nombre", head: "Producto", cell: (p) => <span className="font-medium">{p.nombre}</span>, value: (p) => p.nombre },
    { key: "categoria", head: "Categoría", cell: (p) => <span className="text-slate-500">{p.categoria}</span>, value: (p) => p.categoria ?? "General", filter: true },
    { key: "precio", head: "Precio", cell: (p) => money(p.precioVenta), value: (p) => p.precioVenta, sort: true },
    {
      key: "stock", head: "Stock", value: (p) => p.stock, sort: true,
      cell: (p) => {
        const bajo = p.stock < p.stockMinimo;
        return (
          <span className={bajo ? "font-semibold text-rose-600" : "font-medium"}>
            {p.stock}{bajo && <span className="ml-2 text-xs text-rose-500">bajo</span>}
          </span>
        );
      },
    },
    // La columna "Tienda" (publicar/despublicar) se sacó junto con el módulo de
    // Tienda online. El dato `publicado` sigue en la DB intacto.
    {
      key: "acciones", head: "Acciones",
      cell: (p) => (
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2 py-1" title="Quitar 1" onClick={() => startTransition(() => ajustarStock(p.id, -1))}>−</button>
          <button className="btn-ghost px-2 py-1" title="Sumar 1" onClick={() => startTransition(() => ajustarStock(p.id, 1))}>+</button>
          <button className="btn-ghost px-2 py-1" title="Editar" onClick={() => setEditando(p)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn-ghost px-2 py-1 text-xs" title={p.publicado ? "Ocultar de la tienda" : "Publicar en la tienda"} onClick={() => startTransition(() => togglePublicado(p.id))}>{p.publicado ? "Ocultar" : "Publicar"}</button>
          <button className="btn-ghost px-2 py-1 text-xs" title="Alternar oferta" onClick={() => startTransition(() => toggleOfertaTienda(p.id))}>Oferta</button>
          <button className="btn-ghost px-2 py-1 text-rose-600" title="Eliminar" onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) startTransition(() => eliminarProducto(p.id)); }}><Trash2 className="h-3.5 w-3.5" /></button>
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

      {open && <NuevoProducto onDone={() => setOpen(false)} />}

      <FilterableTable
        rows={items}
        cols={cols}
        rowKey={(p) => p.id}
        rowClassName={(p) => (ocultos.has(p.id) ? "bg-slate-100 text-slate-400 opacity-60" : "")}
        search={(p) => `${p.sku} ${p.nombre} ${p.categoria} ${p.precioVenta}`}
        searchPlaceholder="Buscar producto por nombre, SKU, categoría…"
        mobileCard={(p) => {
          const bajo = p.stock < p.stockMinimo;
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
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-xs ${bajo ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                  stock {p.stock}
                  {bajo && " · bajo"}
                </span>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Quitar una unidad" onClick={() => startTransition(() => ajustarStock(p.id, -1))}>−</button>
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Sumar una unidad" onClick={() => startTransition(() => ajustarStock(p.id, 1))}>+</button>
                  <button className="btn-ghost px-2.5 py-1.5" aria-label="Editar producto" onClick={() => setEditando(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost px-2.5 py-1.5 text-xs" aria-label="Publicar u ocultar en tienda" onClick={() => startTransition(() => togglePublicado(p.id))}>{p.publicado ? "Ocultar" : "Publicar"}</button>
                  <button
                    className="btn-ghost px-2.5 py-1.5 text-rose-600"
                    aria-label="Eliminar producto"
                    onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) startTransition(() => eliminarProducto(p.id)); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        }}
      />

      {editando && <EditarProducto producto={editando} onDone={() => setEditando(null)} />}
    </>
  );
}

// Campos compartidos por los formularios de alta y edición.
function CamposProducto({ p }: { p?: Producto }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div><label className="label">Nombre *</label><input name="nombre" className="input" defaultValue={p?.nombre} required /></div>
      <div><label className="label">SKU</label><input name="sku" className="input" defaultValue={p?.sku} placeholder={p ? undefined : "auto"} /></div>
      <div><label className="label">Categoría</label><input name="categoria" className="input" defaultValue={p?.categoria ?? ""} /></div>
      <div><label className="label">Precio venta</label><input name="precioVenta" type="number" step="0.01" className="input" defaultValue={p?.precioVenta ?? 0} /></div>
      <div><label className="label">Precio compra</label><input name="precioCompra" type="number" step="0.01" className="input" defaultValue={p?.precioCompra ?? 0} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Stock</label><input name="stock" type="number" className="input" defaultValue={p?.stock ?? 0} /></div>
        <div><label className="label">Mínimo</label><input name="stockMinimo" type="number" className="input" defaultValue={p?.stockMinimo ?? 5} /></div>
      </div>
      <div className="md:col-span-3"><label className="label">Imagen para la tienda</label><input name="imagen" className="input" defaultValue={p?.imagen ?? ""} placeholder="https://... o /uploads/..." /></div>
    </div>
  );
}

function EditarProducto({ producto: p, onDone }: { producto: Producto; onDone: () => void }) {
  return (
    <div className="overlay" onClick={onDone}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={async (fd) => { await editarProducto(p.id, fd); onDone(); }}
        className="sheet p-6 sm:max-w-2xl"
      >
        <h3 className="mb-4 text-lg font-semibold">Editar producto</h3>
        <CamposProducto p={p} />
        <div className="mt-5 flex gap-2">
          <button type="submit" className="btn-primary">Guardar cambios</button>
          <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function NuevoProducto({ onDone }: { onDone: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");

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
    <form action={async (fd) => { await crearProducto(fd); onDone(); }} className="card mb-6 p-5">
      <CamposProducto />

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
