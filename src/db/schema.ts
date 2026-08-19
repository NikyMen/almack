import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(strftime('%s','now'))`;

// ---------------------------------------------------------------------------
// Sucursales (locales)
// ---------------------------------------------------------------------------
// Cada local con stock propio. El panel arranca en "Todas" (sin sucursal
// elegida) y desde el logo se entra a una en particular; ver src/lib/sucursal.ts.
export const sucursales = sqliteTable("sucursales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  direccion: text("direccion").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// Productos / Stock
// ---------------------------------------------------------------------------
export const productos = sqliteTable("productos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").default(""),
  categoria: text("categoria").default("General"),
  precioVenta: real("precio_venta").notNull().default(0),
  precioCompra: real("precio_compra").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  stockMinimo: integer("stock_minimo").notNull().default(5),
  imagen: text("imagen").default(""),
  // Tienda online
  publicado: integer("publicado", { mode: "boolean" }).notNull().default(false),
  descripcionWeb: text("descripcion_web").default(""),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// Metadatos visuales de la tienda: no alteran el stock ni los datos contables.
export const tiendaProductoMeta = sqliteTable("tienda_producto_meta", {
  productoId: integer("producto_id")
    .primaryKey()
    .references(() => productos.id),
  precioAnterior: real("precio_anterior"),
  badge: text("badge").default(""),
  ofertaDelDia: integer("oferta_del_dia", { mode: "boolean" }).notNull().default(false),
});

// Desglose del stock por local. `productos.stock` sigue siendo el TOTAL de la
// empresa (lo usan la caja, la tienda y las métricas históricas) y esta tabla
// dice cuánto de ese total está en cada sucursal. Las dos se escriben juntas
// desde src/lib/stock.ts: nunca tocar una sin la otra.
export const stockSucursal = sqliteTable("stock_sucursal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  sucursalId: integer("sucursal_id").notNull().references(() => sucursales.id),
  cantidad: integer("cantidad").notNull().default(0),
});

// Remito interno: mercadería que se va de una sucursal a otra. Se aplica al
// stock en el momento de crearse (no hay estado "en tránsito").
export const stockMovimientos = sqliteTable("stock_movimientos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  origenId: integer("origen_id").notNull().references(() => sucursales.id),
  destinoId: integer("destino_id").notNull().references(() => sucursales.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  // Snapshot del nombre: el movimiento tiene que seguir siendo legible aunque
  // el usuario se dé de baja (mismo criterio que compra_historial).
  usuarioNombre: text("usuario_nombre").notNull().default(""),
  nota: text("nota").notNull().default(""),
  unidades: integer("unidades").notNull().default(0),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

export const stockMovimientoItems = sqliteTable("stock_movimiento_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  movimientoId: integer("movimiento_id").notNull().references(() => stockMovimientos.id),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  descripcion: text("descripcion").notNull().default(""), // snapshot del nombre
  cantidad: integer("cantidad").notNull().default(1),
});

// Gastos operativos. Nacieron para el flete de un traslado (nafta, peaje, changa)
// pero sirven para cualquier gasto suelto de una sucursal.
export const gastos = sqliteTable("gastos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sucursalId: integer("sucursal_id").references(() => sucursales.id),
  // Si el gasto salió de un traslado, queda enganchado para poder ver el costo
  // real de mover la mercadería.
  movimientoId: integer("movimiento_id").references(() => stockMovimientos.id),
  concepto: text("concepto").notNull().default(""),
  categoria: text("categoria").notNull().default("otros"), // ver src/lib/gastos.ts
  monto: real("monto").notNull().default(0),
  fecha: integer("fecha", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export const clientes = sqliteTable("clientes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  email: text("email").default(""),
  telefono: text("telefono").default(""),
  cuit: text("cuit").default(""),
  direccion: text("direccion").default(""),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------
export const ventas = sqliteTable("ventas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id").references(() => clientes.id),
  // Local donde se hizo la venta. Null = anterior a las sucursales (o venta
  // online sin local asignado).
  sucursalId: integer("sucursal_id").references(() => sucursales.id),
  total: real("total").notNull().default(0),
  estado: text("estado").notNull().default("completada"), // completada | pendiente | cancelada
  canal: text("canal").notNull().default("local"), // local | online
  medioPago: text("medio_pago").notNull().default("efectivo"), // efectivo | qr | tarjeta | mercadopago
  // Id del pago en la pasarela (MercadoPago) para conciliación/idempotencia.
  referencia: text("referencia").notNull().default(""),
  facturada: integer("facturada", { mode: "boolean" }).notNull().default(false),
  fecha: integer("fecha", { mode: "timestamp" }).default(now),
});

// Datos propios del checkout público, vinculados a la venta existente.
export const tiendaPedidos = sqliteTable("tienda_pedidos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ventaId: integer("venta_id")
    .notNull()
    .unique()
    .references(() => ventas.id),
  checkoutId: text("checkout_id").notNull().unique(),
  nombre: text("nombre").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  direccion: text("direccion").notNull().default(""),
  franjaEntrega: text("franja_entrega").notNull().default(""),
  fechaEntrega: text("fecha_entrega").notNull().default(""),
  lat: real("lat"),
  lng: real("lng"),
  estadoEntrega: text("estado_entrega").notNull().default("pendiente"),
  codigoEntrega: text("codigo_entrega").notNull().default(""),
  preferenciaMp: text("preferencia_mp").notNull().default(""),
  initPointMp: text("init_point_mp").notNull().default(""),
  pagoMp: text("pago_mp").notNull().default(""),
  notas: text("notas").notNull().default(""),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp" }).default(now),
});

export const ventaItems = sqliteTable("venta_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ventaId: integer("venta_id").notNull().references(() => ventas.id),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  cantidad: integer("cantidad").notNull().default(1),
  precioUnit: real("precio_unit").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------
export const compras = sqliteTable("compras", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proveedor: text("proveedor").notNull().default(""),
  // Sucursal que recibe la mercadería: es a la que se le suma el stock al
  // confirmar la recepción del remito.
  sucursalId: integer("sucursal_id").references(() => sucursales.id),
  total: real("total").notNull().default(0),
  // pedido | falta_controlar | verificado (legacy: recibida | pendiente)
  estado: text("estado").notNull().default("pedido"),
  // Foto del remito/factura del proveedor (ruta pública en /uploads/compras)
  imagen: text("imagen").notNull().default(""),
  // Detalle en texto: se puede escribir a mano o transcribir la imagen con IA
  detalle: text("detalle").notNull().default(""),
  fecha: integer("fecha", { mode: "timestamp" }).default(now),
});

// Auditoría de cambios de una compra: quién tocó qué, cuándo y con qué valores.
export const compraHistorial = sqliteTable("compra_historial", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  compraId: integer("compra_id").notNull().references(() => compras.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  // Snapshot del nombre: el historial tiene que seguir siendo legible aunque
  // el usuario se dé de baja.
  usuarioNombre: text("usuario_nombre").notNull().default(""),
  campo: text("campo").notNull().default(""),
  antes: text("antes").notNull().default(""),
  despues: text("despues").notNull().default(""),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// Borrador de recepción: lo que se leyó de la foto del remito (o se agregó a
// mano) ANTES de tocar el stock. Vive aparte de compra_items porque una línea
// puede todavía no tener producto: puede ser uno nuevo, o uno dudoso que una
// persona tiene que resolver. Recién al confirmar se mueve el stock, y ahí
// se escriben los compra_items.
export const compraLineas = sqliteTable("compra_lineas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  compraId: integer("compra_id").notNull().references(() => compras.id),
  descripcion: text("descripcion").notNull().default(""),
  codigo: text("codigo").notNull().default(""), // SKU / código de barras del remito
  cantidad: integer("cantidad").notNull().default(1),
  precioUnit: real("precio_unit").notNull().default(0), // costo unitario
  // Solo se usa al crear un producto nuevo; en los existentes no se toca nada
  // del precio de venta.
  precioVenta: real("precio_venta").notNull().default(0),
  productoId: integer("producto_id").references(() => productos.id),
  // match | duda | nuevo (ver src/lib/recepcion.ts)
  estado: text("estado").notNull().default("nuevo"),
  // JSON con los productos parecidos y su puntaje, para el menú de "Revisar"
  candidatos: text("candidatos").notNull().default("[]"),
  origen: text("origen").notNull().default("ia"), // ia | manual
  // Una persona confirmó explícitamente esta línea (obligatorio para crear un
  // producto nuevo o para aceptar un match dudoso).
  confirmado: integer("confirmado", { mode: "boolean" }).notNull().default(false),
  // Ya se aplicó al stock: la línea queda como historia y no se vuelve a sumar.
  aplicado: integer("aplicado", { mode: "boolean" }).notNull().default(false),
  aplicadoEn: integer("aplicado_en", { mode: "timestamp" }),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

export const compraItems = sqliteTable("compra_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  compraId: integer("compra_id").notNull().references(() => compras.id),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  cantidad: integer("cantidad").notNull().default(1),
  precioUnit: real("precio_unit").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------
export const facturas = sqliteTable("facturas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numero: text("numero").notNull(),
  ventaId: integer("venta_id").references(() => ventas.id),
  clienteId: integer("cliente_id").references(() => clientes.id),
  tipo: text("tipo").notNull().default("B"), // A | B | C
  subtotal: real("subtotal").notNull().default(0),
  iva: real("iva").notNull().default(0),
  total: real("total").notNull().default(0),
  estado: text("estado").notNull().default("emitida"), // emitida | pagada | anulada
  fecha: integer("fecha", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// Usuarios / Equipo (login + permisos)
// ---------------------------------------------------------------------------
export const usuarios = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  usuario: text("usuario").notNull().unique(), // handle de login
  email: text("email").notNull().default(""),
  passwordHash: text("password_hash").notNull().default(""), // scrypt: salt:hash
  rol: text("rol").notNull().default("miembro"), // admin | miembro
  permisos: text("permisos").notNull().default("[]"), // JSON: módulos permitidos
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// WhatsApp — CRM Kanban
// ---------------------------------------------------------------------------
// Etapas = columnas del tablero kanban (Leads entrantes, Contactados, …)
export const waEtapas = sqliteTable("wa_etapas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  color: text("color").notNull().default("slate"), // clave de color del badge
  orden: integer("orden").notNull().default(0),
  // Etapa de "venta exitosa": mover una card aquí exige un presupuesto cargado.
  esExito: integer("es_exito", { mode: "boolean" }).notNull().default(false),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// Contactos = cada card del kanban (un usuario de WhatsApp)
export const waContactos = sqliteTable("wa_contactos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jid: text("jid").notNull().unique(), // 549111234567@s.whatsapp.net
  // jid alterno @lid de la cuenta (WhatsApp LID). Permite matchear las
  // respuestas entrantes que llegan como XXXX@lid con el contacto creado al
  // enviar (que está como telefono@s.whatsapp.net). "" si no se conoce.
  lid: text("lid").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  numeroLead: text("numero_lead").notNull().default(""), // nº de lead único (L-0001)
  nombre: text("nombre").notNull().default(""),
  avatar: text("avatar").default(""),
  email: text("email").notNull().default(""),
  notas: text("notas").notNull().default(""),
  responsableId: integer("responsable_id").references(() => usuarios.id),
  etapaId: integer("etapa_id").references(() => waEtapas.id),
  orden: integer("orden").notNull().default(0), // posición dentro de la columna
  ultimoMensaje: text("ultimo_mensaje").notNull().default(""),
  ultimoMensajeEn: integer("ultimo_mensaje_en", { mode: "timestamp" }).default(now),
  noLeidos: integer("no_leidos").notNull().default(0),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// Presupuestos = cotización con ítems del stock para un lead. Tener uno con
// total > 0 es requisito para mover la card a la etapa de "venta exitosa".
export const waPresupuestos = sqliteTable("wa_presupuestos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactoId: integer("contacto_id").notNull().references(() => waContactos.id),
  estado: text("estado").notNull().default("borrador"), // borrador | enviado | aprobado
  total: real("total").notNull().default(0),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

export const waPresupuestoItems = sqliteTable("wa_presupuesto_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  presupuestoId: integer("presupuesto_id").notNull().references(() => waPresupuestos.id),
  productoId: integer("producto_id").references(() => productos.id),
  descripcion: text("descripcion").notNull().default(""), // snapshot del nombre
  cantidad: integer("cantidad").notNull().default(1),
  precioUnit: real("precio_unit").notNull().default(0),
});

// Mensajes = historial de chat por contacto
export const waMensajes = sqliteTable("wa_mensajes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactoId: integer("contacto_id").notNull().references(() => waContactos.id),
  waId: text("wa_id").default(""), // id del mensaje en WhatsApp (dedup)
  desdeMi: integer("desde_mi", { mode: "boolean" }).notNull().default(false),
  texto: text("texto").notNull().default(""),
  tipo: text("tipo").notNull().default("texto"), // texto | imagen | audio | video | documento | otro
  timestamp: integer("timestamp", { mode: "timestamp" }).default(now),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

// ---------------------------------------------------------------------------
// Asistente IA — historial de conversaciones
// ---------------------------------------------------------------------------
export const iaConversaciones = sqliteTable("ia_conversaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  titulo: text("titulo").notNull().default("Nueva conversación"),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp" }).default(now),
});

export const iaMensajes = sqliteTable("ia_mensajes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversacionId: integer("conversacion_id").notNull().references(() => iaConversaciones.id),
  rol: text("rol").notNull().default("user"), // user | assistant
  texto: text("texto").notNull().default(""),
  creadoEn: integer("creado_en", { mode: "timestamp" }).default(now),
});

export type Sucursal = typeof sucursales.$inferSelect;
export type StockSucursal = typeof stockSucursal.$inferSelect;
export type StockMovimiento = typeof stockMovimientos.$inferSelect;
export type StockMovimientoItem = typeof stockMovimientoItems.$inferSelect;
export type Gasto = typeof gastos.$inferSelect;
export type Producto = typeof productos.$inferSelect;
export type TiendaProductoMeta = typeof tiendaProductoMeta.$inferSelect;
export type TiendaPedido = typeof tiendaPedidos.$inferSelect;
export type IaConversacion = typeof iaConversaciones.$inferSelect;
export type IaMensaje = typeof iaMensajes.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Venta = typeof ventas.$inferSelect;
export type Compra = typeof compras.$inferSelect;
export type CompraHistorial = typeof compraHistorial.$inferSelect;
export type CompraLinea = typeof compraLineas.$inferSelect;
export type Factura = typeof facturas.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type WaEtapa = typeof waEtapas.$inferSelect;
export type WaContacto = typeof waContactos.$inferSelect;
export type WaMensaje = typeof waMensajes.$inferSelect;
export type WaPresupuesto = typeof waPresupuestos.$inferSelect;
export type WaPresupuestoItem = typeof waPresupuestoItems.$inferSelect;
