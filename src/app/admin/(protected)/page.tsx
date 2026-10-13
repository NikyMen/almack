import { getMetricas } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PanelPersonalizable } from "@/components/panel-personalizable";

export default async function Panel() {
  const usuario = await requireAcceso("panel");
  const contexto = await getContextoSucursal();
  const metricas = await getMetricas(contexto.activaId);
  return <PanelPersonalizable metricas={metricas} sucursales={contexto.lista.map(s => ({ id: s.id, nombre: s.nombre }))} activaId={contexto.activaId} administrador={usuario.rol === "admin"} usuarioId={usuario.id} />;
}
