"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Plus, X, ImagePlus, ScanText, Loader2, History, Pencil, Trash2, Save, ImageOff,
} from "lucide-react";
import { FilterableTable, Col } from "@/components/filterable-table";
import { Estado } from "@/components/ui";
import { money, fecha, fechaHora } from "@/lib/format";
import { ESTADOS_COMPRA, ETIQUETA_ESTADO } from "@/lib/compras";
import type { Compra, CompraHistorial } from "@/db/schema";
import { crearCompra } from "@/app/actions";
import {
  subirImagenCompra, transcribirImagenCompra, editarCompra, cambiarEstadoCompra,
  eliminarCompra, historialCompra,
} from "@/app/(app)/compras/actions";

export function ComprasTabla({ compras }: { compras: Compra[] }) {
  const [nueva, setNueva] = useState(false);
  const [detalle, setDetalle] = useState<Compra | null>(null);
  const router = useRouter();

  // El detalle abierto se sincroniza con lo que llega del servidor tras cada
  // revalidate, así el panel nunca muestra datos viejos.
  useEffect(() => {
    if (!detalle) return;
    const actualizada = compras.find((c) => c.id === detalle.id);
    if (!actualizada) setDetalle(null);
    else if (actualizada !== detalle) setDetalle(actualizada);
  }, [compras, detalle]);

  const cols: Col<Compra>[] = [
    { key: "id", head: "#", cell: (c) => <span className="text-slate-400">#{c.id}</span>, value: (c) => c.id, sort: true },
    {
      key: "imagen",
      head: "",
      cell: (c) =>
        c.imagen ? (
          <Image src={c.imagen} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
            <ImageOff className="h-4 w-4" />
          </span>
        ),
    },
    { key: "proveedor", head: "Proveedor", cell: (c) => <span className="font-medium">{c.proveedor}</span>, value: (c) => c.proveedor, filter: true },
    { key: "estado", head: "Estado", cell: (c) => <Estado value={c.estado} />, value: (c) => ETIQUETA_ESTADO[c.estado] ?? c.estado, filter: true },
    { key: "fecha", head: "Fecha", cell: (c) => <span className="text-slate-500">{fecha(c.fecha)}</span>, value: (c) => (c.fecha instanceof Date ? c.fecha.getTime() : Number(c.fecha)), sort: true },
    { key: "total", head: "Total", cell: (c) => <span className="font-semibold tabular-nums">{money(c.total)}</span>, value: (c) => c.total, sort: true, className: "font-semibold" },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setNueva((v) => !v)}>
          {nueva ? "Cerrar" : <><Plus className="h-4 w-4" /> Nueva compra</>}
        </button>
      </div>

      {nueva && <NuevaCompra onDone={() => setNueva(false)} />}

      <FilterableTable
        rows={compras}
        cols={cols}
        rowKey={(c) => c.id}
        search={(c) => `${c.id} ${c.proveedor} ${ETIQUETA_ESTADO[c.estado] ?? c.estado} ${c.total} ${c.detalle}`}
        searchPlaceholder="Buscar por proveedor, estado, total…"
        onRowClick={(c) => setDetalle(c)}
        mobileCard={(c) => (
          <div className="flex items-center gap-3">
            {c.imagen ? (
              <Image src={c.imagen} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                <ImageOff className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.proveedor}</p>
              <p className="mt-0.5 text-xs text-slate-400">#{c.id} · {fecha(c.fecha)}</p>
              <div className="mt-1"><Estado value={c.estado} /></div>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{money(c.total)}</span>
          </div>
        )}
      />

      {detalle && (
        <DetalleCompra compra={detalle} onClose={() => setDetalle(null)} onCambio={() => router.refresh()} />
      )}
    </>
  );
}

function NuevaCompra({ onDone }: { onDone: () => void }) {
  return (
    <form action={async (fd) => { await crearCompra(fd); onDone(); }} className="card mb-6 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label">Proveedor *</label>
          <input name="proveedor" className="input" required />
        </div>
        <div>
          <label className="label">Total</label>
          <input name="total" type="number" step="0.01" inputMode="decimal" className="input" defaultValue={0} />
        </div>
        <div>
          <label className="label">Estado</label>
          <select name="estado" className="input" defaultValue="pedido">
            {ESTADOS_COMPRA.map((e) => (
              <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="label">Detalle (opcional)</label>
        <textarea name="detalle" rows={2} className="input resize-y" placeholder="Ítems, número de remito, observaciones…" />
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn-primary">Guardar compra</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Después de crearla, abrila para adjuntar la foto del remito y transcribirla con IA.
      </p>
    </form>
  );
}

function DetalleCompra({
  compra,
  onClose,
  onCambio,
}: {
  compra: Compra;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [historial, setHistorial] = useState<CompraHistorial[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, startTransition] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    historialCompra(compra.id).then((h) => vigente && setHistorial(h));
    return () => { vigente = false; };
  }, [compra.id]);

  function refrescar() {
    onCambio();
    historialCompra(compra.id).then(setHistorial);
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setAviso("");
    setSubiendo(true);
    const fd = new FormData();
    fd.append("imagen", file);
    const r = await subirImagenCompra(compra.id, fd);
    setSubiendo(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return setError(r.error);
    refrescar();
  }

  function transcribir(reemplazar = false) {
    setError("");
    setAviso("");
    startTransition(async () => {
      const r = await transcribirImagenCompra(compra.id, reemplazar);
      if (!r.ok) {
        // No pisamos un detalle ya cargado sin preguntar.
        if ("requiereConfirmacion" in r && r.requiereConfirmacion) {
          if (confirm("Esta compra ya tiene un detalle cargado. ¿Reemplazarlo con la transcripción?")) {
            transcribir(true);
          }
          return;
        }
        return setError(r.error);
      }
      setAviso("Imagen transcripta al detalle.");
      refrescar();
    });
  }

  function cambiarEstado(estado: string) {
    setError("");
    startTransition(async () => {
      const r = await cambiarEstadoCompra(compra.id, estado);
      if (!r.ok) return setError(r.error);
      refrescar();
    });
  }

  function borrar() {
    if (!confirm(`¿Eliminar la compra #${compra.id} de ${compra.proveedor}? No se puede deshacer.`)) return;
    startTransition(async () => {
      await eliminarCompra(compra.id);
      onCambio();
      onClose();
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sm:max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{compra.proveedor}</h3>
            <p className="text-sm text-slate-500">
              Compra #{compra.id} · {fecha(compra.fecha)} · {money(compra.total)}
            </p>
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* Estado: un toque lo cambia, y cada cambio queda auditado */}
          <section>
            <p className="label">Estado</p>
            <div className="flex flex-wrap gap-2">
              {ESTADOS_COMPRA.map((e) => {
                const activo = compra.estado === e;
                return (
                  <button
                    key={e}
                    disabled={ocupado}
                    onClick={() => cambiarEstado(e)}
                    className={`badge border px-3 py-1.5 transition disabled:opacity-50 ${
                      activo ? "border-lime bg-lime/15 text-navy" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {ETIQUETA_ESTADO[e]}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Comprobante */}
          <section>
            <p className="label">Comprobante</p>
            {compra.imagen ? (
              <a href={compra.imagen} target="_blank" rel="noreferrer" className="block">
                <Image
                  src={compra.imagen}
                  alt={`Comprobante de la compra #${compra.id}`}
                  width={800}
                  height={600}
                  unoptimized
                  className="max-h-72 w-full rounded-xl border border-slate-200 object-contain"
                />
              </a>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                Todavía no hay ninguna foto del remito.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {/* capture="environment" abre la cámara trasera directo en el celular */}
              <input
                ref={fileRef}
                id={`img-compra-${compra.id}`}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onArchivo}
              />
              <label htmlFor={`img-compra-${compra.id}`} className="btn-ghost cursor-pointer">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {compra.imagen ? "Cambiar imagen" : "Agregar imagen"}
              </label>

              <button className="btn-primary" disabled={!compra.imagen || ocupado} onClick={() => transcribir()}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                Transcribir imagen
              </button>
            </div>
          </section>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

          {/* Detalle + edición */}
          {editando ? (
            <form
              action={async (fd) => {
                setError("");
                const r = await editarCompra(compra.id, fd);
                if (!r.ok) return setError(r.error);
                setEditando(false);
                refrescar();
              }}
              className="space-y-4 rounded-xl border border-slate-200 p-4"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Proveedor *</label>
                  <input name="proveedor" className="input" defaultValue={compra.proveedor} required />
                </div>
                <div>
                  <label className="label">Total</label>
                  <input name="total" type="number" step="0.01" inputMode="decimal" className="input" defaultValue={compra.total} />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select name="estado" className="input" defaultValue={compra.estado}>
                    {ESTADOS_COMPRA.map((e) => (
                      <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Detalle</label>
                <textarea name="detalle" rows={8} className="input resize-y font-mono text-xs" defaultValue={compra.detalle} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  <Save className="h-4 w-4" /> Guardar cambios
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <section>
              <div className="mb-1 flex items-center justify-between">
                <p className="label mb-0">Detalle</p>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditando(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
              </div>
              {compra.detalle ? (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                  {compra.detalle}
                </pre>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                  Sin detalle. Podés escribirlo a mano o transcribir la imagen.
                </p>
              )}
            </section>
          )}

          {/* Auditoría */}
          <section>
            <p className="label flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Historial de cambios
            </p>
            {historial === null ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </p>
            ) : historial.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no se editó nada en esta compra.</p>
            ) : (
              <ol className="space-y-2 border-l border-slate-200 pl-4">
                {historial.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-lime" />
                    <p className="break-words text-slate-700">
                      <b className="font-medium">{h.campo}</b>{" "}
                      <span className="text-slate-400 line-through">{h.antes || "—"}</span>{" "}
                      <span aria-hidden>→</span> <span className="font-medium">{h.despues || "—"}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {fechaHora(h.creadoEn)} · {h.usuarioNombre || "—"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <button className="btn-ghost w-full justify-center text-rose-600" disabled={ocupado} onClick={borrar}>
            <Trash2 className="h-4 w-4" /> Eliminar compra
          </button>
        </div>
      </div>
    </div>
  );
}
