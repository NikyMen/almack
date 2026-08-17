"use server";

import { db, productos, clientes, compras, ventas, ventaItems, tiendaProductoMeta } from "@/db";
import { eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { descontarStock } from "@/lib/stock";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/medios-pago";
import { esEstadoCompra } from "@/lib/compras";
import {
  generarDescripcionProducto,
  generarPublicacionRedes,
  consultaNegocio,
} from "@/lib/ai";
import { getContextoNegocio } from "@/lib/queries";

// --- Productos ---------------------------------------------------------------
// Campos comunes a los formularios de alta y edición de producto.
function datosProducto(fd: FormData) {
  return {
    nombre: String(fd.get("nombre") || "").trim(),
    sku: String(fd.get("sku") || ""),
    categoria: String(fd.get("categoria") || "General"),
    precioVenta: Number(fd.get("precioVenta") || 0),
    precioCompra: Number(fd.get("precioCompra") || 0),
    stock: Number(fd.get("stock") || 0),
    stockMinimo: Number(fd.get("stockMinimo") || 5),
    imagen: String(fd.get("imagen") || "").trim(),
  };
}

export async function crearProducto(formData: FormData) {
  const d = datosProducto(formData);
  if (!d.nombre) return;
  await db.insert(productos).values({
    ...d,
    sku: d.sku || `SKU-${Date.now()}`,
    descripcion: String(formData.get("descripcion") || ""),
  });
  revalidatePath("/stock");
  revalidatePath("/");
}

export async function editarProducto(id: number, formData: FormData) {
  const d = datosProducto(formData);
  if (!d.nombre) return;
  await db.update(productos).set(d).where(eq(productos.id, id));
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/tienda/productos");
}

export async function eliminarProducto(id: number) {
  await db.delete(productos).where(eq(productos.id, id));
  revalidatePath("/stock");
  revalidatePath("/");
}

export async function ajustarStock(id: number, delta: number) {
  // Update atómico: no lee antes de escribir, así dos ajustes concurrentes no se pisan.
  await db
    .update(productos)
    .set({ stock: sql`max(0, ${productos.stock} + ${delta})` })
    .where(eq(productos.id, id));
  revalidatePath("/stock");
}

export async function togglePublicado(id: number) {
  await db
    .update(productos)
    .set({ publicado: sql`not ${productos.publicado}` })
    .where(eq(productos.id, id));
  revalidatePath("/tienda");
  revalidatePath("/stock");
}

export async function toggleOfertaTienda(id: number) {
  const [meta] = await db.select().from(tiendaProductoMeta).where(eq(tiendaProductoMeta.productoId, id)).limit(1);
  if (meta) {
    await db.update(tiendaProductoMeta).set({ ofertaDelDia: !meta.ofertaDelDia }).where(eq(tiendaProductoMeta.productoId, id));
  } else {
    await db.insert(tiendaProductoMeta).values({ productoId: id, ofertaDelDia: true });
  }
  revalidatePath("/tienda");
  revalidatePath("/tienda/ofertas");
  revalidatePath("/stock");
}

export async function guardarDescripcionWeb(id: number, texto: string) {
  await db.update(productos).set({ descripcionWeb: texto }).where(eq(productos.id, id));
  revalidatePath("/tienda");
}

// --- Clientes ----------------------------------------------------------------
export async function crearCliente(formData: FormData) {
  const nombre = String(formData.get("nombre") || "").trim();
  if (!nombre) return;
  await db.insert(clientes).values({
    nombre,
    email: String(formData.get("email") || ""),
    telefono: String(formData.get("telefono") || ""),
    cuit: String(formData.get("cuit") || ""),
    direccion: String(formData.get("direccion") || ""),
  });
  revalidatePath("/clientes");
}

// --- Caja (punto de venta) ---------------------------------------------------
type ItemCaja = { productoId: number; cantidad: number };

// Cierra un pedido de caja: registra la venta + ítems y descuenta stock.
// Devuelve el id y total para mostrar el ticket sin recargar.
// `opts` lo usa el alta manual desde Ventas (cliente y canal); la Caja no lo pasa.
export async function cobrarVenta(
  items: ItemCaja[],
  medioPago: MedioPago = "efectivo",
  opts?: { clienteId?: number | null; canal?: string }
) {
  const limpios = items.filter((i) => i.cantidad > 0);
  if (limpios.length === 0) return { ok: false as const, error: "El pedido está vacío." };

  // Traemos los productos involucrados para fijar precio y validar stock.
  const ids = limpios.map((i) => i.productoId);
  const prods = await db.select().from(productos).where(inArray(productos.id, ids));
  const byId = new Map(prods.map((p) => [p.id, p]));

  for (const it of limpios) {
    const p = byId.get(it.productoId);
    if (!p) return { ok: false as const, error: "Hay un producto que ya no existe." };
    if (p.stock < it.cantidad)
      return { ok: false as const, error: `Sin stock suficiente de "${p.nombre}" (quedan ${p.stock}).` };
  }

  const total = limpios.reduce((a, it) => a + (byId.get(it.productoId)!.precioVenta * it.cantidad), 0);

  const medio = MEDIOS_PAGO.includes(medioPago) ? medioPago : "efectivo";

  const [venta] = await db
    .insert(ventas)
    .values({
      total,
      estado: "completada",
      canal: opts?.canal === "online" ? "online" : "local",
      medioPago: medio,
      clienteId: opts?.clienteId ?? null,
    })
    .returning({ id: ventas.id });

  await db.insert(ventaItems).values(
    limpios.map((it) => ({
      ventaId: venta.id,
      productoId: it.productoId,
      cantidad: it.cantidad,
      precioUnit: byId.get(it.productoId)!.precioVenta,
    }))
  );
  await descontarStock(limpios);

  revalidatePath("/caja");
  revalidatePath("/ventas");
  revalidatePath("/stock");
  revalidatePath("/");
  return { ok: true as const, ventaId: venta.id, total };
}

// --- Compras -----------------------------------------------------------------
export async function crearCompra(formData: FormData) {
  const proveedor = String(formData.get("proveedor") || "").trim();
  if (!proveedor) return;
  const estado = String(formData.get("estado") || "pedido");
  await db.insert(compras).values({
    proveedor,
    total: Number(formData.get("total") || 0),
    estado: esEstadoCompra(estado) ? estado : "pedido",
    detalle: String(formData.get("detalle") || ""),
  });
  revalidatePath("/compras");
  revalidatePath("/");
}

// --- IA ----------------------------------------------------------------------
export async function accionDescripcion(nombre: string, categoria: string, detalles: string) {
  try {
    return { ok: true as const, texto: await generarDescripcionProducto({ nombre, categoria, detalles }) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function accionPublicacion(
  nombre: string,
  red: "instagram" | "facebook" | "tiktok" | "whatsapp",
  promo: string
) {
  try {
    return { ok: true as const, texto: await generarPublicacionRedes({ nombre, red, promo }) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function accionConsulta(pregunta: string) {
  try {
    const contexto = await getContextoNegocio();
    return { ok: true as const, texto: await consultaNegocio({ pregunta, contexto }) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
