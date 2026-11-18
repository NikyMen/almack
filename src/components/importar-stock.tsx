"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { Overlay } from "@/components/overlay";
import type { Sucursal } from "@/db/schema";
import { confirmarImportacionStock, previsualizarStock } from "@/app/admin/(protected)/stock/importar/actions";

type VistaPrevia = Extract<Awaited<ReturnType<typeof previsualizarStock>>, { ok: true }>;
export function ImportarStock({ sucursales, sucursalActivaId }: { sucursales: Sucursal[]; sucursalActivaId: number | null }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? sucursales[0]?.id ?? 0);
  const [preview, setPreview] = useState<VistaPrevia | null>(null);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState("");
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  function cerrar() { if (!ocupado) { setAbierto(false); setPreview(null); setArchivo(null); setError(""); } }
  function previsualizar() {
    if (!archivo || !sucursalId) return setError("Elegí una sucursal y un archivo XLSX.");
    setError(""); setResultado("");
    iniciar(async () => {
      const r = await previsualizarStock(archivo, sucursalId);
      if (r.ok) setPreview(r);
      else setError(r.error);
    });
  }
  function confirmar() {
    if (!archivo || !preview) return;
    setError("");
    iniciar(async () => {
      const r = await confirmarImportacionStock(archivo, sucursalId);
      if (!r.ok) return setError(r.error);
      setResultado(`${r.creados} producto(s) creados y ${r.actualizados} actualizados.`);
      setPreview(null); setArchivo(null);
      router.refresh();
    });
  }
  return <>
    <button type="button" className="btn-ghost" onClick={() => setAbierto(true)}><Upload className="h-4 w-4" /> Importar</button>
    {abierto && <Overlay className="overlay" onClick={cerrar}>
      <div className="sheet sm:max-w-xl" role="dialog" aria-modal="true" aria-label="Importar stock" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-semibold">Importar stock</h2><button type="button" className="btn-ghost" disabled={ocupado} onClick={cerrar} aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
        <div className="space-y-4 p-5 text-sm">
          <p>Usá una planilla XLSX generada con <strong>Exportar</strong>. Se identifican los productos por SKU y se actualizan nombre, precios y stock de la sucursal elegida. Los productos que no figuran en el archivo conservan sus datos.</p>
          <label className="label block">Sucursal<select className="input mt-1" value={sucursalId} onChange={e => { setSucursalId(Number(e.target.value)); setPreview(null); }}>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select></label>
          <label className="label block">Planilla XLSX<input className="input mt-1" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { setArchivo(e.target.files?.[0] ?? null); setPreview(null); setResultado(""); }} /></label>
          <button type="button" className="btn-primary" disabled={ocupado || !archivo} onClick={previsualizar}>{ocupado ? "Leyendo…" : "Revisar archivo"}</button>
          {preview && <div className="rounded-lg border border-slate-200 p-3"><p className="font-medium">{preview.total} productos listos para importar</p><ul className="mt-2 space-y-1 text-slate-600">{preview.muestra.map(f => <li key={f.sku}>{f.sku} · {f.nombre} · stock {f.stock}</li>)}</ul><p className="mt-2 text-xs text-slate-500">El stock de los productos incluidos se reemplazará por el valor del archivo en esta sucursal.</p><button type="button" className="btn-primary mt-3" disabled={ocupado} onClick={confirmar}>Confirmar importación</button></div>}
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          {resultado && <p role="status" className="text-emerald-700">{resultado}</p>}
        </div>
      </div>
    </Overlay>}
  </>;
}
