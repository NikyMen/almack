"use client";

// Mover stock = el remito interno del negocio.
//
// Un envío sale del stock disponible y queda en tránsito hasta que el destino
// verifica las cantidades y decide si lo acepta o rechaza.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Fuel, Loader2, PackageCheck, Plus, Search, Trash2, Truck } from "lucide-react";
import type { Sucursal } from "@/db/schema";
import { money, fechaHora } from "@/lib/format";
import { CATEGORIAS_GASTO, ETIQUETA_GASTO, type CategoriaGasto } from "@/lib/gastos";
import { registrarTraslado, resolverTraslado, confirmarDevolucion, registrarGasto, eliminarGasto } from "@/app/admin/(protected)/movimientos/actions";

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
  estado: string;
  origenId: number;
  destinoId: number;
  recibidoPor: string;
  recepcionNota: string;
  items: { id: number; codigo?: string; nombre: string; enviado: number; verificado: number | null; ingresado: number }[];
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
  const router = useRouter();
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
      setAviso(`Traslado #${r.id} enviado: ${r.unidades} unidades en Tránsito — ${nombreDe(destinoId)}.`);
      router.refresh();
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,28rem)]">
      {/* ---------------------------------------------------- Remito interno */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Truck className="h-4 w-4 text-navy" /> Nuevo traslado
        </h2>
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Al enviar, las unidades salen del origen y quedan en <strong>Tránsito — sucursal destino</strong>. El destino las incorpora recién después de verificarlas.</p>

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
            <label className="label">Destino</label>
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
            {pendiente ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : "Enviar a tránsito"}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- Historial */}
      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="text-base font-semibold">Traslados y recepciones</h2>
          <div className="mt-3 space-y-3">
            {historial.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">Todavía no moviste mercadería.</p>
            )}
            {historial.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    <span className="mr-1 text-slate-400">#{m.id}</span>
                    {m.origen} <ArrowRight className="inline h-3 w-3 text-slate-400" /> {m.destino}
                  </p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${m.estado === "en_transito" ? "bg-amber-100 text-amber-800" : m.estado === "rechazado" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`}>
                    {m.estado === "en_transito" ? "En tránsito" : m.estado === "rechazado" ? "Rechazado" : m.estado === "devuelto" ? "Devuelto" : "Recibido"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{fechaHora(m.fecha)}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {m.unidades} unidades{m.usuario && ` · ${m.usuario}`}
                  {m.nota && ` · ${m.nota}`}
                </p>
                {m.gasto && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <Fuel className="h-3.5 w-3.5" /> {m.gasto.concepto} · {money(m.gasto.monto)}
                  </p>
                )}
                {m.recepcionNota && <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{m.recepcionNota}{m.recibidoPor && ` · ${m.recibidoPor}`}</p>}
                <Link href={`/admin/stock/mover/${m.id}?sucursal=${sucursalActivaId ?? "todas"}`} className="btn-ghost mt-3 w-full border border-slate-200 text-sm">Ver movimiento <ArrowRight className="h-4 w-4" /></Link>
              </div>
            ))}
          </div>
        </div>

        <GastosSueltos sucursales={sucursales} sucursalActivaId={sucursalActivaId} gastos={gastos} />
      </div>
    </div>
  );
}

export function RecepcionTraslado({ traslado, modo }: { traslado: TrasladoVista; modo: "recepcion" | "devolucion" }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cantidades, setCantidades] = useState<Record<number, number>>(() => Object.fromEntries(traslado.items.map((item) => [item.id, item.enviado])));
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();
  const hayDiferencia = traslado.items.some((item) => cantidades[item.id] !== item.enviado);

  function enviar(decision: "aceptar" | "rechazar") {
    setError("");
    const lineas = traslado.items.map((item) => ({ itemId: item.id, cantidad: cantidades[item.id] }));
    if (lineas.some((item) => !Number.isSafeInteger(item.cantidad) || item.cantidad < 0)) return setError("Ingresá una cantidad válida en todas las líneas.");
    if ((hayDiferencia || decision === "rechazar") && !nota.trim()) return setError("Explicá la diferencia o el motivo del rechazo.");
    startTransition(async () => {
      const resultado = modo === "devolucion"
        ? await confirmarDevolucion({ id: traslado.id, cantidades: lineas, nota })
        : await resolverTraslado({ id: traslado.id, cantidades: lineas, nota, decision });
      if (!resultado.ok) return setError(resultado.error);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90" onClick={() => setAbierto((v) => !v)}>
        {modo === "recepcion" ? <PackageCheck className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        {modo === "recepcion" ? "Verificar llegada" : "Confirmar devolución al origen"}
      </button>
      {abierto && <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-xs leading-relaxed text-slate-600">{modo === "recepcion" ? "Contá lo que llegó. Podés aceptar una cantidad menor o mayor que la enviada; la diferencia queda registrada." : "Contá lo que volvió al local de origen. Hasta confirmar, sigue en tránsito."}</p>
        {traslado.items.map((item) => {
          const actual = cantidades[item.id] ?? 0;
          const diferencia = actual - item.enviado;
          return <label key={item.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2 rounded-lg bg-white p-2 text-xs sm:grid-cols-[minmax(0,1fr)_5.5rem]">
            <span className="min-w-0"><strong className="block break-words text-slate-700">{item.nombre}</strong><small className="text-slate-500">Enviado: {item.enviado}{diferencia !== 0 && <span className={diferencia < 0 ? "text-rose-700" : "text-amber-700"}> · {diferencia > 0 ? `Sobran ${diferencia}` : `Faltan ${Math.abs(diferencia)}`}</span>}</small></span>
            <input type="number" min="0" step="1" className="input px-2 py-1 text-center" aria-label={`${modo === "recepcion" ? "Recibidas" : "Devueltas"} de ${item.nombre}`} value={actual} onChange={(e) => setCantidades((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))} />
          </label>;
        })}
        <textarea className="input min-h-20" placeholder={modo === "recepcion" ? "Observaciones o motivo de la diferencia" : "Observaciones de la devolución"} value={nota} onChange={(e) => setNota(e.target.value)} />
        {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {modo === "recepcion" ? <>
            <button className="btn-primary text-xs" disabled={pendiente} onClick={() => enviar("aceptar")}><CircleCheck className="h-4 w-4" /> Aceptar ingreso</button>
            <button className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50" disabled={pendiente} onClick={() => enviar("rechazar")}>Rechazar, dejar en tránsito</button>
          </> : <button className="btn-primary text-xs" disabled={pendiente} onClick={() => enviar("aceptar")}>Confirmar lo devuelto</button>}
        </div>
      </div>}
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
