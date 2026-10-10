"use server";
import { leerReglasStock, precioDesdeCosto } from "@/lib/reglas-stock";
import { venderEnCaja } from "@/lib/caja";

import { db, productos, clientes, compras, ventas, ventaItems, tiendaProductoMeta, sucursales, stockSucursal, stockTransito, stockMovimientos, cajaTurnos } from "@/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  ajustarStockEnSucursal,
  descontarStock,
  fijarStockEnSucursal,
  stockDeSucursal,
} from "@/lib/stock";
import { COOKIE_SUCURSAL, TODAS, getSucursales, sucursalOperativaId } from "@/lib/sucursal";
import { getUsuarioActual, requireAcceso, requireAdmin } from "@/lib/auth";
import { esSuperAdmin } from "@/lib/permisos";
import { cantidadValida, type UnidadMedida } from "@/lib/cantidades";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/medios-pago";
import { esEstadoCompra } from "@/lib/compras";
import {
  generarDescripcionProducto,
  generarPublicacionRedes,
  consultaNegocio,
} from "@/lib/ai";
import { getContextoNegocio } from "@/lib/queries";
import { borrarImagenProducto, guardarImagenProducto } from "@/lib/imagenes-producto";

// --- Sucursales --------------------------------------------------------------
// Alta, renombrado y cambio de local. Todo esto cuelga del logo de Almack en el
// panel y es exclusivo del superadmin (ver esSuperAdmin en src/lib/permisos.ts).

async function requireSuperAdmin() {
  const u = await getUsuarioActual();
  if (!esSuperAdmin(u)) return null;
  return u;
}

/** Cambia el local en el que está parado el panel. `null` = todas. */
export async function seleccionarSucursal(id: number | null) {
  if (!(await requireSuperAdmin())) {
    return { ok: false as const, error: "Solo el administrador puede cambiar de sucursal." };
  }
  const store = await cookies();
  store.set(COOKIE_SUCURSAL, id ? String(id) : TODAS, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // El stock, las métricas y las listas cambian según el local elegido.
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function crearSucursal(nombre: string, direccion = "") {
  if (!(await requireSuperAdmin())) {
    return { ok: false as const, error: "Solo el administrador puede crear sucursales." };
  }
  const limpio = nombre.trim();
  if (!limpio) return { ok: false as const, error: "Poné un nombre para la sucursal." };

  const lista = await getSucursales();
  if (lista.some((s) => s.nombre.toLowerCase() === limpio.toLowerCase())) {
    return { ok: false as const, error: "Ya tenés una sucursal con ese nombre." };
  }

  const [creada] = await db
    .insert(sucursales)
    .values({ nombre: limpio, direccion: direccion.trim(), orden: lista.length })
    .returning({ id: sucursales.id });

  revalidatePath("/", "layout");
  return { ok: true as const, id: creada.id };
}

export async function renombrarSucursal(id: number, nombre: string) {
  if (!(await requireSuperAdmin())) {
    return { ok: false as const, error: "Solo el administrador puede editar sucursales." };
  }
  const limpio = nombre.trim();
  if (!limpio) return { ok: false as const, error: "El nombre no puede quedar vacío." };

  const lista = await getSucursales();
  if (lista.some((s) => s.id !== id && s.nombre.toLowerCase() === limpio.toLowerCase())) {
    return { ok: false as const, error: "Ya tenés una sucursal con ese nombre." };
  }

  await db.update(sucursales).set({ nombre: limpio }).where(eq(sucursales.id, id));
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/**
 * Da de baja una sucursal. No se borra la fila: las ventas y los traslados
 * históricos la siguen referenciando. Tampoco se permite si todavía tiene
 * mercadería, porque el stock se evaporaría del total: primero hay que
 * trasladarla desde "Mover stock".
 */
export async function archivarSucursal(id: number) {
  if (!(await requireSuperAdmin())) {
    return { ok: false as const, error: "Solo el administrador puede dar de baja sucursales." };
  }
  const lista = await getSucursales();
  if (lista.length <= 1) {
    return { ok: false as const, error: "Tiene que quedar al menos una sucursal activa." };
  }

  const [cajaPendiente] = await db.select({ id: cajaTurnos.id }).from(cajaTurnos)
    .where(sql`${cajaTurnos.sucursalId} = ${id} and ${cajaTurnos.estado} = 'abierta'`).limit(1);
  if (cajaPendiente) return { ok: false as const, error: "Cerrá la caja antes de archivar esta sucursal." };
  const [conStock] = await db
    .select({ unidades: sql<number>`coalesce(sum(${stockSucursal.cantidad}),0)` })
    .from(stockSucursal)
    .where(eq(stockSucursal.sucursalId, id));
  if (Number(conStock?.unidades ?? 0) > 0) {
    return {
      ok: false as const,
      error: "Esa sucursal todavía tiene mercadería. Movela a otro local antes de darla de baja.",
    };
  }
  const [pendiente] = await db.select({ unidades: sql<number>`coalesce(sum(${stockTransito.cantidad}),0)` })
    .from(stockTransito).where(eq(stockTransito.sucursalId, id));
  const [salientes] = await db.select({ id: stockMovimientos.id }).from(stockMovimientos)
    .where(sql`${stockMovimientos.origenId} = ${id} and ${stockMovimientos.estado} in ('en_transito','rechazado')`).limit(1);
  if (Number(pendiente?.unidades ?? 0) > 0 || salientes) {
    return { ok: false as const, error: "Esa sucursal tiene traslados pendientes. Resolvelos antes de darla de baja." };
  }

  await db.update(sucursales).set({ activo: false }).where(eq(sucursales.id, id));

  // Si el panel estaba parado ahí, vuelve a la vista consolidada.
  const store = await cookies();
  if (store.get(COOKIE_SUCURSAL)?.value === String(id)) {
    store.set(COOKIE_SUCURSAL, TODAS, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

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
    unidadMedida: (fd.get("unidadMedida") === "kg" ? "kg" : "unidad") as UnidadMedida,
    stockMinimo: Number(fd.get("stockMinimo") ?? 5),
  };
}

/**
 * Resuelve la imagen del producto a partir del formulario.
 *
 * El campo `imagen` es un hidden con la ruta que ya estaba guardada (vacío si
 * el usuario la quitó) y `imagenArchivo` es el archivo recién elegido/arrastrado
 * o sacado con la cámara del celular. Si llega un archivo nuevo, se guarda en
 * disco y la imagen anterior se borra para no dejar huérfanos.
 */
async function resolverImagen(
  fd: FormData,
  anterior: string
): Promise<{ ok: true; imagen: string } | { ok: false; error: string }> {
  const conservada = String(fd.get("imagen") || "").trim();
  const archivo = fd.get("imagenArchivo");

  if (archivo instanceof File && archivo.size > 0) {
    const r = await guardarImagenProducto(archivo);
    if (!r.ok) return r;
    if (anterior && anterior !== r.ruta) await borrarImagenProducto(anterior);
    return { ok: true, imagen: r.ruta };
  }

  if (anterior && anterior !== conservada) await borrarImagenProducto(anterior);
  return { ok: true, imagen: conservada };
}

/**
 * A qué local se le imputa el stock del formulario.
 *
 * Si el panel está parado dentro de una sucursal, el formulario ni pregunta y
 * el campo no viene: se usa la activa. Si está en "Todas", el formulario manda
 * el `sucursalId` que eligió el usuario. Se valida siempre contra la lista real
 * para que nadie mande un id de otra empresa.
 */
async function sucursalDelForm(fd: FormData): Promise<number | null> {
  const usuario = await getUsuarioActual();
  const pedida = Number(fd.get("sucursalId") || 0);
  if (pedida && esSuperAdmin(usuario)) {
    const lista = await getSucursales();
    if (lista.some((x) => x.id === pedida)) return pedida;
  }
  return sucursalOperativaId();
}

export async function crearProducto(formData: FormData) {
  const usuario = await requireAcceso("stock");
  const d = datosProducto(formData);
  if (!d.nombre) return { ok: false as const, error: "El nombre es obligatorio." };
  if (!cantidadValida(d.stock, d.unidadMedida, true) || !Number.isFinite(d.precioVenta) || d.precioVenta < 0 || !Number.isFinite(d.precioCompra) || d.precioCompra < 0) return { ok: false as const, error: "Revisá stock, unidad y precios." };

  if (!esSuperAdmin(usuario)) {
    const config = await leerReglasStock();
    d.precioVenta = precioDesdeCosto(d.precioCompra, config.multiplicador ?? 2);
    d.stockMinimo = 5;
  }
  const img = await resolverImagen(formData, "");
  if (!img.ok) return img;

  const [creado] = await db
    .insert(productos)
    .values({
      ...d,
      imagen: img.imagen,
      sku: d.sku || `SKU-${Date.now()}`,
      descripcion: String(formData.get("descripcion") || ""),
    })
    .returning({ id: productos.id });

  // El stock inicial entra en un local concreto, no "en el aire".
  const sucursalId = await sucursalDelForm(formData);
  if (sucursalId) await fijarStockEnSucursal(creado.id, sucursalId, d.stock);

  revalidatePath("/admin/stock");
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/tienda/productos");
  return { ok: true as const };
}

export async function editarProducto(id: number, formData: FormData) {
  const usuario = await requireAcceso("stock");
  const d = datosProducto(formData);
  if (!d.nombre) return { ok: false as const, error: "El nombre es obligatorio." };
  if (!cantidadValida(d.stock, d.unidadMedida, true) || !Number.isFinite(d.precioVenta) || d.precioVenta < 0 || !Number.isFinite(d.precioCompra) || d.precioCompra < 0) return { ok: false as const, error: "Revisá stock, unidad y precios." };

  const [previo] = await db.select().from(productos).where(eq(productos.id, id)).limit(1);
  if (!previo || !previo.activo) return { ok: false as const, error: "El producto no existe." };

  if (!esSuperAdmin(usuario)) { d.precioVenta = previo.precioVenta; d.stockMinimo = previo.stockMinimo; }
  const img = await resolverImagen(formData, previo.imagen ?? "");
  if (!img.ok) return img;

  // El campo "Stock" del formulario es el de UNA sucursal, no el total: el
  // total lo recalcula fijarStockEnSucursal sumando todos los locales.
  const sucursalId = await sucursalDelForm(formData);
  const { stock, ...resto } = d;
  await db
    .update(productos)
    .set({ ...resto, imagen: img.imagen, ...(sucursalId ? {} : { stock }) })
    .where(eq(productos.id, id));
  if (sucursalId) await fijarStockEnSucursal(id, sucursalId, stock);

  revalidatePath("/admin/stock");
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/tienda/productos");
  return { ok: true as const };
}

export async function eliminarProducto(id: number) {
  await requireAdmin();
  try {
    await db.transaction(async tx => {
      const [previo] = await tx.select().from(productos).where(eq(productos.id, id));
      if (!previo || !previo.activo) throw new Error("El producto ya no está en el inventario.");
      const [enTransito] = await tx.select({ n: sql<number>`coalesce(sum(${stockTransito.cantidad}),0)` })
        .from(stockTransito).where(eq(stockTransito.productoId, id));
      if (Number(enTransito?.n ?? 0) > 0) throw new Error("No se puede eliminar un producto con stock en tránsito.");
      // Las ventas, compras y movimientos conservan la referencia al producto.
      // El archivado retira su stock y lo oculta del catálogo en una sola transacción.
      await tx.delete(stockSucursal).where(eq(stockSucursal.productoId, id));
      await tx.update(productos).set({ activo: false, publicado: false, stock: 0 }).where(eq(productos.id, id));
    });
    for (const ruta of ["/admin/stock", "/admin/caja", "/admin/ventas", "/admin", "/tienda", "/tienda/productos"]) revalidatePath(ruta);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo eliminar el producto." };
  }
}

/**
 * Suma o resta unidades de un producto en un local. Desde Stock: si estás
 * dentro de una sucursal se usa esa sin preguntar; si estás en "Todas", la
 * tabla pide primero en cuál.
 */
export async function ajustarStock(id: number, delta: number, sucursalId?: number | null) {
  const usuario = await requireAcceso("stock");
  const [producto] = await db.select({ activo: productos.activo }).from(productos).where(eq(productos.id, id));
  if (!producto?.activo) throw new Error("El producto ya no está disponible.");
  const lista = await getSucursales();
  const solicitada = lista.find((s) => s.id === sucursalId)?.id;
  const destino = esSuperAdmin(usuario) && solicitada ? solicitada : await sucursalOperativaId();
  if (destino) {
    await ajustarStockEnSucursal(id, destino, delta);
  } else {
    // Base sin sucursales todavía (previa a la migración): ajuste directo sobre
    // el total, como antes.
    await db
      .update(productos)
      .set({ stock: sql`max(0, ${productos.stock} + ${delta})` })
      .where(eq(productos.id, id));
  }
  revalidatePath("/admin/stock");
  revalidatePath("/");
}

export async function togglePublicado(id: number) {
  await requireAcceso("stock");
  await db
    .update(productos)
    .set({ publicado: sql`not ${productos.publicado}` })
    .where(and(eq(productos.id, id), eq(productos.activo, true)));
  revalidatePath("/tienda");
  revalidatePath("/admin/stock");
}

export async function toggleOfertaTienda(id: number) {
  await requireAcceso("stock");
  const [producto] = await db.select({ activo: productos.activo }).from(productos).where(eq(productos.id, id));
  if (!producto?.activo) return;
  const [meta] = await db.select().from(tiendaProductoMeta).where(eq(tiendaProductoMeta.productoId, id)).limit(1);
  if (meta) {
    await db.update(tiendaProductoMeta).set({ ofertaDelDia: !meta.ofertaDelDia }).where(eq(tiendaProductoMeta.productoId, id));
  } else {
    await db.insert(tiendaProductoMeta).values({ productoId: id, ofertaDelDia: true });
  }
  revalidatePath("/tienda");
  revalidatePath("/tienda/ofertas");
  revalidatePath("/admin/stock");
}

export async function guardarDescripcionWeb(id: number, texto: string) {
  await db.update(productos).set({ descripcionWeb: texto }).where(eq(productos.id, id));
  revalidatePath("/tienda");
}

// --- Clientes ----------------------------------------------------------------
export async function crearCliente(formData: FormData) {
  await requireAcceso("clientes");
  const nombre = String(formData.get("nombre") || "").trim();
  if (!nombre) return;
  await db.insert(clientes).values({
    nombre,
    sucursalId: await sucursalOperativaId(),
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
  const usuario = await requireAcceso(opts ? "ventas" : "caja");
  const sucursalId = await sucursalOperativaId();
  if (!sucursalId) return { ok: false as const, error: "Creá una sucursal antes de cobrar." };
  try {
    const resultado = await venderEnCaja(sucursalId, usuario.nombre, items, medioPago, opts);
    for (const ruta of ["/admin/caja", "/admin/ventas", "/admin/stock", "/admin"]) revalidatePath(ruta);
    return { ok: true as const, ...resultado };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo cobrar la venta." };
  }
}
// --- Compras -----------------------------------------------------------------
export async function crearCompra(formData: FormData) {
  await requireAcceso("compras");
  const proveedor = String(formData.get("proveedor") || "").trim();
  if (!proveedor) return;
  const estado = String(formData.get("estado") || "pedido");
  await db.insert(compras).values({
    proveedor,
    total: Number(formData.get("total") || 0),
    estado: esEstadoCompra(estado) ? estado : "pedido",
    detalle: String(formData.get("detalle") || ""),
    // Local que va a recibir la mercadería cuando se controle el remito.
    sucursalId: await sucursalDelForm(formData),
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
