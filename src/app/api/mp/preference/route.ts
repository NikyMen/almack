import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, clientes, productos, tiendaPedidos, ventaItems, ventas } from "@/db";
import { crearPreferencia, mercadopagoConfigurado } from "@/lib/mercadopago";

export const runtime = "nodejs";

type ItemReq = { productoId: number; cantidad: number };
type CheckoutBody = {
  checkoutId?: string;
  nombre?: string;
  telefono?: string;
  direccion?: string;
  franjaEntrega?: string;
  fechaEntrega?: string;
  lat?: number;
  lng?: number;
  items?: ItemReq[];
};

function cleanItems(items: ItemReq[] | undefined): ItemReq[] {
  const grouped = new Map<number, number>();
  for (const item of items ?? []) {
    const id = Number(item.productoId);
    const quantity = Number(item.cantidad);
    if (Number.isInteger(id) && id > 0 && Number.isInteger(quantity) && quantity > 0) {
      grouped.set(id, (grouped.get(id) ?? 0) + quantity);
    }
  }
  return [...grouped].map(([productoId, cantidad]) => ({ productoId, cantidad }));
}

export async function POST(req: Request) {
  if (!mercadopagoConfigurado()) {
    return NextResponse.json({ error: "La tienda no está disponible por el momento." }, { status: 503 });
  }

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const items = cleanItems(body.items);
  if (!items.length) return NextResponse.json({ error: "El carrito está vacío." }, { status: 400 });

  const checkoutId = typeof body.checkoutId === "string" && body.checkoutId.length >= 8 ? body.checkoutId : randomUUID();
  const ids = items.map((item) => item.productoId);
  const prods = await db.select().from(productos).where(inArray(productos.id, ids));
  const byId = new Map(prods.map((product) => [product.id, product]));

  for (const item of items) {
    const product = byId.get(item.productoId);
    if (!product || !product.publicado) return NextResponse.json({ error: "Hay un producto que ya no está disponible." }, { status: 400 });
    if (product.stock < item.cantidad) return NextResponse.json({ error: `Sin stock suficiente de "${product.nombre}" (quedan ${product.stock}).` }, { status: 400 });
  }

  const total = items.reduce((sum, item) => sum + byId.get(item.productoId)!.precioVenta * item.cantidad, 0);
  const nombre = String(body.nombre ?? "").trim();
  const telefono = String(body.telefono ?? "").trim();
  const direccion = String(body.direccion ?? "").trim();

  const existing = await db.select({ pedido: tiendaPedidos, venta: ventas }).from(tiendaPedidos).innerJoin(ventas, eq(ventas.id, tiendaPedidos.ventaId)).where(eq(tiendaPedidos.checkoutId, checkoutId)).limit(1);
  if (existing[0]?.pedido.initPointMp) return NextResponse.json({ initPoint: existing[0].pedido.initPointMp, reused: true });

  const venta = await db.transaction(async (tx) => {
    let clienteId: number | null = null;
    if (telefono) {
      const found = await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.telefono, telefono)).limit(1);
      if (found[0]) clienteId = found[0].id;
      else {
        const [created] = await tx.insert(clientes).values({ nombre: nombre || "Cliente online", telefono, direccion }).returning({ id: clientes.id });
        clienteId = created?.id ?? null;
      }
    }

    const [createdVenta] = await tx.insert(ventas).values({ total, estado: "pendiente", canal: "online", medioPago: "mercadopago", clienteId }).returning({ id: ventas.id });
    await tx.insert(ventaItems).values(items.map((item) => ({ ventaId: createdVenta.id, productoId: item.productoId, cantidad: item.cantidad, precioUnit: byId.get(item.productoId)!.precioVenta })));
    await tx.insert(tiendaPedidos).values({ ventaId: createdVenta.id, checkoutId, nombre, telefono, direccion, franjaEntrega: String(body.franjaEntrega ?? ""), fechaEntrega: String(body.fechaEntrega ?? ""), lat: typeof body.lat === "number" ? body.lat : null, lng: typeof body.lng === "number" ? body.lng : null });
    return createdVenta;
  });

  try {
    const preference = await crearPreferencia({
      ventaId: venta.id,
      items: items.map((item) => {
        const product = byId.get(item.productoId)!;
        return { title: product.nombre, quantity: item.cantidad, unit_price: product.precioVenta };
      }),
    });
    await db.update(tiendaPedidos).set({ preferenciaMp: preference.id, initPointMp: preference.initPoint }).where(eq(tiendaPedidos.ventaId, venta.id));
    return NextResponse.json({ initPoint: preference.initPoint });
  } catch (error) {
    await db.update(ventas).set({ estado: "cancelada" }).where(eq(ventas.id, venta.id));
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo iniciar el pago." }, { status: 502 });
  }
}
