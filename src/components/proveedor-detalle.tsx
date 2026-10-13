"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileSpreadsheet, Settings2, UserRound, Plus, Search } from "lucide-react";
import type { proveedorArticulos, proveedorFormatos, proveedores } from "@/db";
import type { ArticuloImportado } from "@/lib/catalogo-proveedor-config";
import { guardarArticulo, guardarProveedor, importarCatalogo, previsualizarCatalogo } from "@/app/admin/(protected)/compras/proveedores/actions";
import { money } from "@/lib/format";
import { ProveedorFormatos } from "@/components/proveedor-formatos";

type Proveedor = typeof proveedores.$inferSelect;
type Articulo = typeof proveedorArticulos.$inferSelect;
type Formato = typeof proveedorFormatos.$inferSelect;
type Vista = "catalogo" | "formatos" | "datos";
type ArticuloDatos = Parameters<typeof guardarArticulo>[1];
const articuloVacio: ArticuloDatos = { codigo: "", nombre: "", precio: 0, marca: "", categoria: "", unidad: "unidad", moneda: "ARS", activo: true };
const etiquetas: Record<string, string> = { codigo: "Código", nombre: "Nombre / descripción", precio: "Precio", marca: "Marca", categoria: "Categoría", unidad: "Unidad", moneda: "Moneda", proveedor: "Proveedor", fecha: "Fecha", numero: "Número de comprobante", total: "Total", cantidad: "Cantidad" };

export function ProveedorDetalle({ proveedor, articulos, formatos }: { proveedor: Proveedor; articulos: Articulo[]; formatos: Formato[] }) {
  const [vista, setVista] = useState<Vista>("catalogo");
  const tabs: { id: Vista; nombre: string; icono: typeof BookOpen }[] = [{ id: "catalogo", nombre: "Catálogo", icono: BookOpen }, { id: "formatos", nombre: "Formatos", icono: Settings2 }, { id: "datos", nombre: "Datos del proveedor", icono: UserRound }];
  return <>
    <nav aria-label="Secciones del proveedor" className="mb-5 flex flex-wrap gap-2">{tabs.map(({ id, nombre, icono: Icono }) => <button key={id} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${vista === id ? "bg-navy text-white shadow-md" : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300"}`} onClick={() => setVista(id)}><Icono className="h-4 w-4" />{nombre}</button>)}</nav>
    {vista === "datos" && <DatosProveedor proveedor={proveedor} />}
    {vista === "catalogo" && <Catalogo proveedorId={proveedor.id} articulos={articulos} formatos={formatos.filter(f => f.clase === "catalogo" && ["csv", "tsv", "xlsx"].includes(f.tipoArchivo))} />}
    {vista === "formatos" && <ProveedorFormatos proveedorId={proveedor.id} formatos={formatos} />}
  </>;
}

function DatosProveedor({ proveedor: p }: { proveedor: Proveedor }) {
  const router = useRouter();
  const [form, setForm] = useState({ id: p.id, nombre: p.nombre, cuit: p.cuit, contacto: p.contacto, telefono: p.telefono, email: p.email, direccion: p.direccion, notas: p.notas, activo: p.activo });
  const [mensaje, setMensaje] = useState("");
  const [pendiente, start] = useTransition();
  const guardar = () => start(async () => { const r = await guardarProveedor(form); setMensaje(r.ok ? "Datos guardados." : r.error); if (r.ok) router.refresh(); });
  return <form action={guardar} className="card max-w-3xl space-y-4 p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Ficha del proveedor</h2><p className="text-sm text-slate-500">Estos datos identifican al proveedor; las compras históricas conservan su nombre original.</p></div><div className="grid gap-4 sm:grid-cols-2">{(["nombre", "cuit", "contacto", "telefono", "email", "direccion"] as const).map(k => <label key={k} className="text-sm font-medium capitalize">{k}<input className="input mt-1" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} maxLength={k === "direccion" ? 250 : 120} required={k === "nombre"} type={k === "email" ? "email" : "text"} /></label>)}</div><label className="block text-sm font-medium">Notas<textarea className="input mt-1 min-h-24" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} maxLength={2000} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />Proveedor activo</label><button className="btn-primary" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar datos"}</button>{mensaje && <p role="status" className="text-sm text-slate-600">{mensaje}</p>}</form>;
}

function Catalogo({ proveedorId, articulos, formatos }: { proveedorId: number; articulos: Articulo[]; formatos: Formato[] }) {
  const router = useRouter();
  const [form, setForm] = useState<ArticuloDatos | null>(null);
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [pendiente, start] = useTransition();
  const visibles = articulos.filter(a => `${a.codigo} ${a.nombre} ${a.marca} ${a.categoria}`.toLowerCase().includes(buscar.toLowerCase()));
  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(visibles.length / 50) - 1));
  const guardar = () => { if (!form) return; start(async () => { const r = await guardarArticulo(proveedorId, form); setMensaje(r.ok ? "Artículo guardado." : r.error); if (r.ok) { setForm(null); router.refresh(); } }); };
  return <div className="space-y-5"><ImportadorCatalogo proveedorId={proveedorId} formatos={formatos} />
    <section className="card p-5"><div className="mb-4 flex flex-wrap items-center gap-3"><div><h2 className="text-lg font-semibold">Artículos y precios</h2><p className="text-sm text-slate-500">Precios de lista del proveedor. No actualizan stock ni precios de venta.</p></div><button className="btn-primary ml-auto" onClick={() => { setForm(articuloVacio); setMensaje(""); }}><Plus className="h-4 w-4" /> Añadir artículo</button></div>
      {form && <form action={guardar} className="mb-5 rounded-xl border border-orange-200 bg-orange-50/40 p-4"><h3 className="mb-3 font-semibold">{form.id ? "Editar artículo" : "Nuevo artículo"}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["codigo", "nombre", "precio", "marca", "categoria", "unidad", "moneda"] as const).map(k => <label key={k} className="text-sm">{etiquetas[k]}<input className="input mt-1" type={k === "precio" ? "number" : "text"} min={k === "precio" ? 0 : undefined} step={k === "precio" ? "0.01" : undefined} value={form[k]} required={["codigo", "nombre"].includes(k)} onChange={e => setForm({ ...form, [k]: k === "precio" ? Number(e.target.value) : e.target.value })} /></label>)}</div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />Activo en el catálogo</label><div className="mt-3 flex gap-2"><button className="btn-primary" disabled={pendiente}>Guardar</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button></div>{mensaje && <p role="status" className="mt-2 text-sm text-slate-600">{mensaje}</p>}</form>}
      <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }} placeholder="Buscar por código, artículo, marca o categoría…" /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Código</th><th className="p-3">Artículo</th><th className="p-3">Marca / categoría</th><th className="p-3">Unidad</th><th className="p-3 text-right">Precio</th><th className="p-3"></th></tr></thead><tbody>{visibles.slice(paginaSegura * 50, paginaSegura * 50 + 50).map(a => <tr key={a.id} className="border-b border-slate-100"><td className="p-3 font-mono text-xs">{a.codigo}</td><td className="p-3"><span className="font-medium">{a.nombre}</span>{!a.activo && <span className="ml-2 text-xs text-slate-400">Inactivo</span>}</td><td className="p-3 text-slate-500">{[a.marca, a.categoria].filter(Boolean).join(" · ") || "—"}</td><td className="p-3 text-slate-500">{a.unidad}</td><td className="p-3 text-right font-semibold tabular-nums">{a.moneda === "ARS" ? money(a.precio) : `${a.moneda} ${a.precio.toFixed(2)}`}</td><td className="p-3 text-right"><button className="btn-ghost text-xs" onClick={() => { setForm({ id: a.id, codigo: a.codigo, nombre: a.nombre, precio: a.precio, marca: a.marca, categoria: a.categoria, unidad: a.unidad, moneda: a.moneda, activo: a.activo }); setMensaje(""); }}>Editar</button></td></tr>)}</tbody></table>{!visibles.length && <p className="py-8 text-center text-sm text-slate-500">No hay artículos para mostrar.</p>}</div>
      {visibles.length > 50 && <div className="mt-4 flex items-center justify-between text-sm"><span>{visibles.length} artículos · página {paginaSegura + 1} de {Math.ceil(visibles.length / 50)}</span><div className="flex gap-2"><button className="btn-ghost" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)}>Anterior</button><button className="btn-ghost" disabled={paginaSegura + 1 >= Math.ceil(visibles.length / 50)} onClick={() => setPagina(paginaSegura + 1)}>Siguiente</button></div></div>}
    </section>
  </div>;
}

function ImportadorCatalogo({ proveedorId, formatos }: { proveedorId: number; formatos: Formato[] }) {
  const router = useRouter();
  const [formatoId, setFormatoId] = useState<number>(formatos[0]?.id ?? 0);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; muestra: ArticuloImportado[]; errores: string[]; hayErrores: boolean } | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [pendiente, start] = useTransition();
  const revisar = () => { if (!archivo || !formatoId) return; start(async () => { const r = await previsualizarCatalogo(proveedorId, formatoId, archivo); if (r.ok) { setPreview(r); setMensaje(""); } else { setPreview(null); setMensaje(r.error); } }); };
  const importar = () => { if (!archivo || !preview || preview.hayErrores) return; start(async () => { const r = await importarCatalogo(proveedorId, formatoId, archivo); if (r.ok) { setMensaje(`${r.total} artículos cargados o actualizados.`); setPreview(null); setArchivo(null); router.refresh(); } else setMensaje(r.error); }); };
  return <section className="card p-5"><div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-lime/20 p-2 text-navy"><FileSpreadsheet className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Cargar o actualizar catálogo</h2><p className="text-sm text-slate-500">CSV, TSV o XLSX · hasta 5000 artículos. Los códigos existentes se actualizan; los demás se agregan.</p></div></div>
    {!formatos.length ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Primero configurá un formato de catálogo en la pestaña Formatos.</p> : <div className="flex flex-wrap items-end gap-3"><label className="min-w-52 text-sm">Formato<select className="input mt-1" value={formatoId} onChange={e => { setFormatoId(Number(e.target.value)); setPreview(null); }}>{formatos.map(f => <option value={f.id} key={f.id}>{f.nombre} · {f.tipoArchivo.toUpperCase()}</option>)}</select></label><label className="min-w-52 flex-1 text-sm">Archivo<input className="input mt-1" type="file" accept=".csv,.tsv,.xlsx" onChange={e => { setArchivo(e.target.files?.[0] ?? null); setPreview(null); }} /></label><button className="btn-ghost" disabled={!archivo || pendiente} onClick={revisar}>{pendiente ? "Leyendo…" : "Vista previa"}</button></div>}
    {preview && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-medium">{preview.total} artículos listos para importar</p>{preview.errores.length > 0 && <div className="mt-2 text-sm text-rose-700"><p>Hay filas para corregir:</p><ul className="list-inside list-disc">{preview.errores.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}<div className="mt-3 max-h-56 overflow-auto text-sm"><table className="w-full"><thead><tr className="text-left text-xs text-slate-500"><th>Código</th><th>Artículo</th><th>Precio</th></tr></thead><tbody>{preview.muestra.map(a => <tr key={a.codigo} className="border-t border-slate-200"><td className="py-1 font-mono">{a.codigo}</td><td>{a.nombre}</td><td>{a.moneda} {a.precio.toFixed(2)}</td></tr>)}</tbody></table></div><button className="btn-primary mt-4" disabled={preview.hayErrores || pendiente} onClick={importar}>{pendiente ? "Importando…" : "Confirmar actualización"}</button></div>}{mensaje && <p role="status" className="mt-3 text-sm text-slate-600">{mensaje}</p>}
  </section>;
}
