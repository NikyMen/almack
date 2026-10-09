import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const cajaTurnos = sqliteTable("caja_turnos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sucursalId: integer("sucursal_id").notNull(),
  responsable: text("responsable").notNull(),
  cerradoPor: text("cerrado_por"),
  fondoInicial: real("fondo_inicial").notNull(),
  estado: text("estado").notNull().default("abierta"),
  abiertoEn: integer("abierto_en", { mode: "timestamp" }).default(sql`(strftime('%s','now'))`),
  cerradoEn: integer("cerrado_en", { mode: "timestamp" }),
  efectivoEsperado: real("efectivo_esperado"),
  efectivoContado: real("efectivo_contado"),
  diferencia: real("diferencia"),
  resumen: text("resumen"),
  observaciones: text("observaciones").notNull().default(""),
});
export const cajaMovimientos = sqliteTable("caja_movimientos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  turnoId: integer("turno_id").notNull().references(() => cajaTurnos.id),
  tipo: text("tipo").notNull(),
  monto: real("monto").notNull(),
  motivo: text("motivo").notNull(),
  responsable: text("responsable").notNull(),
  fecha: integer("fecha", { mode: "timestamp" }).default(sql`(strftime('%s','now'))`),
});
export const cajaSeguridad = sqliteTable("caja_seguridad", {
  id: integer("id").primaryKey(),
  claveHash: text("clave_hash").notNull(),
  actualizadoPor: text("actualizado_por").notNull(),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp" }).notNull(),
});
export const cajaIntentos = sqliteTable("caja_intentos", {
  usuario: text("usuario").primaryKey(),
  fallos: integer("fallos").notNull().default(0),
  bloqueadoHasta: integer("bloqueado_hasta").notNull().default(0),
});
export const cajaExtracciones = sqliteTable("caja_extracciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  solicitudId: text("solicitud_id").notNull().unique(),
  sucursalId: integer("sucursal_id").notNull(),
  turnoId: integer("turno_id").notNull().references(() => cajaTurnos.id),
  estadoCaja: text("estado_caja").notNull(),
  monto: real("monto").notNull(),
  motivo: text("motivo").notNull(),
  responsable: text("responsable").notNull(),
  fecha: integer("fecha", { mode: "timestamp" }).default(sql`(strftime('%s','now'))`),
});
