"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ScanText, Plus, Trash2, Loader2, Search, AlertTriangle, PackagePlus,
  CheckCircle2, X, Link2, ListChecks, Save, ArrowRight, Upload,
} from "lucide-react";
import type { ImpactoLinea } from "@/lib/precios-stock";
import { money } from "@/lib/format";
import {
  ETIQUETA_LINEA, ESTILO_LINEA, parseCandidatos,
  type Candidato, type EstadoLinea, type ResumenRecepcion,
} from "@/lib/recepcion";
import type { Compra, CompraLinea } from "@/db/schema";
import {
  unificarLineasCompra, impactosRecepcion, importarArchivoCompra, lineasCompra, leerRemitoCompra, analizarDetalleCompra, agregarLineaCompra,
  actualizarLineaCompra, vincularLineaCompra, confirmarLineaCompra,
  eliminarLineaCompra, buscarProductosCompra, resumenRecepcion, aplicarRecepcion,
} from "@/app/admin/(protected)/compras/actions";

type Modo = "reemplazar" | "agregar";

/**
 * Borrador de recepción de una compra: acá se arma y se corrige lo que se va a
 * cargar al stock. Todo lo de esta pantalla es reversible; lo único que no lo
 * es está detrás del botón "Cargar al stock", que siempre pide confirmación.
 */
export function CompraRecepcion({ compra, onCambio }: { compra: Compra; onCambio: () => void }) {
  const [lineas, setLineas] = useState<CompraLinea[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [guardandoLineas, setGuardandoLineas] = useState(0);
  const guardadores = useRef(new Map<number, () => Promise<boolean>>());
  const [guardandoTodos, setGuardandoTodos] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [impactos, setImpactos] = useState<ImpactoLinea[]>([]);
  const [resumen, setResumen] = useState<ResumenRecepcion | null>(null);
  const [, startTransition] = useTransition();

  const cargar = useCallback(async () => {
    setLineas(await lineasCompra(compra.id));
  }, [compra.id]);

  useEffect(() => {
    let vigente = true;
    lineasCompra(compra.id).then((l) => vigente && setLineas(l));
    return () => { vigente = false; };
  }, [compra.id]);

  const pendientes = (lineas ?? []).filter((l) => !l.aplicado);
  const aplicadas = (lineas ?? []).filter((l) => l.aplicado);
  const cuenta = (e: EstadoLinea) => pendientes.filter((l) => l.estado === e).length;

  // Las dos lecturas (foto y detalle) comparten el mismo ida y vuelta: si ya
  // hay borrador, preguntamos si es otra hoja del remito o una foto mejor.
  async function leer(fuente: "imagen" | "detalle", modo?: Modo) {
    setError(""); setAviso(""); setLeyendo(true);
    const r = fuente === "imagen"
      ? await leerRemitoCompra(compra.id, modo)
      : await analizarDetalleCompra(compra.id, modo);
    setLeyendo(false);

    if (!r.ok) {
      if ("requiereConfirmacion" in r && r.requiereConfirmacion) {
        const sumar = confirm(
          `${r.error}\n\nAceptar = sumar lo nuevo al borrador (otra hoja del remito).\n` +
          `Cancelar = elegir si querés reemplazarlo.`
        );
        if (sumar) return leer(fuente, "agregar");
        if (confirm("¿Reemplazar el borrador pendiente por esta lectura?")) return leer(fuente, "reemplazar");
        return;
      }
      return setError(r.error);
    }

    await cargar();
    const s = r.sugerencias;
    const extra = s?.proveedor || s?.total
      ? ` En el comprobante dice: ${s.proveedor || "sin proveedor"}${s.total ? ` · total ${money(s.total)}` : ""}.`
      : "";
    setAviso(`Se leyeron ${r.lineas} renglones. Revisalos antes de cargar al stock.${extra}`);
  }

  async function guardarTodos() {
    setGuardandoTodos(true); setError(""); setAviso("");
    try {
      for (const guardar of Array.from(guardadores.current.values())) {
        if (!await guardar()) return;
      }
      const unificadas = await unificarLineasCompra(compra.id);
      await cargar();
      await abrirConfirmacion();
      if (unificadas) setAviso(`Se agruparon ${unificadas} renglones repetidos sumando sus cantidades. Revisá las unidades antes de confirmar: si subiste el mismo comprobante varias veces, corregí la cantidad.`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron guardar todos los registros."); }
    finally { setGuardandoTodos(false); }
  }

  async function abrirConfirmacion() {
    setError(""); setAviso("");
    try {
      setImpactos(await impactosRecepcion(compra.id));
      setResumen(await resumenRecepcion(compra.id));
    } catch (e) { setError((e as Error).message); }
  }

  async function aplicar(actualizarCosto: boolean, revalorizar: number[]) {
    setError(""); setAviso("");
    let r;
    try { r = await aplicarRecepcion(compra.id, { confirmado: true, actualizarCosto, revalorizar, impactos }); }
    catch { setResumen(null); setError("No se pudo confirmar la carga. Revisá la conexión e intentá nuevamente."); return; }
    if (!r.ok) { setResumen(null); return setError(r.error); }
    setResumen(null);
    await cargar();
    onCambio();
    setAviso(
      `Listo: ${r.unidades} unidades cargadas al stock · ${r.actualizados} productos existentes · ` +
      `${r.creados} productos nuevos creados (sin publicar).`
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0 flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" /> Carga al stock
        </p>
        {pendientes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className={`badge ${ESTILO_LINEA.match}`}>{cuenta("match")} ya en stock</span>
            <span className={`badge ${ESTILO_LINEA.duda}`}>{cuenta("duda")} a revisar</span>
            <span className={`badge ${ESTILO_LINEA.nuevo}`}>{cuenta("nuevo")} nuevos</span>
          </div>
        )}
      </div>

      <div className="mb-3 block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium">
        <span className="block">Subir ticket o documento</span>
        <label className="btn-primary mt-3 cursor-pointer gap-2 transition hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-emerald-600">
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {leyendo ? "Procesando comprobante…" : "Elegir comprobante"}
        <input type="file" className="sr-only" accept=".jpg,.jpeg,.png,.webp,.gif,.xlsx,.csv,.tsv,.docx,.txt" disabled={leyendo || guardandoTodos || guardandoLineas > 0}
          onChange={async e => {
            const archivo = e.target.files?.[0]; if (!archivo) return;
            const fd = new FormData(); fd.set("archivo", archivo);
            setLeyendo(true); setError(""); setAviso("");
            try {
              const r = await importarArchivoCompra(compra.id, fd);
              if (!r.ok) setError(r.error);
              else { await cargar(); setAviso(`${r.lineas} productos extraídos. Revisá los datos antes de confirmar.`); }
            } catch { setError("No se pudo procesar el archivo. Intentá nuevamente."); }
            finally { setLeyendo(false); e.target.value = ""; }
          }} />
        </label>
        <span className="mt-2 block text-xs font-normal text-slate-500">Foto, Excel (.xlsx), CSV, Word (.docx) o TXT · hasta 8 MB. Excel/CSV: Nombre, Código, Cantidad y Costo unitario. Cada archivo suma renglones al borrador.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={!compra.imagen || leyendo} onClick={() => leer("imagen")}>
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          Leer productos de la foto
        </button>
        <button className="btn-ghost" disabled={!compra.detalle.trim() || leyendo} onClick={() => leer("detalle")}>
          <ScanText className="h-4 w-4" /> Analizar detalle
        </button>
        <button className="btn-ghost" onClick={() => setAgregando((v) => !v)}>
          <Plus className="h-4 w-4" /> Agregar a mano
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Nada de esto toca el stock todavía. Se carga recién cuando confirmás, y solo suma unidades:
        no cambia si un producto está publicado u oculto.
      </p>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      {aviso && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

      {agregando && (
        <NuevaLinea
          compraId={compra.id}
          onDone={async (ok) => {
            setAgregando(false);
            if (ok) await cargar();
          }}
          onError={setError}
        />
      )}

      <div className="mt-4 space-y-2">
        {lineas === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando renglones…
          </p>
        ) : pendientes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
            No hay nada pendiente de cargar. Sacá la foto del remito y tocá “Leer productos de la foto”.
          </p>
        ) : (
          pendientes.map((l) => (
            <Fila
              key={l.id}
              linea={l}
              repetidas={pendientes.filter(p => l.codigo.trim() && p.codigo.trim() === l.codigo.trim()).length}
              bloqueado={guardandoTodos || leyendo}
              registrar={(id, guardar) => { if (guardar) guardadores.current.set(id, guardar); else guardadores.current.delete(id); }}
              onGuardando={delta => setGuardandoLineas(n => n + delta)}
              onCambio={cargar}
              onError={setError}
              startTransition={startTransition}
            />
          ))
        )}
      </div>

      {pendientes.length > 0 && (
        <button className="btn-primary mt-4 w-full justify-center gap-2 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-600" disabled={leyendo || guardandoTodos || guardandoLineas > 0} onClick={guardarTodos}>
          {guardandoTodos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar todos y revisar carga <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {aplicadas.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-500">
            {aplicadas.length} renglones ya cargados al stock
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {aplicadas.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">{l.descripcion}</span>
                <span className="ml-auto shrink-0 tabular-nums">+{l.cantidad}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {resumen && createPortal(
        <ConfirmarCarga impactos={impactos} resumen={resumen} onCancelar={() => setResumen(null)} onConfirmar={aplicar} />, document.body
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function NuevaLinea({
  compraId,
  onDone,
  onError,
}: {
  compraId: number;
  onDone: (ok: boolean) => void;
  onError: (e: string) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  return (
    <form
      className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setGuardando(true);
        const r = await agregarLineaCompra(compraId, {
          descripcion: String(fd.get("descripcion") || ""),
          cantidad: Number(fd.get("cantidad")),
          precioUnit: Number(fd.get("precioUnit")),
        });
        setGuardando(false);
        if (!r.ok) { onError(r.error); return onDone(false); }
        onDone(true);
      }}
    >
      <label className="text-xs font-medium text-slate-600">Producto / descripción<input name="descripcion" className="input mt-1" placeholder="Producto que faltó" required /></label>
      <label className="text-xs font-medium text-slate-600">Cantidad<input name="cantidad" type="number" min={1} className="input mt-1" defaultValue={1} /></label>
      <label className="text-xs font-medium text-slate-600">Costo unitario ($)<input name="precioUnit" type="number" min={0} step="0.01" inputMode="decimal" className="input mt-1" placeholder="0" /></label>
      <button type="submit" className="btn-primary" disabled={guardando}>
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function Fila({
  linea,
  onCambio,
  onError,
  startTransition,
  onGuardando,
  registrar,
  bloqueado,
  repetidas,
}: {
  linea: CompraLinea;
  onCambio: () => Promise<void>;
  onError: (e: string) => void;
  startTransition: (fn: () => void) => void;
  onGuardando: (delta: number) => void;
  registrar: (id: number, guardar: (() => Promise<boolean>) | null) => void;
  bloqueado: boolean;
  repetidas: number;
}) {
  // Los borradores locales se conservan cuando se guarda otra fila.
  const [codigo, setCodigo] = useState(linea.codigo);
  const [descripcion, setDescripcion] = useState(linea.descripcion);
  const [cantidad, setCantidad] = useState(String(linea.cantidad));
  const [precioUnit, setPrecioUnit] = useState(String(linea.precioUnit || ""));
  const recomendado = Math.round(Number(precioUnit || 0) * 2 * 100) / 100;
  const [ventaManual, setVentaManual] = useState(linea.precioVenta > 0 && linea.precioVenta !== Math.round(linea.precioUnit * 2 * 100) / 100);
  const [precioVenta, setPrecioVenta] = useState(String(linea.precioVenta || (linea.estado === "nuevo" ? linea.precioUnit * 2 : "")));
  const [buscando, setBuscando] = useState(false);
  const estado = linea.estado as EstadoLinea;
  const candidatos = parseCandidatos(linea.candidatos);

  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const snapshot = JSON.stringify([codigo, descripcion, cantidad, precioUnit, precioVenta]);
  const ultimoGuardado = useRef(JSON.stringify([linea.codigo, linea.descripcion, String(linea.cantidad), String(linea.precioUnit || ""), String(linea.precioVenta || "")]));
  const modificado = snapshot !== ultimoGuardado.current;
  useEffect(() => {
    // Una actualización de otra fila no debe borrar este borrador local.
    if (snapshot !== ultimoGuardado.current) return;
    const venta = String(linea.precioVenta || "");
    setCodigo(linea.codigo); setDescripcion(linea.descripcion);
    setCantidad(String(linea.cantidad)); setPrecioUnit(String(linea.precioUnit || ""));
    setPrecioVenta(venta);
    ultimoGuardado.current = JSON.stringify([linea.codigo, linea.descripcion, String(linea.cantidad), String(linea.precioUnit || ""), venta]);
  }, [linea]);
  useEffect(() => {
    registrar(linea.id, () => guardar(false));
    return () => registrar(linea.id, null);
  });

  async function guardar(refrescar = true): Promise<boolean> {
    if (!modificado) return true;
    setGuardando(true); setGuardado(false);
    onGuardando(1);
    try {
      const r = await actualizarLineaCompra(linea.id, {
        descripcion,
        codigo,
        cantidad: Number(cantidad),
        precioUnit: Number(precioUnit),
        precioVenta: Number(precioVenta),
      });
      if (!r.ok) { onError(r.error); return false; }
      ultimoGuardado.current = snapshot;
      setGuardado(true);
      if (refrescar) await onCambio();
      return true;
    } catch { onError("No se pudo guardar el renglón."); return false; }
    finally { setGuardando(false); onGuardando(-1); }
  }

  async function vincular(productoId: number | null) {
    if (!await guardar(false)) return;
    const r = await vincularLineaCompra(linea.id, productoId);
    setBuscando(false);
    if (!r.ok) return onError(r.error);
    await onCambio();
  }

  const vinculado = candidatos.find((c) => c.id === linea.productoId);

  return (
    <div className={`rounded-xl border p-3 ${estado === "duda" ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
      <label className="mb-3 block text-xs font-medium text-slate-600">Código / SKU<input disabled={bloqueado || guardando} className="input mt-1 font-mono text-xs" value={codigo} onChange={e => setCodigo(e.target.value)}  placeholder="Código / SKU" aria-label="Código del producto" /></label>
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end">
        <label className="text-xs font-medium text-slate-600">Producto / descripción
        <input
          className="input mt-1" disabled={bloqueado || guardando}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}

          aria-label="Producto"
        />
        </label>
        <label className="text-xs font-medium text-slate-600">Cantidad (unidades)
        <input
          className="input mt-1" disabled={bloqueado || guardando}
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}

          aria-label="Cantidad"
        />
        </label>
        <label className="text-xs font-medium text-slate-600">Costo unitario ($)
        <input
          className="input mt-1" disabled={bloqueado || guardando}
          type="number"
          step="0.01"
          inputMode="decimal"
          value={precioUnit}
          onChange={(e) => { setPrecioUnit(e.target.value); if (!ventaManual && estado === "nuevo") setPrecioVenta(String(Math.round(Number(e.target.value) * 2 * 100) / 100)); }}

          placeholder="Costo"
          aria-label="Costo unitario"
        />
        </label>
        <button
          className="btn-ghost px-2 py-1 text-rose-600"
          title="Sacar del borrador"
          aria-label={`Eliminar ${descripcion}`}
          disabled={bloqueado || guardando}
          onClick={() =>
            startTransition(async () => {
              const r = await eliminarLineaCompra(linea.id);
              if (!r.ok) return onError(r.error);
              await onCambio();
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {repetidas > 1 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Este código aparece en {repetidas} renglones. Al continuar se agrupan como un solo producto y se suman sus unidades. Si repetiste la foto, eliminá los renglones de más.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${ESTILO_LINEA[estado]}`}>{ETIQUETA_LINEA[estado]}</span>

        {linea.productoId !== null && (
          <span className="flex items-center gap-1 text-slate-500">
            <Link2 className="h-3 w-3" />
            {vinculado ? vinculado.nombre : `producto #${linea.productoId}`} · le suma {linea.cantidad} unidades
          </span>
        )}

        {estado === "nuevo" && (
          <label className="flex items-center gap-1.5 text-slate-600">
            <input
              type="checkbox"
              disabled={bloqueado || guardando}
              checked={linea.confirmado}
              onChange={(e) =>
                startTransition(async () => {
                  const r = await confirmarLineaCompra(linea.id, e.target.checked);
                  if (!r.ok) return onError(r.error);
                  await onCambio();
                })
              }
            />
            Confirmo que es un producto nuevo
          </label>
        )}

        <button className="btn-ghost px-2 py-0.5 text-xs" disabled={bloqueado || guardando} onClick={() => setBuscando((v) => !v)}>
          <Search className="h-3 w-3" /> {linea.productoId !== null ? "Cambiar producto" : "Buscar en stock"}
        </button>

        {linea.productoId !== null && (
          <button className="btn-ghost px-2 py-0.5 text-xs" disabled={bloqueado || guardando} onClick={() => vincular(null)}>
            Es uno nuevo
          </button>
        )}
      </div>

      {/* Los parecidos que encontró el sistema: acá se elige cuál era. */}
      {estado === "duda" && candidatos.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> ¿Es alguno de estos?
          </span>
          {candidatos.map((c) => (
            <button
              key={c.id}
              className="badge border border-amber-300 bg-white px-2 py-1 text-xs hover:bg-amber-100"
              disabled={bloqueado || guardando}
              onClick={() => vincular(c.id)}
            >
              {c.nombre} <span className="text-slate-400">{Math.round(c.score * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {estado === "nuevo" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Se va a crear sin publicar. Precio de venta ($):</span>
          <input
            className="input w-28 py-1" disabled={bloqueado || guardando}
            type="number"
            step="0.01"
            inputMode="decimal"
            value={precioVenta}
            onChange={(e) => { setVentaManual(true); setPrecioVenta(e.target.value); }}

            placeholder="0"
            aria-label="Precio de venta del producto nuevo"
          />
          <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={bloqueado || guardando} onClick={() => { setVentaManual(false); setPrecioVenta(String(recomendado)); }}>Usar recomendado: {money(recomendado)} (costo × 2)</button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className={`text-xs ${modificado ? "text-amber-700" : "text-emerald-700"}`} role="status">
          {guardando ? "Guardando…" : modificado ? "Cambios sin guardar" : guardado ? "Cambios guardados" : "Sin cambios pendientes"}
        </span>
        <button type="button" className="btn-ghost gap-2 transition hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm" disabled={!modificado || bloqueado || guardando} onClick={() => guardar()}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar registro
        </button>
      </div>
      {buscando && <BuscadorProducto onElegir={vincular} onCerrar={() => setBuscando(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuscadorProducto({
  onElegir,
  onCerrar,
}: {
  onElegir: (id: number) => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Candidato[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResultados([]); return; }
    let vigente = true;
    // Pequeño respiro para no consultar en cada tecla.
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarProductosCompra(q);
      if (vigente) { setResultados(r); setBuscando(false); }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          autoFocus
          className="input py-1 text-sm"
          placeholder="Buscar producto del stock…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-ghost px-2 py-1" onClick={onCerrar} aria-label="Cerrar buscador">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {buscando && <p className="mt-2 text-xs text-slate-400">Buscando…</p>}
      {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">No hay ningún producto parecido.</p>
      )}
      <ul className="mt-1 max-h-48 overflow-auto">
        {resultados.map((c) => (
          <li key={c.id}>
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={() => onElegir(c.id)}
            >
              <span className="truncate">{c.nombre}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-slate-400">{c.sku}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConfirmarCarga({
  impactos,
  resumen,
  onCancelar,
  onConfirmar,
}: {
  impactos: ImpactoLinea[];
  resumen: ResumenRecepcion;
  onCancelar: () => void;
  onConfirmar: (actualizarCosto: boolean, revalorizar: number[]) => Promise<void>;
}) {
  const [actualizarCosto, setActualizarCosto] = useState(true);
  const [revalorizar, setRevalorizar] = useState<number[]>([]);
  const [aplicando, setAplicando] = useState(false);
  const bloqueado = resumen.dudas > 0 || resumen.sinConfirmar > 0;

  return (
    <div className="overlay" onClick={() => !aplicando && onCancelar()}>
      <div className="sheet sm:max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold">Confirmá antes de cargar</h3>
          <p className="text-sm text-slate-500">Los registros ya están guardados. Para sumar las unidades al inventario, pulsá “Confirmar y cargar stock”.</p>
        </div>

        <div className="space-y-4 p-5 text-sm">
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Revisá las cantidades: los renglones del mismo código se agrupan sumando unidades. Si cargaste el comprobante más de una vez, cancelá y corregí la cantidad antes de confirmar.</p>
          <ul className="space-y-1.5">
            <li className="flex justify-between gap-3">
              <span>Productos que ya tenés</span>
              <b className="tabular-nums">
                {resumen.existentes.lineas} · +{resumen.existentes.unidades} u
              </b>
            </li>
            <li className="flex justify-between gap-3">
              <span>Productos nuevos a crear</span>
              <b className="tabular-nums">
                {resumen.nuevos.lineas} · +{resumen.nuevos.unidades} u
              </b>
            </li>
            <li className="flex justify-between gap-3 border-t border-slate-100 pt-1.5">
              <span>Costo total de lo que entra</span>
              <b className="tabular-nums">{money(resumen.costo)}</b>
            </li>
          </ul>

          <div className="max-h-72 space-y-2 overflow-auto">
            {impactos.map(i => <div key={i.lineaId} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold">{i.nombre} <span className="font-mono text-xs text-slate-400">{i.codigo}</span></p>
              <p className="mt-1 text-xs text-slate-500">Stock en destino: {i.stockAnterior} → {i.stockNuevo} unidades · Costo: {money(i.costoAnterior)} → {money(i.costoNuevo)}</p>
              {i.porcentaje !== null && Math.abs(i.porcentaje) > 0.000001 && <>
                <p className={`mt-2 text-sm ${i.porcentaje > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {i.porcentaje > 0 ? "Aumentó" : "Bajó"} un {Math.abs(i.porcentaje).toFixed(2)} % respecto de la anterior carga.
                  {i.sugerido !== null ? ` Para mantener el margen porcentual, el precio de venta sería ${money(i.sugerido)}.` : " Sin precio anterior de venta no se puede calcular un margen."}
                </p>
                {i.sugerido !== null && <label className="mt-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={revalorizar.includes(i.lineaId)} onChange={e => setRevalorizar(prev => e.target.checked ? [...prev, i.lineaId] : prev.filter(id => id !== i.lineaId))} />
                  Revalorizar de {money(i.ventaAnterior)} a {money(i.sugerido)}
                </label>}
              </>}
            </div>)}
          </div>
          {resumen.nuevos.nombres.length > 0 && (
            <div className="rounded-lg bg-violet-50 p-3">
              <p className="flex items-center gap-1.5 font-medium text-violet-800">
                <AlertTriangle className="h-4 w-4" /> Se van a crear estos productos
              </p>
              <ul className="mt-1.5 list-disc pl-5 text-violet-900">
                {resumen.nuevos.nombres.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <p className="mt-2 text-xs text-violet-700">
                Si alguno ya existía escrito distinto, cancelá y vinculalo al producto correcto:
                si no, te queda duplicado en el stock.
              </p>
            </div>
          )}

          {bloqueado && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-600">
              {resumen.dudas > 0 && `Quedan ${resumen.dudas} renglones a revisar. `}
              {resumen.sinConfirmar > 0 && `Quedan ${resumen.sinConfirmar} productos nuevos sin confirmar.`}
            </p>
          )}

          <label className="flex items-start gap-2 text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={actualizarCosto}
              onChange={(e) => setActualizarCosto(e.target.checked)}
            />
            <span>
              Actualizar también el precio de compra de los productos que ya existen.
              <span className="block text-xs text-slate-400">
                La revalorización de venta se elige individualmente arriba.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            className="btn-primary flex-1 justify-center gap-2 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-600"
            disabled={bloqueado || aplicando}
            onClick={async () => { setAplicando(true); try { await onConfirmar(actualizarCosto, revalorizar); } finally { setAplicando(false); } }}
          >
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Confirmar y cargar stock
          </button>
          <button className="btn-ghost" onClick={onCancelar} disabled={aplicando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
