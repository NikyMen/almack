import Link from "next/link";
import { and, desc, eq, lt, ne, or, type SQL } from "drizzle-orm";
import { db, cajaTurnos } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getSucursales } from "@/lib/sucursal";
import { money } from "@/lib/format";

type Params = { sucursal?: string; diferencia?: string; antes?: string };
const fecha = (value: Date | null) => value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(value) : "—";

export default async function HistorialCaja({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const sucursales = await getSucursales();
  const sucursalId = Number(params.sucursal);
  const sucursal = sucursales.find(s => s.id === sucursalId);
  const diferencia = ["apertura", "cierre", "ambas"].includes(params.diferencia ?? "") ? params.diferencia : "todas";
  const antes = Number(params.antes);
  const filtros: SQL[] = [];
  if (sucursal) filtros.push(eq(cajaTurnos.sucursalId, sucursal.id));
  if (Number.isSafeInteger(antes) && antes > 0) filtros.push(lt(cajaTurnos.id, antes));
  if (diferencia === "apertura") filtros.push(ne(cajaTurnos.diferenciaApertura, 0));
  if (diferencia === "cierre") filtros.push(ne(cajaTurnos.diferencia, 0));
  if (diferencia === "ambas") filtros.push(or(ne(cajaTurnos.diferenciaApertura, 0), ne(cajaTurnos.diferencia, 0))!);
  const registros = await db.select().from(cajaTurnos).where(filtros.length ? and(...filtros) : undefined).orderBy(desc(cajaTurnos.id)).limit(31);
  const mas = registros.length > 30;
  const visibles = registros.slice(0, 30);
  const siguiente = new URLSearchParams();
  if (sucursal) siguiente.set("sucursal", String(sucursal.id));
  if (diferencia !== "todas") siguiente.set("diferencia", diferencia!);
  if (mas) siguiente.set("antes", String(visibles.at(-1)?.id));

  return <main className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-navy">Historial de caja</h1><p className="text-sm text-slate-500">Conteos de apertura y cierre, con sus diferencias registradas.</p></div><Link href="/admin/caja" className="btn-ghost">Volver a caja</Link></div>
    <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-1"><label className="label" htmlFor="sucursal">Sucursal</label><select id="sucursal" name="sucursal" defaultValue={sucursal?.id ?? ""} className="input"><option value="">Todas</option>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
      <div className="min-w-40 flex-1"><label className="label" htmlFor="diferencia">Filtrar diferencias</label><select id="diferencia" name="diferencia" defaultValue={diferencia} className="input"><option value="todas">Todas</option><option value="apertura">En apertura</option><option value="cierre">En cierre</option><option value="ambas">En cualquiera</option></select></div>
      <button className="btn-primary">Filtrar</button>
    </form>
    <div className="space-y-3">{visibles.length === 0 && <div className="card p-5 text-sm text-slate-500">No hay registros para este filtro.</div>}{visibles.map(t => <article key={t.id} className="card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Turno #{t.id} · {sucursales.find(s => s.id === t.sucursalId)?.nombre ?? "Sucursal archivada"}</strong><span className="text-xs text-slate-500">{t.estado === "abierta" ? "Abierta" : `Cerrada ${fecha(t.cerradoEn)}`}</span></div><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold">Apertura · {fecha(t.abiertoEn)}</p><p>Contado: {money(t.fondoInicial)}</p><p>Esperado: {t.fondoEsperado === null ? "Sin registro anterior" : money(t.fondoEsperado)}</p><p className={t.diferenciaApertura ? "font-semibold text-rose-700" : "text-slate-600"}>Diferencia: {t.diferenciaApertura === null ? "No disponible" : money(t.diferenciaApertura)}</p><p className="text-slate-500">{t.responsable}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold">Cierre</p>{t.estado === "cerrada" ? <><p>Contado: {money(t.efectivoContado ?? 0)}</p><p>Esperado: {money(t.efectivoEsperado ?? 0)}</p><p className={t.diferencia ? "font-semibold text-rose-700" : "text-slate-600"}>Diferencia: {money(t.diferencia ?? 0)}</p><p className="text-slate-500">{t.cerradoPor}</p>{t.observaciones && <p className="mt-1">{t.observaciones}</p>}</> : <p className="text-slate-500">Turno en curso.</p>}</div></div></article>)}</div>
    {mas && <Link className="btn-ghost inline-flex" href={`/admin/caja/historial?${siguiente.toString()}`}>Ver registros anteriores</Link>}
  </main>;
}
