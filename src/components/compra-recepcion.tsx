"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ScanText, Plus, Trash2, Loader2, Search, AlertTriangle, PackagePlus,
  CheckCircle2, X, Link2, ListChecks,
} from "lucide-react";
import { money } from "@/lib/format";
import {
  ETIQUETA_LINEA, ESTILO_LINEA, parseCandidatos,
  type Candidato, type EstadoLinea, type ResumenRecepcion,
} from "@/lib/recepcion";
import type { Compra, CompraLinea } from "@/db/schema";
import {
  lineasCompra, leerRemitoCompra, analizarDetalleCompra, agregarLineaCompra,
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
  const [agregando, setAgregando] = useState(false);
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

  async function abrirConfirmacion() {
    setError(""); setAviso("");
    setResumen(await resumenRecepcion(compra.id));
  }

  async function aplicar(actualizarCosto: boolean) {
    setResumen(null);
    setError(""); setAviso("");
    const r = await aplicarRecepcion(compra.id, { confirmado: true, actualizarCosto });
    if (!r.ok) return setError(r.error);
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
              onCambio={cargar}
              onError={setError}
              startTransition={startTransition}
            />
          ))
        )}
      </div>

      {pendientes.length > 0 && (
        <button className="btn-primary mt-4 w-full justify-center" onClick={abrirConfirmacion}>
          <PackagePlus className="h-4 w-4" /> Cargar {pendientes.length} renglones al stock…
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

      {resumen && (
        <ConfirmarCarga resumen={resumen} onCancelar={() => setResumen(null)} onConfirmar={aplicar} />
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
      className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_5rem_7rem_auto]"
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
      <input name="descripcion" className="input" placeholder="Producto que faltó (el renglón tachado…)" required />
      <input name="cantidad" type="number" min={1} className="input" placeholder="Cant." defaultValue={1} />
      <input name="precioUnit" type="number" step="0.01" inputMode="decimal" className="input" placeholder="Costo" />
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
}: {
  linea: CompraLinea;
  onCambio: () => Promise<void>;
  onError: (e: string) => void;
  startTransition: (fn: () => void) => void;
}) {
  // Los campos se editan en local y se guardan al salir del input: escribir no
  // tiene que pegarle a la base en cada tecla.
  const [descripcion, setDescripcion] = useState(linea.descripcion);
  const [cantidad, setCantidad] = useState(String(linea.cantidad));
  const [precioUnit, setPrecioUnit] = useState(String(linea.precioUnit || ""));
  const [precioVenta, setPrecioVenta] = useState(String(linea.precioVenta || ""));
  const [buscando, setBuscando] = useState(false);
  const estado = linea.estado as EstadoLinea;
  const candidatos = parseCandidatos(linea.candidatos);

  useEffect(() => {
    setDescripcion(linea.descripcion);
    setCantidad(String(linea.cantidad));
    setPrecioUnit(String(linea.precioUnit || ""));
    setPrecioVenta(String(linea.precioVenta || ""));
  }, [linea]);

  async function guardar() {
    const r = await actualizarLineaCompra(linea.id, {
      descripcion,
      cantidad: Number(cantidad),
      precioUnit: Number(precioUnit),
      precioVenta: Number(precioVenta),
    });
    if (!r.ok) return onError(r.error);
    await onCambio();
  }

  async function vincular(productoId: number | null) {
    const r = await vincularLineaCompra(linea.id, productoId);
    setBuscando(false);
    if (!r.ok) return onError(r.error);
    await onCambio();
  }

  const vinculado = candidatos.find((c) => c.id === linea.productoId);

  return (
    <div className={`rounded-xl border p-3 ${estado === "duda" ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_4.5rem_6rem_auto] sm:items-center">
        <input
          className="input"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          onBlur={guardar}
          aria-label="Producto"
        />
        <input
          className="input"
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          onBlur={guardar}
          aria-label="Cantidad"
        />
        <input
          className="input"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={precioUnit}
          onChange={(e) => setPrecioUnit(e.target.value)}
          onBlur={guardar}
          placeholder="Costo"
          aria-label="Costo unitario"
        />
        <button
          className="btn-ghost px-2 py-1 text-rose-600"
          title="Sacar del borrador"
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
              checked={linea.confirmado}
              onChange={(e) =>
                startTransition(async () => {
                  await confirmarLineaCompra(linea.id, e.target.checked);
                  await onCambio();
                })
              }
            />
            Confirmo que es un producto nuevo
          </label>
        )}

        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setBuscando((v) => !v)}>
          <Search className="h-3 w-3" /> {linea.productoId !== null ? "Cambiar producto" : "Buscar en stock"}
        </button>

        {linea.productoId !== null && (
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => vincular(null)}>
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
              onClick={() => vincular(c.id)}
            >
              {c.nombre} <span className="text-slate-400">{Math.round(c.score * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {estado === "nuevo" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Se va a crear sin publicar. Precio de venta (opcional):</span>
          <input
            className="input w-28 py-1"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(e.target.value)}
            onBlur={guardar}
            placeholder="0"
            aria-label="Precio de venta del producto nuevo"
          />
        </div>
      )}

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
  resumen,
  onCancelar,
  onConfirmar,
}: {
  resumen: ResumenRecepcion;
  onCancelar: () => void;
  onConfirmar: (actualizarCosto: boolean) => Promise<void>;
}) {
  const [actualizarCosto, setActualizarCosto] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const bloqueado = resumen.dudas > 0 || resumen.sinConfirmar > 0;

  return (
    <div className="overlay" onClick={onCancelar}>
      <div className="sheet sm:max-w-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold">Confirmá antes de cargar</h3>
          <p className="text-sm text-slate-500">Esto es lo único de la pantalla que modifica el stock.</p>
        </div>

        <div className="space-y-4 p-5 text-sm">
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
                Sin tildar, lo único que cambia es la cantidad en stock.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            className="btn-primary flex-1 justify-center"
            disabled={bloqueado || aplicando}
            onClick={async () => { setAplicando(true); await onConfirmar(actualizarCosto); }}
          >
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Sí, cargar al stock
          </button>
          <button className="btn-ghost" onClick={onCancelar} disabled={aplicando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
