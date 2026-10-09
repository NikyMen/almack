import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
export const stockConfiguracion = sqliteTable("stock_configuracion", {
  id: integer("id").primaryKey(), multiplicador: real("multiplicador"),
  actualizadoPor: text("actualizado_por").notNull(),
});
export const stockReglas = sqliteTable("stock_reglas", {
  productoId: integer("producto_id").primaryKey(),
  alertaActiva: integer("alerta_activa", { mode: "boolean" }).notNull().default(true),
  multiplicador: real("multiplicador"),
  actualizadoPor: text("actualizado_por").notNull(),
});
export const stockDDL = [
  `CREATE TABLE IF NOT EXISTS stock_configuracion (id INTEGER PRIMARY KEY, multiplicador REAL, actualizado_por TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stock_reglas (producto_id INTEGER PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE, alerta_activa INTEGER NOT NULL DEFAULT 1, multiplicador REAL, actualizado_por TEXT NOT NULL)`,
];
