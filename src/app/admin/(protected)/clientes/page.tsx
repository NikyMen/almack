import { db, clientes } from "@/db";
import { desc, eq, or, sql } from "drizzle-orm";
import { ventas } from "@/db";
import { getContextoSucursal } from "@/lib/sucursal";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientesManager } from "@/components/clientes-manager";

export default async function ClientesPage() {
  await requireAcceso("clientes");
  const { activaId } = await getContextoSucursal();
  const items = await db.select().from(clientes).where(activaId ? or(
    eq(clientes.sucursalId, activaId),
    sql`exists (select 1 from ${ventas} where ${ventas.clienteId} = ${clientes.id} and ${ventas.sucursalId} = ${activaId})`
  ) : undefined).orderBy(desc(clientes.id));
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${items.length} clientes registrados.`} />
      <ClientesManager items={items} />
    </>
  );
}
