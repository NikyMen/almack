import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, proveedorArticulos, proveedorFormatos, proveedores } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProveedorDetalle } from "@/components/proveedor-detalle";

export const maxDuration = 180;

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAcceso("compras");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [[proveedor], articulos, formatos] = await Promise.all([
    db.select().from(proveedores).where(eq(proveedores.id, id)).limit(1),
    db.select().from(proveedorArticulos).where(eq(proveedorArticulos.proveedorId, id)).orderBy(asc(proveedorArticulos.nombre)),
    db.select().from(proveedorFormatos).where(eq(proveedorFormatos.proveedorId, id)).orderBy(asc(proveedorFormatos.nombre)),
  ]);
  if (!proveedor) notFound();
  return <>
    <Link href="/admin/compras/proveedores" className="btn-ghost mb-4">← Todos los proveedores</Link>
    <PageHeader title={proveedor.nombre} subtitle={`${articulos.length} artículos · ${formatos.length} formatos configurados`} />
    <ProveedorDetalle proveedor={proveedor} articulos={articulos} formatos={formatos} />
  </>;
}
