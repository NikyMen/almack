import { and, asc, eq, like, or } from "drizzle-orm";
import { db, productos, tiendaProductoMeta } from "@/db";
import type { Product, SuperOferta } from "@/lib/types";

export type TiendaProducto = {
  id: string;
  dbId: number;
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  category: string;
  image: string;
  badge?: string;
  dailyOffer: boolean;
  available: boolean;
  stock: number;
};

function imageUrl(image: string | null | undefined): string {
  const value = image?.trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return "";
}

function mapProduct(row: {
  producto: typeof productos.$inferSelect;
  meta: typeof tiendaProductoMeta.$inferSelect | null;
}): TiendaProducto {
  const p = row.producto;
  const m = row.meta;
  const description = (p.descripcionWeb || p.descripcion || "").trim();
  return {
    id: String(p.id),
    dbId: p.id,
    name: p.nombre,
    description,
    price: Number(p.precioVenta),
    oldPrice: m?.precioAnterior ? Number(m.precioAnterior) : undefined,
    category: p.categoria || "General",
    image: imageUrl(p.imagen),
    badge: m?.badge?.trim() || undefined,
    dailyOffer: Boolean(m?.ofertaDelDia),
    available: Boolean(p.publicado),
    stock: Math.max(0, Number(p.stock)),
  };
}

export async function listTiendaProductos(opts: {
  search?: string;
  ofertas?: boolean;
} = {}): Promise<TiendaProducto[]> {
  const search = opts.search?.trim();
  const conditions = [eq(productos.publicado, true)];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(like(productos.nombre, pattern), like(productos.descripcion, pattern))!);
  }
  if (opts.ofertas) {
    conditions.push(eq(tiendaProductoMeta.ofertaDelDia, true));
  }

  const rows = await db
    .select({ producto: productos, meta: tiendaProductoMeta })
    .from(productos)
    .leftJoin(tiendaProductoMeta, eq(tiendaProductoMeta.productoId, productos.id))
    .where(and(...conditions))
    .orderBy(asc(productos.nombre));

  return rows.map(mapProduct);
}

export async function getTiendaProducto(id: number): Promise<TiendaProducto | null> {
  const rows = await db
    .select({ producto: productos, meta: tiendaProductoMeta })
    .from(productos)
    .leftJoin(tiendaProductoMeta, eq(tiendaProductoMeta.productoId, productos.id))
    .where(and(eq(productos.id, id), eq(productos.publicado, true)))
    .limit(1);
  return rows[0] ? mapProduct(rows[0]) : null;
}

export async function listTiendaOfertas(): Promise<TiendaProducto[]> {
  return listTiendaProductos({ ofertas: true });
}

export function tiendaToStoreProduct(product: TiendaProducto): Product {
  return { id: product.id, name: product.name, description: product.description, price: product.price, oldPrice: product.oldPrice, category: product.category || "General", image: product.image, badge: product.badge, dailyOffer: product.dailyOffer, available: product.available, stock: product.stock };
}

export function tiendaToSuperOferta(product: TiendaProducto): SuperOferta {
  return { id: `tienda-${product.id}`, title: product.name, subtitle: product.description || "Oferta publicada desde GestorIA", price: product.price, oldPrice: product.oldPrice, image: product.image || "/brand/logo-cd.webp", cartProductId: product.id, cartQuantity: 1, link: "/tienda/ofertas", active: true };
}
