export const cajaDDL = [
  `CREATE TABLE IF NOT EXISTS caja_turnos (id INTEGER PRIMARY KEY AUTOINCREMENT, sucursal_id INTEGER NOT NULL REFERENCES sucursales(id), responsable TEXT NOT NULL, cerrado_por TEXT, fondo_inicial REAL NOT NULL, estado TEXT NOT NULL DEFAULT 'abierta', abierto_en INTEGER DEFAULT (strftime('%s','now')), cerrado_en INTEGER, efectivo_esperado REAL, efectivo_contado REAL, diferencia REAL, resumen TEXT, observaciones TEXT NOT NULL DEFAULT '')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_abierta ON caja_turnos(sucursal_id) WHERE estado = 'abierta'`,
  `CREATE TABLE IF NOT EXISTS caja_movimientos (id INTEGER PRIMARY KEY AUTOINCREMENT, turno_id INTEGER NOT NULL REFERENCES caja_turnos(id), tipo TEXT NOT NULL, monto REAL NOT NULL, motivo TEXT NOT NULL, responsable TEXT NOT NULL, fecha INTEGER DEFAULT (strftime('%s','now')))`,
  `CREATE INDEX IF NOT EXISTS idx_caja_mov_turno ON caja_movimientos(turno_id)`,
  `CREATE TABLE IF NOT EXISTS caja_seguridad (id INTEGER PRIMARY KEY, clave_hash TEXT NOT NULL, actualizado_por TEXT NOT NULL, actualizado_en INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS caja_intentos (usuario TEXT PRIMARY KEY, fallos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS caja_extracciones (id INTEGER PRIMARY KEY AUTOINCREMENT, solicitud_id TEXT NOT NULL UNIQUE, sucursal_id INTEGER NOT NULL REFERENCES sucursales(id), turno_id INTEGER NOT NULL REFERENCES caja_turnos(id), estado_caja TEXT NOT NULL, monto REAL NOT NULL, motivo TEXT NOT NULL, responsable TEXT NOT NULL, fecha INTEGER DEFAULT (strftime('%s','now')))`,
  `CREATE INDEX IF NOT EXISTS idx_caja_extracciones_turno ON caja_extracciones(turno_id, estado_caja)`,
  `CREATE INDEX IF NOT EXISTS idx_caja_extracciones_sucursal ON caja_extracciones(sucursal_id, id)`,
];

