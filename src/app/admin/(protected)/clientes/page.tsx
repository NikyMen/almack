import { db, clientes } from "@/db";
import { desc } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientesManager } from "@/components/clientes-manager";

export default async function ClientesPage() {
  await requireAcceso("clientes");
  const items = await db.select().from(clientes).orderBy(desc(clientes.id));
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${items.length} clientes registrados.`} />
      <ClientesManager items={items} />
    </>
  );
}
