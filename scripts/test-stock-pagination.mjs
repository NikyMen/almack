import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const dir = await mkdtemp(join(tmpdir(), "almack-stock-pagination-"));
const path = join(dir, "test.db");
process.env.TURSO_DATABASE_URL = `file:${path}`;
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
try {
  await client.executeMultiple(`
    create table productos (id integer primary key, sku text not null, nombre text not null, descripcion text default '', categoria text default 'General', precio_venta real not null default 0, precio_compra real not null default 0, stock real not null default 0, unidad_medida text not null default 'unidad', activo integer not null default 1, stock_minimo real not null default 5, imagen text default '', publicado integer not null default 0, descripcion_web text default '', creado_en integer);
    create table stock_sucursal (id integer primary key, producto_id integer not null, sucursal_id integer not null, cantidad real not null default 0);
    create table stock_transito (id integer primary key, producto_id integer not null, sucursal_id integer not null, cantidad real not null default 0);
    create table stock_reglas (producto_id integer primary key, alerta_activa integer not null default 1, multiplicador real, actualizado_por text);
    create table stock_configuracion (id integer primary key, multiplicador real, actualizado_por text);
  `);
  for (let id = 1; id <= 125; id++) {
    await client.execute({ sql: "insert into productos (id, sku, nombre, categoria, precio_venta, stock) values (?, ?, ?, ?, ?, ?)", args: [id, `SKU-${id}`, `Producto ${id}`, id === 125 ? "Especial" : "General", id, id] });
  }
  await client.execute("insert into stock_sucursal (producto_id, sucursal_id, cantidad) values (125, 1, 7)");
  await client.execute("insert into stock_transito (producto_id, sucursal_id, cantidad) values (125, 1, 3)");

  const { listarStock } = await import("../src/lib/stock-listado.ts");
  const base = { busqueda: "", categoria: "", orden: "recientes", sucursalId: null, administrador: true };
  const primera = await listarStock({ ...base, pagina: 1 });
  const tercera = await listarStock({ ...base, pagina: 3 });
  assert.equal(primera.total, 125);
  assert.equal(primera.totalProductos, 125);
  assert.equal(primera.filas.length, 50);
  assert.equal(tercera.filas.length, 25);
  assert.equal(primera.filas[0].id, 125);
  assert.equal(tercera.filas.at(-1).id, 1);
  assert.equal((await listarStock({ ...base, pagina: 999 })).paginaActual, 3);
  const buscado = await listarStock({ ...base, pagina: 1, busqueda: "SKU-1", categoria: "Especial" });
  assert.deepEqual(buscado.filas.map(p => p.id), [125]);
  const sucursal = await listarStock({ ...base, pagina: 1, sucursalId: 1, orden: "stock_desc" });
  assert.equal(sucursal.filas[0].id, 125);
  assert.equal(sucursal.filas[0].stockLocal, 7);
  assert.equal(sucursal.filas[0].transitoLocal, 3);
  assert.equal((await listarStock({ ...base, pagina: 1, orden: "precio_asc" })).filas[0].id, 1);
  console.log("Paginación, búsqueda global, filtro, orden y stock por sucursal: OK");
  const { client: dbClient } = await import("../src/db/index.ts");
  await dbClient.close();
} finally {
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
