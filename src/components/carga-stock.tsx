"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { vistaPreviaReversion, revertirCargaStock, type LineaReversion, type DecisionReversion } from "@/app/admin/(protected)/compras/revertir-stock";
import Link from "next/link";
import { PackagePlus, Loader2 } from "lucide-react";
import type { Compra, Sucursal } from "@/db/schema";
import { crearCargaStock } from "@/app/admin/(protected)/compras/actions";
import { CompraRecepcion } from "@/components/compra-recepcion";

export function CargaStock({ sucursales, activaId, borradores, cargas, permiteCompras = false }: { permiteCompras?: boolean; sucursales: Sucursal[]; activaId: number | null; borradores: Compra[]; cargas: Compra[] }) {
  const router = useRouter();
  const [reversion, setReversion] = useState<{ id: number; lineas: LineaReversion[] } | null>(null);
  const [decisiones, setDecisiones] = useState<Record<number, { modo: DecisionReversion["modo"] | ""; cantidad: string }>>({});
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [errorReversion, setErrorReversion] = useState("");
  async function revisar(id: number) {
    setErrorReversion("");
    const r = await vistaPreviaReversion(id);
    if (!r.ok) { setErrorReversion(r.error); return; }
    setReversion({ id, lineas: r.lineas });
    setDecisiones({});
  }
  async function revertir() {
    if (!reversion) return;
    const faltantes = reversion.lineas.filter(l => l.quedaria < 0 && !decisiones[l.productoId]?.modo);
    if (faltantes.length) { setErrorReversion("Elegí qué hacer con cada producto que quedaría en negativo."); return; }
    setRevirtiendo(true); setErrorReversion("");
    const r = await revertirCargaStock(reversion.id, reversion.lineas.map(l => ({
      productoId: l.productoId, actual: l.actual,
      modo: l.quedaria >= 0 ? "negativo" : decisiones[l.productoId].modo as DecisionReversion["modo"],
      cantidad: decisiones[l.productoId]?.modo === "manual" && decisiones[l.productoId]?.cantidad !== "" ? Number(decisiones[l.productoId].cantidad) : undefined,
    })));
    setRevirtiendo(false);
    if (!r.ok) { setErrorReversion(r.error); return; }
    setReversion(null); router.refresh();
  }
  const [compra, setCompra] = useState<Compra | null>(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {permiteCompras && <Link className="btn-ghost" href="/admin/compras/diferencias-precios">Diferencias de precios</Link>}
      {permiteCompras && <Link className="btn-ghost" href="/admin/compras?vista=historial">Ver compras e historial</Link>}
    </div>
    <div className="grid gap-3 text-sm sm:grid-cols-3">
      {["1 · Subí el comprobante", "2 · Corregí y revisá el impacto", "3 · Confirmá stock y precios"].map(t => <div key={t} className="rounded-xl border border-slate-200 bg-white p-4 font-medium">{t}</div>)}
    </div>
    {!compra ? <>
      <form className="rounded-xl border border-slate-200 bg-white p-5" onSubmit={async e => {
        e.preventDefault(); const fd = new FormData(e.currentTarget); setCreando(true); setError("");
        try { const r = await crearCargaStock(fd); if (r.ok) setCompra(r.compra); else setError(r.error); }
        catch { setError("No se pudo iniciar la carga."); } finally { setCreando(false); }
      }}>
        <h2 className="mb-4 text-lg font-semibold">Nueva entrada de mercadería</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Proveedor<input name="proveedor" className="input mt-1" required placeholder="Nombre del proveedor" /></label>
          <label className="text-sm">Sucursal de destino<select name="sucursalId" className="input mt-1" defaultValue={activaId ?? ""} disabled={activaId !== null} required><option value="" disabled>Elegí dónde ingresa</option>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600" role="alert">{error}</p>}
        <button className="btn-primary mt-4" disabled={creando || !sucursales.length}>{creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Iniciar carga</button>
      </form>
      {cargas.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Revertir una carga ya aplicada</h2>
        <p className="mt-1 text-xs text-slate-500">Descuenta las unidades de esa carga. Las ventas y demás movimientos quedan registrados.</p>
        <div className="mt-3 flex flex-wrap gap-2">{cargas.map(c => <button className="btn-ghost" key={c.id} onClick={() => revisar(c.id)}>Revisar carga #{c.id} · {c.proveedor} · {sucursales.find(s => s.id === c.sucursalId)?.nombre}</button>)}</div>
      </div>}
      {reversion && <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="font-semibold">Revertir carga #{reversion.id}</h2>
        <p className="mt-1 text-sm">Se descontarán {reversion.lineas.reduce((n,l) => n+l.cargado,0)} unidades de {reversion.lineas.length} productos. Las ventas no se borran.</p>
        {reversion.lineas.filter(l => l.quedaria < 0).length > 0 && <>
          <p className="mt-3 font-medium text-amber-900">Estos productos quedarían en negativo por movimientos posteriores. Elegí el saldo final de cada uno:</p>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{reversion.lineas.filter(l => l.quedaria < 0).map(l => <div key={l.productoId} className="rounded-lg bg-white p-3 text-sm">
            <div className="font-medium">{l.nombre} · actual {l.actual} − carga {l.cargado} = {l.quedaria}</div>
            <div className="mt-2 flex flex-wrap gap-2"><select className="input max-w-52" value={decisiones[l.productoId]?.modo ?? ""} onChange={e => setDecisiones(v => ({ ...v, [l.productoId]: { modo: e.target.value as DecisionReversion["modo"], cantidad: v[l.productoId]?.cantidad ?? "" } }))}>
              <option value="">Elegí una opción</option><option value="negativo">Dejar {l.quedaria}</option><option value="cero">Dejar 0</option><option value="manual">Otra cantidad</option>
            </select>{decisiones[l.productoId]?.modo === "manual" && <input className="input max-w-32" type="number" min="0" step="1" placeholder="Cantidad" value={decisiones[l.productoId]?.cantidad ?? ""} onChange={e => setDecisiones(v => ({ ...v, [l.productoId]: { modo: "manual", cantidad: e.target.value } }))} />}</div>
          </div>)}</div>
        </>}
        {errorReversion && <p role="alert" className="mt-3 text-sm text-rose-600">{errorReversion}</p>}
        <div className="mt-4 flex gap-2"><button className="btn-primary" disabled={revirtiendo} onClick={revertir}>{revirtiendo ? "Revirtiendo…" : "Confirmar reversión"}</button><button className="btn-ghost" onClick={() => setReversion(null)}>Cancelar</button></div>
      </div>}
      {!reversion && errorReversion && <p role="alert" className="text-sm text-rose-600">{errorReversion}</p>}
      {borradores.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Retomar una carga pendiente</h2><div className="mt-3 flex flex-wrap gap-2">{borradores.map(c => <button className="btn-ghost" key={c.id} onClick={() => setCompra(c)}>#{c.id} · {c.proveedor}</button>)}</div></div>}
    </> : <div className="rounded-xl bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Carga #{compra.id} · {compra.proveedor} · {sucursales.find(s => s.id === compra.sucursalId)?.nombre}</h2><button className="btn-ghost" onClick={() => setCompra(null)}>Otra carga</button></div>
      <CompraRecepcion key={compra.id} compra={compra} onCambio={() => router.refresh()} onCancelar={() => setCompra(null)} />
    </div>}
  </div>;
}
