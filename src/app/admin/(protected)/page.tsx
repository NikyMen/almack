import { getMetricas } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PanelPersonalizable } from "@/components/panel-personalizable";

export default async function Panel() {
  const usuario = await requireAcceso("panel");
  if (usuario.rol !== "admin") return <div className="card p-6 text-sm text-slate-600">Los indicadores de ventas y dinero están disponibles solo para administración. Usá Caja para operar tu turno.</div>;
  const contexto = await getContextoSucursal();
  const metricas = await getMetricas(contexto.activaId);
  return <PanelPersonalizable metricas={metricas} sucursales={contexto.lista.map(s => ({ id: s.id, nombre: s.nombre }))} activaId={contexto.activaId} administrador={usuario.rol === "admin"} usuarioId={usuario.id} />;
}
