"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { proveedorFormatos } from "@/db";
import { guardarFormato } from "@/app/admin/(protected)/compras/proveedores/actions";
import { CAMPOS_CATALOGO, CAMPOS_COMPROBANTE, CAMPOS_INICIALES, type MapeoCampos, type ReglaCampo } from "@/lib/catalogo-proveedor-config";

type Formato = typeof proveedorFormatos.$inferSelect;
type FormatoDatos = Parameters<typeof guardarFormato>[1];
const nuevo: FormatoDatos = { nombre: "", clase: "catalogo", tipoArchivo: "csv", hoja: "", filaEncabezado: 1, separador: "auto", campos: CAMPOS_INICIALES, notas: "" };
const etiquetas: Record<string, string> = { codigo: "Código", nombre: "Nombre / descripción", precio: "Precio", marca: "Marca", categoria: "Categoría", unidad: "Unidad", moneda: "Moneda", proveedor: "Proveedor", fecha: "Fecha", numero: "Número de comprobante", total: "Total", cantidad: "Cantidad" };
const transformaciones: { valor: ReglaCampo["transformacion"]; nombre: string }[] = [{ valor: "ninguna", nombre: "Sin cambio" }, { valor: "mayusculas", nombre: "Mayúsculas" }, { valor: "minusculas", nombre: "Minúsculas" }, { valor: "decimal_coma", nombre: "Decimal con coma" }, { valor: "decimal_punto", nombre: "Decimal con punto" }];
function leerObjeto(json: string): MapeoCampos { try { const dato = JSON.parse(json); return dato && typeof dato === "object" ? dato as MapeoCampos : {}; } catch { return {}; } }

export function ProveedorFormatos({ proveedorId, formatos }: { proveedorId: number; formatos: Formato[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormatoDatos | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [pendiente, start] = useTransition();
  const editar = (f: Formato) => { setForm({ id: f.id, nombre: f.nombre, clase: f.clase, tipoArchivo: f.tipoArchivo, hoja: f.hoja, filaEncabezado: f.filaEncabezado, separador: f.separador, campos: leerObjeto(f.campos), notas: f.notas }); setMensaje(""); };
  const guardar = () => { if (!form) return; start(async () => { const r = await guardarFormato(proveedorId, form); setMensaje(r.ok ? "Formato guardado." : r.error); if (r.ok) { setForm(null); router.refresh(); } }); };
  const campos = form?.clase === "comprobante" ? CAMPOS_COMPROBANTE : CAMPOS_CATALOGO;
  const formatosVisibles = formatos.filter(f => f.tipoArchivo !== "imagen");
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Formatos guardados</h2><p className="text-sm text-slate-500">Un proveedor puede tener varios catálogos y comprobantes.</p></div><button className="btn-primary" onClick={() => { setForm({ ...nuevo, campos: { ...CAMPOS_INICIALES } }); setMensaje(""); }}><Plus className="h-4 w-4" /> Nuevo</button></div>
      {formatosVisibles.length ? <div className="space-y-2">{formatosVisibles.map(f => <button key={f.id} onClick={() => editar(f)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-orange-300"><span className="font-medium">{f.nombre}</span><span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{f.clase === "catalogo" ? "Catálogo" : "Comprobante"} · {f.tipoArchivo.toUpperCase()}</span><p className="mt-1 line-clamp-2 text-xs text-slate-500">{f.notas || "Sin notas"}</p></button>)}</div> : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Todavía no hay formatos configurados.</p>}
    </section>
    {form && <form action={guardar} className="card space-y-4 p-5">
      <div><h2 className="text-lg font-semibold">{form.id ? "Editar formato" : "Nuevo formato"}</h2><p className="text-sm text-slate-500">Configurá el origen de cada dato y qué se debe ignorar.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input className="input mt-1" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label className="text-sm">Uso<select className="input mt-1" value={form.clase} onChange={e => setForm({ ...form, clase: e.target.value, tipoArchivo: "csv", campos: e.target.value === "catalogo" ? { ...CAMPOS_INICIALES } : {} })}><option value="catalogo">Catálogo de precios</option><option value="comprobante">Ticket / remito / factura</option></select></label>
        <label className="text-sm">Archivo<select className="input mt-1" value={form.tipoArchivo} onChange={e => setForm({ ...form, tipoArchivo: e.target.value })}><option value="csv">CSV</option><option value="tsv">TSV</option><option value="xlsx">Excel XLSX</option>{form.clase === "comprobante" && <><option value="txt">Texto</option><option value="pdf">PDF</option></>}</select></label>
        <label className="text-sm">Fila de encabezados<input className="input mt-1" type="number" min={1} max={200} value={form.filaEncabezado} onChange={e => setForm({ ...form, filaEncabezado: Number(e.target.value) })} /></label><label className="text-sm">Hoja XLSX (opcional)<input className="input mt-1" value={form.hoja} onChange={e => setForm({ ...form, hoja: e.target.value })} placeholder="Primera hoja" /></label><label className="text-sm">Separador CSV<select className="input mt-1" value={form.separador} onChange={e => setForm({ ...form, separador: e.target.value })}><option value="auto">Detectar automáticamente</option><option value="coma">Coma</option><option value="punto_coma">Punto y coma</option><option value="tab">Tabulación</option></select></label>
      </div>
      <div><h3 className="mb-1 font-semibold">Origen de cada dato</h3><p className="mb-3 text-xs text-slate-500">Para catálogos: escribí el encabezado exacto o una letra de columna (A, B, C). Para comprobantes: describí la ubicación o etiqueta; estas reglas quedan guardadas para la futura carga masiva.</p><div className="space-y-2">{campos.map(c => <div key={c} className="grid items-end gap-2 sm:grid-cols-[minmax(7rem,1fr)_minmax(9rem,1.4fr)_minmax(8rem,1fr)]"><span className="pb-2 text-sm">{etiquetas[c]}</span><input className="input" value={form.campos[c]?.origen ?? ""} onChange={e => setForm({ ...form, campos: { ...form.campos, [c]: { origen: e.target.value, transformacion: form.campos[c]?.transformacion ?? "ninguna" } } })} placeholder={form.clase === "catalogo" ? "Encabezado o columna" : "Etiqueta, columna o ubicación"} /><select className="input" aria-label={`Transformación de ${etiquetas[c]}`} value={form.campos[c]?.transformacion ?? "ninguna"} onChange={e => setForm({ ...form, campos: { ...form.campos, [c]: { origen: form.campos[c]?.origen ?? "", transformacion: e.target.value as ReglaCampo["transformacion"] } } })}>{transformaciones.map(t => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}</select></div>)}</div></div>
      <label className="block text-sm">Notas del formato<textarea className="input mt-1 min-h-20" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Ej.: precios incluyen IVA; descripción ocupa dos líneas…" /></label>
      <div className="flex gap-2"><button className="btn-primary" disabled={pendiente}>Guardar formato</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button></div>
      {mensaje && <p role="status" className="text-sm text-slate-600">{mensaje}</p>}
    </form>}
  </div>;
}
