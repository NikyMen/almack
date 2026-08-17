import { getMetricas } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/ui";
import { BarChart, DonutChart, HBarChart } from "@/components/charts";
import { money } from "@/lib/format";
import Link from "next/link";
import { Sparkles, TriangleAlert, TrendingUp, Receipt, Package } from "lucide-react";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function labelMes(ym: string) {
  const [, m] = ym.split("-");
  return MESES[Number(m) - 1] ?? ym;
}

export default async function Panel() {
  await requireAcceso("panel");
  const r = await getMetricas();

  const barData = r.ventasMes.slice(-6).map((m) => ({ label: labelMes(m.mes), value: m.total }));
  const canalData = r.porCanal.map((c) => ({ label: c.canal === "online" ? "Online" : "Local", value: c.total }));
  const invData = r.topInventario.map((p) => ({ label: p.nombre, value: p.valor }));

  return (
    <>
      <PageHeader
        title="Panel"
        subtitle="Indicadores clave de tu negocio."
        action={
          <Link href="/ia" className="btn-primary">
            <Sparkles className="h-4 w-4" /> Preguntar a la IA
          </Link>
        }
      />

      {/* KPIs PyME */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ventas (completadas)" value={money(r.ventasTotal)} hint={`${r.ventasCount} operaciones`} accent />
        <StatCard label="Margen bruto" value={money(r.margenBruto)} hint={`${r.margenPct.toFixed(1)}% sobre ventas`} />
        <StatCard label="Ticket promedio" value={money(r.ticketPromedio)} hint="por venta" />
        <StatCard label="Por cobrar" value={money(r.porCobrar.total)} hint={`${r.porCobrar.count} factura(s) emitidas`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Compras" value={money(r.comprasTotal)} />
        <StatCard label="Valor de inventario" value={money(r.valorStock)} hint="a costo" />
        <StatCard label="Clientes" value={String(r.clientesCount)} />
        <StatCard label="Stock bajo" value={String(r.bajoStock.length)} hint="productos a reponer" />
      </div>

      {r.bajoStock.length > 0 && (
        <div className="card mt-6 border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {r.bajoStock.length} producto(s) con stock bajo
          </p>
          <p className="mt-1 text-sm text-amber-700">
            {r.bajoStock.map((p) => `${p.nombre} (${p.stock})`).join(" · ")}
          </p>
        </div>
      )}

      {/* Gráficos */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4 text-navy" /> Ventas por mes</h2>
          <p className="mb-4 text-xs text-slate-400">Últimos {barData.length} meses · solo completadas</p>
          {barData.length ? <BarChart data={barData} /> : <Vacio />}
        </div>

        <div className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Receipt className="h-4 w-4 text-navy" /> Ventas por canal</h2>
          <p className="mb-4 text-xs text-slate-400">Distribución local vs online</p>
          {canalData.length ? <DonutChart data={canalData} /> : <Vacio />}
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Package className="h-4 w-4 text-navy" /> Top inventario por valor</h2>
          <p className="mb-4 text-xs text-slate-400">Productos que más capital inmovilizan (a costo)</p>
          {invData.length ? <HBarChart data={invData} /> : <Vacio />}
        </div>
      </div>
    </>
  );
}

function Vacio() {
  return <p className="py-8 text-center text-sm text-slate-400">Sin datos todavía.</p>;
}
