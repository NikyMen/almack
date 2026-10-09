import { getMetricas } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader, StatCard } from "@/components/ui";
import { BarChart, DonutChart, HBarChart } from "@/components/charts";
import { money } from "@/lib/format";
import Link from "next/link";
import { Sparkles, TrendingUp, Receipt, Package, Store } from "lucide-react";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function labelMes(ym: string) {
  const [, m] = ym.split("-");
  return MESES[Number(m) - 1] ?? ym;
}

export default async function Panel() {
  await requireAcceso("panel");
  const { activa, activaId } = await getContextoSucursal();
  const r = await getMetricas(activaId);

  const barData = r.ventasMes.slice(-6).map((m) => ({ label: labelMes(m.mes), value: m.total }));
  const canalData = r.porCanal.map((c) => ({ label: c.canal === "online" ? "Online" : "Local", value: c.total }));
  const invData = r.topInventario.map((p) => ({ label: p.nombre, value: p.valor }));
  // En la vista consolidada se agrega el reparto por local: es lo que no se ve
  // estando adentro de una sucursal.
  const sucursalData = r.porSucursal.map((s) => ({ label: s.nombre, value: s.total }));

  return (
    <>
      <PageHeader
        title="Panel"
        subtitle={activa ? `Indicadores de ${activa.nombre}.` : "Indicadores de todas las sucursales."}
        action={
          <Link href="/admin/ia" className="btn-primary">
            <Sparkles className="h-4 w-4" /> Preguntar a la IA
          </Link>
        }
      />

      {/* KPIs PyME */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ventas (completadas)" value={money(r.ventasTotal)} hint={`${r.ventasCount} operaciones`} accent />
        <StatCard label="Margen" value={money(r.margenBruto)} hint={`${r.margenPct.toFixed(1)}% · neto de compras y gastos`} />
        <StatCard label="Ticket promedio" value={money(r.ticketPromedio)} hint="por venta" />
        <StatCard label="Por cobrar" value={money(r.porCobrar.total)} hint={`${r.porCobrar.count} factura(s) emitidas`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Compras" value={money(r.comprasTotal)} />
        <StatCard label="Gastos" value={money(r.gastosTotal)} hint={`${r.gastosCount} movimiento(s)`} />
        <StatCard label="Valor de inventario" value={money(r.valorStock)} hint={activa ? `a costo · ${activa.nombre}` : "a costo"} />
        <StatCard label="Clientes" value={String(r.clientesCount)} />
        <StatCard label="Stock bajo" value={String(r.bajoStock.length)} hint="productos a reponer" />
      </div>

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

        {sucursalData.length > 0 && (
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Store className="h-4 w-4 text-navy" /> Ventas por sucursal</h2>
            <p className="mb-4 text-xs text-slate-400">Cuánto factura cada local · solo completadas</p>
            <HBarChart data={sucursalData} />
          </div>
        )}

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
