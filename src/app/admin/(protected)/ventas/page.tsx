import { History, TicketPercent, Vault } from "lucide-react";
import { SectionCards } from "@/components/section-cards";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export default async function VentasPage() {
  const usuario = await requireAcceso("ventas");
  return <><PageHeader title="Ventas" subtitle="Elegí qué querés consultar o configurar." /><SectionCards items={[
    { href: "/admin/ventas/historial", title: "Ventas históricas", description: "Consultá todas las operaciones por fecha, sucursal y usuario.", icon: History },
    ...(usuario.rol === "admin" ? [{ href: "/admin/caja/historial", title: "Historial de apertura y cierre de caja", description: "Revisá los conteos, responsables y diferencias de cada turno.", icon: Vault }] : []),
    ...(usuario.rol === "admin" ? [{ href: "/admin/ventas/promociones", title: "Promociones", description: "Configurá descuentos, combos y sus fechas de vigencia.", icon: TicketPercent }] : []),
  ]} /></>;
}
