import { sql } from "drizzle-orm";
import { db, proveedores } from "@/db";

export async function proveedorIdPorNombre(nombre: string): Promise<number | null> {
  const [proveedor] = await db.select({ id: proveedores.id }).from(proveedores)
    .where(sql`lower(${proveedores.nombre}) = lower(${nombre.trim()})`)
    .limit(1);
  return proveedor?.id ?? null;
}
