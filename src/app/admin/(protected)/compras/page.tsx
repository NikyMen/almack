import Link from "next/link";
import { db, compras } from "@/db";
import { desc, eq } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { PageHeader } from "@/components/ui";
import { ComprasTabla } from "@/components/compras-tabla";
import { money } from "@/lib/format";
import { SectionCards } from "@/components/section-cards";
import { ClipboardList, ChartNoAxesCombined } from "lucide-react";

export const maxDuration = 180;

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  await requireAcceso("compras");
  if ((await searchParams).vista !== "historial") {
    return <>
      <PageHeader title="Compras" subtitle="Elegí cómo querés gestionar tus compras." />
      <SectionCards items={[
        { href: "/admin/compras?vista=historial", title: "Ver compras", description: "Consultá el historial de órdenes y los importes invertidos.", icon: ClipboardList },
        { href: "/admin/compras/diferencias-precios", title: "Diferencias de precios", description: "Revisá cambios de costos y decisiones de revalorización.", icon: ChartNoAxesCombined },
      ]} />
    </>;
  }
  const { lista, activa, activaId } = await getContextoSucursal();
  const items = await db
    .select()
    .from(compras)
    .where(activaId ? eq(compras.sucursalId, activaId) : undefined)
    .orderBy(desc(compras.fecha));
  const total = items.reduce((a, c) => a + c.total, 0);
  return (
    <>
      <Link href="/admin/compras" className="btn-ghost mb-4">← Opciones de compras</Link>
      <PageHeader
        title="Compras"
        subtitle={`${items.length} órdenes · ${money(total)} invertido${activa ? ` · ${activa.nombre}` : ""}`}
      />
      <ComprasTabla compras={items} sucursales={lista} sucursalActivaId={activaId} />
    </>
  );
}
