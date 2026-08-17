import { listTiendaProductos, tiendaToStoreProduct } from "@/lib/tienda";
import { ProductCatalog } from "@/components/store/ProductCatalog";

export const dynamic = "force-dynamic";

export default async function TiendaProductosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = (await listTiendaProductos()).map(tiendaToStoreProduct);
  return <div className="space-y-4 px-4 pt-4 md:px-6 md:pt-8"><h1 className="text-lg font-bold text-brand-ink md:text-3xl">{q ? `Resultados para “${q}”` : "Nuestros Productos"}</h1><ProductCatalog products={products} query={q} /></div>;
}
