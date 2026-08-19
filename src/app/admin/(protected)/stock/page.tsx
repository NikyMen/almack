import { db, productos } from "@/db";
import { desc } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { StockManager } from "@/components/stock-manager";

export default async function StockPage() {
  await requireAcceso("stock");
  const items = await db.select().from(productos).orderBy(desc(productos.id));
  return (
    <>
      <PageHeader title="Stock" subtitle="Inventario, precios y publicación en la tienda." />
      <StockManager items={items} />
    </>
  );
}
