"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { seleccionarSucursal } from "@/app/actions";
import { PageHeader, StatCard } from "@/components/ui";
import { BarChart, DonutChart, HBarChart } from "@/components/charts";
import { money } from "@/lib/format";
import type { getMetricas } from "@/lib/queries";

type Metricas = Awaited<ReturnType<typeof getMetricas>>;
type TipoGrafico = "barras" | "horizontales" | "dona";
type Preferencias = { tarjetas: string[]; graficos: Record<string, TipoGrafico | "oculto"> };
const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const tarjetas = [
  ["ventas", "Ventas completadas"], ["margen", "Margen"], ["ticket", "Ticket promedio"], ["cobrar", "Por cobrar"],
  ["compras", "Compras"], ["gastos", "Gastos"], ["inventario", "Valor de inventario"], ["clientes", "Clientes"], ["stock", "Stock bajo"],
] as const;
const graficos = [["mes", "Ventas por mes"], ["canal", "Ventas por canal"], ["sucursal", "Ventas por sucursal"], ["inventario", "Top inventario por valor"]] as const;
const inicial: Preferencias = { tarjetas: tarjetas.map(t => t[0]), graficos: { mes: "barras", canal: "dona", sucursal: "horizontales", inventario: "horizontales" } };

export function PanelPersonalizable({ metricas: r, sucursales, activaId, administrador, usuarioId }: { metricas: Metricas; sucursales: { id: number; nombre: string }[]; activaId: number | null; administrador: boolean; usuarioId: number }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [configurar, setConfigurar] = useState(false);
  const [preferencias, setPreferencias] = useState<Preferencias>(inicial);
  const clave = `almack-panel-${usuarioId}`;
  useEffect(() => { try { const guardadas = JSON.parse(localStorage.getItem(clave) ?? "null") as Preferencias | null; if (guardadas && Array.isArray(guardadas.tarjetas) && guardadas.graficos) setPreferencias(guardadas); } catch { /* usar valores iniciales */ } }, [clave]);
  const cambiar = (p: Preferencias) => { setPreferencias(p); localStorage.setItem(clave, JSON.stringify(p)); };
  const valores: Record<string, { value: string; hint?: string }> = {
    ventas: { value: money(r.ventasTotal), hint: `${r.ventasCount} operaciones` }, margen: { value: money(r.margenBruto), hint: `${r.margenPct.toFixed(1)}% · ventas menos compras y gastos` },
    ticket: { value: money(r.ticketPromedio), hint: "por venta" }, cobrar: { value: money(r.porCobrar.total), hint: `${r.porCobrar.count} factura(s)` },
    compras: { value: money(r.comprasTotal) }, gastos: { value: money(r.gastosTotal), hint: `${r.gastosCount} movimiento(s)` },
    inventario: { value: money(r.valorStock), hint: "a costo" }, clientes: { value: String(r.clientesCount) }, stock: { value: String(r.bajoStock.length), hint: "productos a reponer" },
  };
  const datos: Record<string, { label: string; value: number }[]> = {
    mes: r.ventasMes.slice(-6).map(x => ({ label: meses[Number(x.mes.split("-")[1]) - 1] ?? x.mes, value: x.total })),
    canal: r.porCanal.map(x => ({ label: x.canal === "online" ? "Online" : "Local", value: x.total })),
    sucursal: r.porSucursal.map(x => ({ label: x.nombre, value: x.total })),
    inventario: r.topInventario.map(x => ({ label: x.nombre, value: x.valor })),
  };
  const seleccionar = (valor: string) => start(async () => { const id = valor === "todas" ? null : Number(valor); const res = await seleccionarSucursal(id); if (res.ok) router.refresh(); });
  return <>
    <PageHeader title="Panel" subtitle={activaId ? `Indicadores de ${sucursales.find(s => s.id === activaId)?.nombre ?? "la sucursal"}.` : "Indicadores de todas las sucursales."} action={<Link href="/admin/ia" className="btn-primary"><Sparkles className="h-4 w-4" /> Preguntar a la IA</Link>} />
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
      {administrador && <label className="text-sm font-medium">Sucursal<select aria-label="Sucursal del panel" className="input mt-1" value={activaId ?? "todas"} disabled={pendiente} onChange={e => seleccionar(e.target.value)}><option value="todas">Todas las sucursales</option>{sucursales.map(s => <option value={s.id} key={s.id}>{s.nombre}</option>)}</select></label>}
      <button className="btn-ghost" onClick={() => setConfigurar(!configurar)}><SlidersHorizontal className="h-4 w-4" /> Personalizar panel</button>
      <p className="text-xs text-slate-500">Las preferencias se guardan en este navegador.</p>
    </div>
    {configurar && <section className="card mb-5 grid gap-5 p-5 lg:grid-cols-2"><div><h2 className="mb-2 font-semibold">Métricas visibles</h2><div className="grid gap-2 sm:grid-cols-2">{tarjetas.map(([id, nombre]) => <label key={id} className="flex gap-2 text-sm"><input type="checkbox" checked={preferencias.tarjetas.includes(id)} onChange={e => cambiar({ ...preferencias, tarjetas: e.target.checked ? [...preferencias.tarjetas, id] : preferencias.tarjetas.filter(x => x !== id) })} />{nombre}</label>)}</div></div><div><h2 className="mb-2 font-semibold">Gráficos y formato</h2><div className="space-y-2">{graficos.filter(([id]) => id !== "sucursal" || (!activaId && administrador)).map(([id, nombre]) => <label key={id} className="flex items-center justify-between gap-2 text-sm"><span>{nombre}</span><select className="input w-auto" value={preferencias.graficos[id] ?? "oculto"} onChange={e => cambiar({ ...preferencias, graficos: { ...preferencias.graficos, [id]: e.target.value as TipoGrafico | "oculto" } })}><option value="oculto">Oculto</option><option value="barras">Barras verticales</option><option value="horizontales">Barras horizontales</option><option value="dona">Dona</option></select></label>)}</div></div></section>}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{tarjetas.filter(([id]) => preferencias.tarjetas.includes(id)).map(([id, nombre]) => <StatCard key={id} label={nombre} value={valores[id].value} hint={valores[id].hint} accent={id === "ventas"} />)}</div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">{graficos.filter(([id]) => preferencias.graficos[id] !== "oculto" && (id !== "sucursal" || (!activaId && administrador))).map(([id, nombre]) => <div key={id} className="card p-5"><h2 className="mb-4 text-base font-semibold">{nombre}</h2>{!datos[id].length ? <p className="py-8 text-center text-sm text-slate-400">Sin datos todavía.</p> : preferencias.graficos[id] === "dona" ? <DonutChart data={datos[id]} /> : preferencias.graficos[id] === "barras" ? <BarChart data={datos[id]} /> : <HBarChart data={datos[id]} />}</div>)}</div>
  </>;
}
