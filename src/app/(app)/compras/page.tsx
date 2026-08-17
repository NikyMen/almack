import { db, compras } from "@/db";
import { desc } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ComprasTabla } from "@/components/compras-tabla";
import { money } from "@/lib/format";

export default async function ComprasPage() {
  await requireAcceso("compras");
  const items = await db.select().from(compras).orderBy(desc(compras.fecha));
  const total = items.reduce((a, c) => a + c.total, 0);
  return (
    <>
      <PageHeader title="Compras" subtitle={`${items.length} órdenes · ${money(total)} invertido`} />
      <ComprasTabla compras={items} />
    </>
  );
}
