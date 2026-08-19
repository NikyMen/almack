"use client";

// Mover stock = el remito interno del negocio.
//
// Se arma una lista de productos, se elige de qué local salen y a cuál entran,
// y opcionalmente se anota lo que costó llevarlos (la nafta, el flete). El
// stock se mueve en el momento de confirmar: no hay estado "en camino".

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Fuel, Loader2, Plus, Search, Trash2, Truck } from "lucide-react";
import type { Sucursal } from "@/db/schema";
import { money, fechaHora } from "@/lib/format";
import { CATEGORIAS_GASTO, ETIQUETA_GASTO, type CategoriaGasto } from "@/lib/gastos";
import { registrarTraslado, registrarGasto, eliminarGasto } from "@/app/admin/(protected)/movimientos/actions";

export type ProductoTraslado = {
  id: number;
  nombre: string;
  sku: string;
  porSucursal: Record<number, number>;
};

export type TrasladoVista = {
  id: number;
  fecha: Date | null;
  origen: string;
  destino: string;
  unidades: number;
  nota: string;
  usuario: string;
  items: string[];
  gasto: { concepto: string; categoria: string; monto: number } | null;
};

export type GastoVista = {
  id: number;
  fecha: Date | null;
  concepto: string;
  categoria: string;
  monto: number;
  sucursal: string;
  deTraslado: boolean;
};

type Linea = { productoId: number; nombre: string; cantidad: number };

export function MoverStock({
  sucursales,
  sucursalActivaId,
  catalogo,
  historial,
  gastos,
}: {
  sucursales: Sucursal[];
  sucursalActivaId: number | null;
  catalogo: ProductoTraslado[];
  historial: TrasladoVista[];
  gastos: GastoVista[];
}) {
  // Estando dentro de una sucursal, lo natural es que la mercadería salga de
  // acá: se propone como origen y el destino queda en el primer otro local.
  const origenInicial = sucursalActivaId ?? sucursales[0]?.id ?? 0;
  const [origenId, setOrigenId] = useState(origenInicial);
  const [destinoId, setDestinoId] = useState(
    sucursales.find((s) => s.id !== origenInicial)?.id ?? 0
  );
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [nota, setNota] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [conGasto, setConGasto] = useState(false);
  const [gastoConcepto, setGastoConcepto] = useState("Nafta del traslado");
  const [gastoCategoria, setGastoCategoria] = useState<CategoriaGasto>("combustible");
  const [gastoMonto, setGastoMonto] = useState("");
  const [gastoPagaId, setGastoPagaId] = useState(origenInicial);

  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pendiente, startTransition] = useTransition();

  const enOrigen = (productoId: number) =>
    catalogo.find((p) => p.id === productoId)?.porSucursal[origenId] ?? 0;

  // El buscador solo ofrece lo que realmente hay en el origen: no se puede
  // mandar mercadería que el local no tiene.
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo
      .filter((p) => (p.porSucursal[origenId] ?? 0) > 0)
      .filter((p) => !q || `${p.nombre} ${p.sku}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalogo, busqueda, origenId]);

  const totalUnidades = lineas.reduce((a, l) => a + (l.cantidad || 0), 0);

  function agregar(p: ProductoTraslado) {
    setError("");
    setBusqueda("");
    setLineas((prev) =>
      prev.some((l) => l.productoId === p.id)
        ? prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...prev, { productoId: p.id, nombre: p.nombre, cantidad: 1 }]
    );
  }

  function cambiarOrigen(id: number) {
    setOrigenId(id);
    setGastoPagaId(id);
    if (id === destinoId) setDestinoId(sucursales.find((s) => s.id !== id)?.id ?? 0);
    // Lo cargado era stock del local anterior: se limpia para no mover algo que
    // en el nuevo origen no existe.
    setLineas([]);
  }

  function confirmar() {
    setError("");
    setAviso("");
    const excedidas = lineas.filter((l) => l.cantidad > enOrigen(l.productoId));
    if (excedidas.length) {
      return setError(
        `No hay tanto stock de "${excedidas[0].nombre}" en el origen (hay ${enOrigen(excedidas[0].productoId)}).`
      );
    }

    startTransition(async () => {
      const r = await registrarTraslado({
        origenId,
        destinoId,
        nota,
        items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        gasto: conGasto
          ? {
              concepto: gastoConcepto,
              categoria: gastoCategoria,
              monto: Number(gastoMonto || 0),
              sucursalId: gastoPagaId,
            }
          : null,
      });
      if (!r.ok) return setError(r.error);
      setLineas([]);
      setNota("");
      setGastoMonto("");
      setConGasto(false);
      setAviso(`Se movieron ${r.unidades} unidades.`);
    });
  }

  if (sucursales.length < 2) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        Para mover mercadería necesitás al menos dos sucursales. Creá la segunda desde el
        logo de Almack, arriba a la izquierda.
      </div>
    );
  }

  const nombreDe = (id: number) => sucursales.find((s) => s.id === id)?.nombre ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      {/* ---------------------------------------------------- Remito interno */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Truck className="h-4 w-4 text-navy" /> Nuevo traslado
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div>
            <label className="label">Sale de</label>
            <select className="input" value={origenId} onChange={(e) => cambiarOrigen(Number(e.target.value))}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-slate-300 sm:mb-3 sm:block" />
          <div>
            <label className="label">Entra en</label>
            <select className="input" value={destinoId} onChange={(e) => setDestinoId(Number(e.target.value))}>
              {sucursales
                .filter((s) => s.id !== origenId)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Buscador del catálogo del origen */}
        <div className="mt-5">
          <label className="label">Productos</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder={`Buscar en ${nombreDe(origenId)}…`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          {busqueda.trim() && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
              {resultados.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-slate-400">
                  Nada con stock en {nombreDe(origenId)}.
                </p>
              )}
              {resultados.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
                  onClick={() => agregar(p)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="block truncate font-mono text-[11px] text-slate-400">{p.sku}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    {p.porSucursal[origenId] ?? 0} disp. <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Líneas cargadas */}
        <div className="mt-4 space-y-2">
          {lineas.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
              Buscá un producto para empezar a cargar el traslado.
            </p>
          )}
          {lineas.map((l) => {
            const hay = enOrigen(l.productoId);
            const excede = l.cantidad > hay;
            return (
              <div key={l.productoId} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.nombre}</span>
                  <span className={`block text-[11px] ${excede ? "text-rose-600" : "text-slate-400"}`}>
                    {hay} en {nombreDe(origenId)}
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={hay}
                  className={`input w-20 py-1.5 text-center ${excede ? "border-rose-300" : ""}`}
                  value={l.cantidad}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) =>
                        x.productoId === l.productoId
                          ? { ...x, cantidad: Math.max(1, Number(e.target.value) || 1) }
                          : x
                      )
                    )
                  }
                />
                <button
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  title="Sacar del traslado"
                  onClick={() => setLineas((prev) => prev.filter((x) => x.productoId !== l.productoId))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Gasto del flete */}
        <div className="mt-5 rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={conGasto}
              onChange={(e) => setConGasto(e.target.checked)}
            />
            <Fuel className="h-4 w-4 text-slate-400" />
            Sumar el gasto de llevarlo (nafta, flete…)
          </label>

          {conGasto && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Concepto</label>
                <input
                  className="input"
                  value={gastoConcepto}
                  onChange={(e) => setGastoConcepto(e.target.value)}
                  placeholder="Nafta del traslado"
                />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select
                  className="input"
                  value={gastoCategoria}
                  onChange={(e) => setGastoCategoria(e.target.value as CategoriaGasto)}
                >
                  {CATEGORIAS_GASTO.map((c) => (
                    <option key={c} value={c}>{ETIQUETA_GASTO[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={gastoMonto}
                  onChange={(e) => setGastoMonto(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Lo paga</label>
                <select className="input" value={gastoPagaId} onChange={(e) => setGastoPagaId(Number(e.target.value))}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="label">Nota (opcional)</label>
          <input
            className="input"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Quién lo llevó, número de remito…"
          />
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {aviso && <p className="mt-3 text-sm text-emerald-600">{aviso}</p>}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {totalUnidades} unidad(es) · {nombreDe(origenId)} → {nombreDe(destinoId)}
          </p>
          <button className="btn-primary" disabled={pendiente || lineas.length === 0} onClick={confirmar}>
            {pendiente ? <><Loader2 className="h-4 w-4 animate-spin" /> Moviendo…</> : "Confirmar traslado"}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- Historial */}
      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="text-base font-semibold">Últimos traslados</h2>
          <div className="mt-3 space-y-3">
            {historial.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">Todavía no moviste mercadería.</p>
            )}
            {historial.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {m.origen} <ArrowRight className="inline h-3 w-3 text-slate-400" /> {m.destino}
                  </p>
                  <span className="shrink-0 text-xs text-slate-400">{fechaHora(m.fecha)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{m.items.join(" · ")}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {m.unidades} unidades{m.usuario && ` · ${m.usuario}`}
                  {m.nota && ` · ${m.nota}`}
                </p>
                {m.gasto && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <Fuel className="h-3.5 w-3.5" /> {m.gasto.concepto} · {money(m.gasto.monto)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <GastosSueltos sucursales={sucursales} sucursalActivaId={sucursalActivaId} gastos={gastos} />
      </div>
    </div>
  );
}

/** Gastos del local que no vienen de un traslado (se cargan y se listan acá). */
function GastosSueltos({
  sucursales,
  sucursalActivaId,
  gastos,
}: {
  sucursales: Sucursal[];
  sucursalActivaId: number | null;
  gastos: GastoVista[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaGasto>("otros");
  const [monto, setMonto] = useState("");
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? sucursales[0]?.id ?? 0);
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();

  const total = gastos.reduce((a, g) => a + g.monto, 0);

  function guardar() {
    setError("");
    startTransition(async () => {
      const r = await registrarGasto({
        sucursalId,
        concepto,
        categoria,
        monto: Number(monto || 0),
      });
      if (!r.ok) return setError(r.error);
      setConcepto("");
      setMonto("");
      setAbierto(false);
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Gastos</h2>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cerrar" : <><Plus className="h-3.5 w-3.5" /> Anotar gasto</>}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">{money(total)} en los últimos {gastos.length} movimientos</p>

      {abierto && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <input
            className="input"
            placeholder="¿De qué es el gasto?"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>{ETIQUETA_GASTO[c]}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              className="input"
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <select className="input" value={sucursalId} onChange={(e) => setSucursalId(Number(e.target.value))}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button className="btn-primary w-full" disabled={pendiente} onClick={guardar}>
            {pendiente ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : "Guardar gasto"}
          </button>
        </div>
      )}

      <div className="mt-3 divide-y divide-slate-100">
        {gastos.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Sin gastos cargados.</p>}
        {gastos.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm">{g.concepto}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {fechaHora(g.fecha)}
                {g.sucursal && ` · ${g.sucursal}`}
                {g.deTraslado && " · traslado"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{money(g.monto)}</span>
              <button
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                title="Borrar gasto"
                onClick={() => {
                  if (confirm(`¿Borrar el gasto "${g.concepto}"?`)) startTransition(() => { eliminarGasto(g.id); });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
