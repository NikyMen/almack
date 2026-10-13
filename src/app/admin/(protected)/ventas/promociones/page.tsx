import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, productos, promociones } from "@/db";
import { PageHeader } from "@/components/ui";
import { PromocionesManager } from "@/components/promociones-manager";

export default async function PromocionesPage() {
  await requireAdmin();
  const [lista, catalogo] = await Promise.all([
    db.select().from(promociones).orderBy(desc(promociones.id)),
    db.select({ id: productos.id, nombre: productos.nombre }).from(productos).orderBy(asc(productos.nombre)),
  ]);
  return <>
    <Link href="/admin/ventas" className="btn-ghost mb-4">← Opciones de ventas</Link>
    <PageHeader title="Promociones" subtitle="Configurá descuentos automáticos y su calendario. Solo administradores." />
    <PromocionesManager promociones={lista} productos={catalogo} />
  </>;
}
