import { randomBytes, scryptSync } from "node:crypto";
import { client } from "./index";

// Hash de contraseña (scrypt nativo, sin dependencias). Mismo formato salt:hash
// que verifyPassword en src/lib/usuarios.ts.
function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pass, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const MODULOS = [
  "panel", "caja", "stock", "ventas", "compras", "clientes",
  "facturacion", "tienda", "whatsapp", "ia", "equipo",
];

const statements = [
  `CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    categoria TEXT DEFAULT 'General',
    precio_venta REAL NOT NULL DEFAULT 0,
    precio_compra REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 5,
    imagen TEXT DEFAULT '',
    publicado INTEGER NOT NULL DEFAULT 0,
    descripcion_web TEXT DEFAULT '',
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    cuit TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'completada',
    canal TEXT NOT NULL DEFAULT 'local',
    medio_pago TEXT NOT NULL DEFAULT 'efectivo',
    referencia TEXT NOT NULL DEFAULT '',
    facturada INTEGER NOT NULL DEFAULT 0,
    fecha INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS venta_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL REFERENCES ventas(id),
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unit REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS tienda_producto_meta (
    producto_id INTEGER PRIMARY KEY REFERENCES productos(id),
    precio_anterior REAL,
    badge TEXT DEFAULT '',
    oferta_del_dia INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS tienda_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id),
    checkout_id TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    franja_entrega TEXT NOT NULL DEFAULT '',
    fecha_entrega TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    estado_entrega TEXT NOT NULL DEFAULT 'pendiente',
    codigo_entrega TEXT NOT NULL DEFAULT '',
    preferencia_mp TEXT NOT NULL DEFAULT '',
    init_point_mp TEXT NOT NULL DEFAULT '',
    pago_mp TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT '',
    creado_en INTEGER DEFAULT (strftime('%s','now')),
    actualizado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pedido',
    imagen TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    fecha INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS compra_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id INTEGER NOT NULL REFERENCES compras(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    usuario_nombre TEXT NOT NULL DEFAULT '',
    campo TEXT NOT NULL DEFAULT '',
    antes TEXT NOT NULL DEFAULT '',
    despues TEXT NOT NULL DEFAULT '',
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ia_conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    titulo TEXT NOT NULL DEFAULT 'Nueva conversación',
    creado_en INTEGER DEFAULT (strftime('%s','now')),
    actualizado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ia_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER NOT NULL REFERENCES ia_conversaciones(id),
    rol TEXT NOT NULL DEFAULT 'user',
    texto TEXT NOT NULL DEFAULT '',
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS compra_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id INTEGER NOT NULL REFERENCES compras(id),
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unit REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    venta_id INTEGER REFERENCES ventas(id),
    cliente_id INTEGER REFERENCES clientes(id),
    tipo TEXT NOT NULL DEFAULT 'B',
    subtotal REAL NOT NULL DEFAULT 0,
    iva REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'emitida',
    fecha INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'miembro',
    permisos TEXT NOT NULL DEFAULT '[]',
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wa_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'slate',
    orden INTEGER NOT NULL DEFAULT 0,
    es_exito INTEGER NOT NULL DEFAULT 0,
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wa_contactos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT NOT NULL UNIQUE,
    telefono TEXT NOT NULL DEFAULT '',
    numero_lead TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL DEFAULT '',
    avatar TEXT DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT '',
    responsable_id INTEGER REFERENCES usuarios(id),
    etapa_id INTEGER REFERENCES wa_etapas(id),
    orden INTEGER NOT NULL DEFAULT 0,
    ultimo_mensaje TEXT NOT NULL DEFAULT '',
    ultimo_mensaje_en INTEGER DEFAULT (strftime('%s','now')),
    no_leidos INTEGER NOT NULL DEFAULT 0,
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wa_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contacto_id INTEGER NOT NULL REFERENCES wa_contactos(id),
    wa_id TEXT DEFAULT '',
    desde_mi INTEGER NOT NULL DEFAULT 0,
    texto TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'texto',
    timestamp INTEGER DEFAULT (strftime('%s','now')),
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wa_presupuestos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contacto_id INTEGER NOT NULL REFERENCES wa_contactos(id),
    estado TEXT NOT NULL DEFAULT 'borrador',
    total REAL NOT NULL DEFAULT 0,
    creado_en INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wa_presupuesto_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    presupuesto_id INTEGER NOT NULL REFERENCES wa_presupuestos(id),
    producto_id INTEGER REFERENCES productos(id),
    descripcion TEXT NOT NULL DEFAULT '',
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unit REAL NOT NULL DEFAULT 0
  )`,
];

// ALTER idempotentes para DBs ya existentes (SQLite no soporta ADD COLUMN IF
// NOT EXISTS → si la columna ya existe, el execute tira error y lo ignoramos).
const alters = [
  `ALTER TABLE wa_contactos ADD COLUMN numero_lead TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE wa_contactos ADD COLUMN email TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE wa_contactos ADD COLUMN notas TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE wa_contactos ADD COLUMN responsable_id INTEGER REFERENCES usuarios(id)`,
  `ALTER TABLE wa_contactos ADD COLUMN lid TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE wa_etapas ADD COLUMN es_exito INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ventas ADD COLUMN medio_pago TEXT NOT NULL DEFAULT 'efectivo'`,
  `ALTER TABLE ventas ADD COLUMN referencia TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE compras ADD COLUMN imagen TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE compras ADD COLUMN detalle TEXT NOT NULL DEFAULT ''`,
];

// Índices que importan para las listas más consultadas
const indices = [
  `CREATE INDEX IF NOT EXISTS idx_ia_mensajes_conv ON ia_mensajes(conversacion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ia_conv_usuario ON ia_conversaciones(usuario_id)`,
  `CREATE INDEX IF NOT EXISTS idx_compra_hist_compra ON compra_historial(compra_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tienda_pedidos_estado ON tienda_pedidos(estado_entrega)`,
  `CREATE INDEX IF NOT EXISTS idx_tienda_meta_oferta ON tienda_producto_meta(oferta_del_dia)`,
];

// Etapas por defecto del kanban (se siembran solo si la tabla está vacía)
const etapasDefault: [string, string][] = [
  ["Leads entrantes", "blue"],
  ["Contactados", "amber"],
  ["En negociación", "violet"],
  ["Ganados", "emerald"],
  ["Perdidos", "rose"],
];

async function migrate() {
  console.log("Creando tablas…");
  for (const sql of statements) {
    await client.execute(sql);
  }

  // Migración de columnas para DBs ya creadas (idempotente)
  for (const sql of alters) {
    try {
      await client.execute(sql);
    } catch {
      /* la columna ya existe → ignorar */
    }
  }

  for (const sql of indices) {
    await client.execute(sql);
  }

  // Estados viejos de compras → nuevo flujo de control
  await client.execute("UPDATE compras SET estado = 'pedido' WHERE estado = 'pendiente'");
  await client.execute("UPDATE compras SET estado = 'verificado' WHERE estado = 'recibida'");

  // Sembrar etapas del kanban de WhatsApp si aún no existen
  const { rows } = await client.execute("SELECT COUNT(*) AS n FROM wa_etapas");
  if (Number(rows[0]?.n ?? 0) === 0) {
    console.log("Sembrando etapas de WhatsApp…");
    for (let i = 0; i < etapasDefault.length; i++) {
      const [nombre, color] = etapasDefault[i];
      await client.execute({
        sql: "INSERT INTO wa_etapas (nombre, color, orden) VALUES (?, ?, ?)",
        args: [nombre, color, i],
      });
    }
  }

  // La etapa "Ganados" es la de "venta exitosa" (requiere presupuesto)
  await client.execute("UPDATE wa_etapas SET es_exito = 1 WHERE nombre = 'Ganados'");

  // Backfill del nº de lead para contactos previos a esta columna
  await client.execute(
    "UPDATE wa_contactos SET numero_lead = 'L-' || printf('%04d', id) WHERE numero_lead IS NULL OR numero_lead = ''"
  );

  // Sembrar usuario admin si la tabla está vacía (login DB desde el arranque;
  // el admin por env sigue funcionando como respaldo)
  const { rows: us } = await client.execute("SELECT COUNT(*) AS n FROM usuarios");
  if (Number(us[0]?.n ?? 0) === 0) {
    const handle = process.env.AUTH_USER || "admin";
    const pass = process.env.AUTH_PASSWORD || "admin";
    console.log(`Sembrando usuario admin (${handle})…`);
    await client.execute({
      sql: "INSERT INTO usuarios (nombre, usuario, password_hash, rol, permisos, activo) VALUES (?, ?, ?, 'admin', ?, 1)",
      args: ["Administrador", handle, hashPassword(pass), JSON.stringify(MODULOS)],
    });
  }

  console.log("Esquema listo (gestoria.db).");
}

migrate();
