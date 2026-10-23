"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Merge, Pencil, X } from "lucide-react";
import { Overlay } from "@/components/overlay";
import type { GrupoDuplicados } from "@/lib/duplicados-stock";
import { actualizarPreciosDuplicados, consolidarDuplicados, conservarDuplicado } from "@/app/admin/(protected)/stock/duplicados-actions";
import { money } from "@/lib/format";
import type { ProductoConStock } from "@/components/stock-manager";

export function ControlDuplicados({ items, grupos, pagina, paginas, cargando, onPagina, onClose, onEdit }: {
  items: ProductoConStock[]; grupos: GrupoDuplicados[]; pagina: number; paginas: number; cargando: boolean;
  onPagina: (pagina: number) => void; onClose: () => void; onEdit: (p: ProductoConStock) => void;
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [venta, setVenta] = useState("");
  const [compra, setCompra] = useState("");
  const [accion, setAccion] = useState<"precios" | "consolidar" | "conservar" | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [pendiente, iniciar] = useTransition();
  const grupo = grupos[indice];
  const miembros = grupo ? grupo.ids.map(id => items.find(p => p.id === id)!).filter(Boolean) : [];
  const elegidos = miembros.filter(p => seleccion.includes(p.id));
  const destino = elegidos.find(p => p.id === principal);
  const otros = elegidos.filter(p => p.id !== principal);
  const unidadesCompatibles = new Set(elegidos.map(p => p.unidadMedida)).size <= 1;
  const enTransito = otros.some(p => Object.values(p.transitoPorSucursal).some(cantidad => cantidad !== 0));
  const conservado = seleccion.length === 1 ? miembros.find(p => p.id === seleccion[0]) : undefined;
  const descartados = conservado ? miembros.filter(p => p.id !== conservado.id) : [];
  const stockDescartado = descartados.reduce((total, p) => total + p.stock, 0);

  function elegirGrupo(i: number) {
    setIndice(i); setSeleccion([]); setPrincipal(null); setAccion(null); setConfirmando(false); setError(""); setExito("");
  }
  function alternar(id: number) {
    const siguientes = seleccion.includes(id) ? seleccion.filter(x => x !== id) : accion === "conservar" ? [id] : [...seleccion, id];
    setSeleccion(siguientes);
    if (principal && !siguientes.includes(principal)) setPrincipal(null);
    if (accion !== "conservar") setAccion(null);
    setConfirmando(false); setError(""); setExito("");
  }
  function guardarPrecios() {
    const cambios: { precioVenta?: number; precioCompra?: number } = {};
    if (venta.trim()) cambios.precioVenta = Number(venta);
    if (compra.trim()) cambios.precioCompra = Number(compra);
    if (!seleccion.length || !Object.keys(cambios).length || Object.values(cambios).some(n => !Number.isFinite(n) || n < 0)) {
      setError("Seleccioná productos e ingresá al menos un precio válido."); return;
    }
    setError(""); setExito("");
    iniciar(async () => {
      const resultado = await actualizarPreciosDuplicados(seleccion, cambios);
      if (!resultado.ok) setError(resultado.error);
      else { setExito(`Se actualizaron los precios de ${seleccion.length} producto(s).`); setVenta(""); setCompra(""); router.refresh(); }
    });
  }
  function consolidar() {
    if (!destino || !otros.length) { setError("Seleccioná al menos dos productos y elegí cuál conservar."); return; }
    if (!unidadesCompatibles) { setError("Los productos deben tener la misma unidad de medida."); return; }
    if (enTransito) { setError("Hay stock en tránsito. Resolvé el traslado antes de consolidar."); return; }
    if (!confirmando) { setConfirmando(true); setError(""); return; }
    setError("");
    iniciar(async () => {
      const resultado = await consolidarDuplicados(destino.id, otros.map(p => p.id));
      if (!resultado.ok) { setError(resultado.error); setConfirmando(false); }
      else { onClose(); router.refresh(); }
    });
  }

  function conservar() {
    if (!conservado || !grupo || !descartados.length) {
      setError("Seleccioná un solo producto para conservar."); return;
    }
    if (!confirmando) { setConfirmando(true); setError(""); return; }
    setError("");
    iniciar(async () => {
      const resultado = await conservarDuplicado(conservado.id, { tipo: grupo.tipo, clave: grupo.clave });
      if (!resultado.ok) { setError(resultado.error); setConfirmando(false); }
      else { onClose(); router.refresh(); }
    });
  }

  return <Overlay className="overlay" onClick={() => { if (!pendiente && !cargando) onClose(); }}>
    <div className="sheet flex max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-5xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Control de duplicados">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700">Inventario · revisión</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Control de duplicados</h2>
          <p className="mt-1 text-sm text-slate-500">Revisá coincidencias, corregí precios, reuní el stock o conservá un producto sin sumar existencias.</p>
        </div>
        <button className="btn-ghost shrink-0 px-2" onClick={onClose} disabled={pendiente || cargando} aria-label="Cerrar"><X className="h-4 w-4" /></button>
      </div>
      <div className="overflow-y-auto px-5 py-5 sm:px-7">
        {!grupos.length ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900"><Check className="mb-2 h-6 w-6" /> No se encontraron códigos repetidos ni nombres similares entre los productos activos.</div> : <>
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">{grupos.filter(g => g.tipo === "codigo").length} por código</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{grupos.filter(g => g.tipo === "nombre").length} por nombre</span>
          </div>
          {paginas > 1 && <nav className="mb-5 flex items-center justify-center gap-3" aria-label="Páginas de duplicados">
            <button className="btn-ghost" disabled={pagina <= 1 || pendiente || cargando} onClick={() => onPagina(pagina - 1)}>← Anterior</button>
            <span className="text-sm text-slate-600">{pagina} / {paginas} · hasta 50 productos por página</span>
            <button className="btn-ghost" disabled={pagina >= paginas || pendiente || cargando} onClick={() => onPagina(pagina + 1)}>Siguiente →</button>
          </nav>}
          <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <nav className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[58dvh]" aria-label="Grupos de duplicados">
              {grupos.map((g, i) => <button key={`${g.tipo}-${g.clave}`} onClick={() => elegirGrupo(i)} className={`w-full rounded-xl border px-3 py-2 text-left transition ${i === indice ? "border-orange-300 bg-orange-50 text-orange-950" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
                <span className="block text-[11px] font-bold uppercase tracking-wider">{g.tipo === "codigo" ? "Mismo código" : "Nombre similar"} · {g.ids.length}</span>
                <span className="mt-0.5 block truncate text-sm font-medium">{g.clave}</span>
              </button>)}
            </nav>
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold">{grupo.tipo === "codigo" ? "Coinciden en código" : "Coinciden en nombre"}</h3><p className="text-xs text-slate-500">{miembros.length} productos · seleccioná los que quieras corregir</p></div>
                {accion !== "conservar" && <button className="btn-ghost text-xs" onClick={() => { setSeleccion(miembros.map(p => p.id)); setPrincipal(null); setConfirmando(false); }}>Seleccionar todos</button>}
              </div>
              <div className="space-y-2">
                {miembros.map(p => <div key={p.id} className={`rounded-xl border p-3 ${seleccion.includes(p.id) ? "border-orange-300 bg-orange-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-orange-600" checked={seleccion.includes(p.id)} onChange={() => alternar(p.id)} aria-label={`Seleccionar ${p.nombre}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{p.nombre} <span className="font-mono text-xs font-normal text-slate-400">#{p.id}</span></p>
                      <p className="break-all font-mono text-xs text-slate-500">{p.sku} · {p.categoria || "General"}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"><span>Stock total: <b>{p.stock} {p.unidadMedida === "kg" ? "kg" : "u"}</b></span><span>Tránsito: {Object.values(p.transitoPorSucursal).reduce((a, b) => a + b, 0)}</span><span>Costo: {money(p.precioCompra)}</span><span>Venta: <b>{money(p.precioVenta)}</b></span></div>
                    </div>
                    <button className="btn-ghost shrink-0 px-2 text-xs" onClick={() => onEdit(p)} title={`Editar ${p.nombre}`}><Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">Editar</span></button>
                  </div>
                </div>)}
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2"><button className={`rounded-lg px-3 py-2 text-sm font-medium ${accion === "precios" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`} onClick={() => { setAccion("precios"); setConfirmando(false); }}>Editar precios de seleccionados</button><button className={`rounded-lg px-3 py-2 text-sm font-medium ${accion === "consolidar" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`} onClick={() => { setAccion("consolidar"); setConfirmando(false); }}>Consolidar seleccionados</button><button className={`rounded-lg px-3 py-2 text-sm font-medium ${accion === "conservar" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`} onClick={() => { setAccion("conservar"); setSeleccion([]); setPrincipal(null); setConfirmando(false); setError(""); }}>Conservar seleccionado</button></div>
                {accion === "precios" && <div className="mt-4"><p className="mb-3 text-xs text-slate-600">Se aplicarán los valores ingresados a los {seleccion.length} seleccionados. Dejá vacío lo que no quieras cambiar.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Precio de venta<input className="input mt-1" type="number" min="0" step="0.01" value={venta} onChange={e => setVenta(e.target.value)} placeholder="Sin cambios" /></label><label className="text-xs font-medium">Costo de compra<input className="input mt-1" type="number" min="0" step="0.01" value={compra} onChange={e => setCompra(e.target.value)} placeholder="Sin cambios" /></label></div><button className="btn-primary mt-3" disabled={pendiente || !seleccion.length} onClick={guardarPrecios}>Guardar precios</button></div>}
                {accion === "consolidar" && <div className="mt-4"><p className="text-xs text-slate-600">Elegí cuál conservar. Se sumará el stock de todas las sucursales y los demás se retirarán del catálogo. El principal conserva su nombre, código y precios.</p><label className="label mt-3">Producto principal</label><select className="input" value={principal ?? ""} onChange={e => { setPrincipal(Number(e.target.value) || null); setConfirmando(false); }}><option value="">Elegir producto…</option>{elegidos.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.sku} · #{p.id}</option>)}</select>{!unidadesCompatibles && <p className="mt-2 text-xs text-rose-700">Las unidades de medida no coinciden.</p>}{enTransito && <p className="mt-2 text-xs text-rose-700">Hay stock en tránsito en un producto que se retiraría.</p>}{confirmando && destino && <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /> Se guardará un respaldo. Se conservará #{destino.id} y se retirarán {otros.length} producto(s). Los movimientos y ventas anteriores seguirán vinculados a sus registros originales.</p>}<button className="btn-primary mt-3" disabled={pendiente || !destino || !otros.length || !unidadesCompatibles || enTransito} onClick={consolidar}><Merge className="h-4 w-4" /> {confirmando ? "Confirmar consolidación" : "Revisar consolidación"}</button></div>}
                {accion === "conservar" && <div className="mt-4">
                  <p className="text-xs text-slate-600">Marcá solo el producto que ya tiene el stock correcto. Se retirarán todos los demás productos de este grupo, incluso si el grupo ocupa otra página. El stock del elegido y sus precios quedarán intactos.</p>
                  {confirmando && conservado && <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><span>Se guardará un respaldo. Se conservará <b>{conservado.nombre} (#{conservado.id})</b> y se retirarán los otros duplicados sin sumar su stock. En esta página son {descartados.length} producto(s) con {stockDescartado} de stock total. Los movimientos y ventas anteriores conservarán sus registros.</span></p>}
                  <button className="btn-primary mt-3" disabled={pendiente || !conservado || !descartados.length} onClick={conservar}><Check className="h-4 w-4" /> {confirmando ? "Confirmar y retirar duplicados" : "Revisar antes de conservar"}</button>
                </div>}
              </div>
              {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              {exito && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{exito}</p>}
            </div>
          </div>
        </>}
      </div>
    </div>
  </Overlay>;
}
