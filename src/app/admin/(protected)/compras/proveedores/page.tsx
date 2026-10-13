import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db, proveedorArticulos, proveedores } from "@/db";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProveedoresLista } from "@/components/proveedores-lista";

export default async function ProveedoresPage() {
  await requireAcceso("compras");
  const lista = await db.select({ proveedor: proveedores, articulos: sql<number>`count(${proveedorArticulos.id})` })
    .from(proveedores).leftJoin(proveedorArticulos, sql`${proveedorArticulos.proveedorId} = ${proveedores.id}`)
    .groupBy(proveedores.id).orderBy(asc(proveedores.nombre));
  return <>
    <Link href="/admin/compras" className="btn-ghost mb-4">← Opciones de compras</Link>
    <PageHeader title="Proveedores" subtitle="Contactos, catálogos y formatos de archivo en un solo lugar." />
    <ProveedoresLista lista={lista} />
  </>;
}
