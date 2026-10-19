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
    create table stock_movimientos (id integer primary key, origen_id integer not null, destino_id integer not null, estado text not null, creado_en integer);
    create table stock_movimiento_items (id integer primary key, movimiento_id integer not null, producto_id integer not null, descripcion text not null, cantidad integer not null);
  `);
  for (let id = 1; id <= 125; id++) {
    await client.execute({ sql: "insert into productos (id, sku, nombre, categoria, precio_venta, stock) values (?, ?, ?, ?, ?, ?)", args: [id, `SKU-${id}`, `Producto ${id}`, id === 125 ? "Especial" : "General", id, id] });
  }
  await client.execute("insert into stock_sucursal (producto_id, sucursal_id, cantidad) values (125, 1, 7)");
  for (let id = 1; id <= 60; id++) {
    await client.execute({ sql: "insert into stock_sucursal (producto_id, sucursal_id, cantidad) values (?, 1, 1)", args: [id] });
  }
  await client.execute("insert into stock_transito (producto_id, sucursal_id, cantidad) values (125, 1, 3)");
  await client.executeMultiple("insert into stock_movimientos (id, origen_id, destino_id, estado) values (1, 2, 1, 'en_transito'), (2, 2, 1, 'rechazado'), (3, 1, 2, 'en_transito');");
  for (let id = 1; id <= 125; id++) {
    await client.execute({ sql: "insert into stock_movimiento_items (id, movimiento_id, producto_id, descripcion, cantidad) values (?, ?, ?, ?, ?)", args: [id, id <= 60 ? 1 : id <= 120 ? 2 : 3, id, `Producto ${id}`, 1] });
  }

  const { listarStock, listarLineasTransito, buscarProductosTraslado } = await import("../src/lib/stock-listado.ts");
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
  const alertas = await listarStock({ ...base, pagina: 1, soloAlertas: true, contarAlertas: true });
  assert.equal(alertas.totalAlertas, 4);
  assert.deepEqual(alertas.filas.map(p => p.id), [4, 3, 2, 1]);
  const todasLasAlertas = await listarStock({ ...base, pagina: 3, contarAlertas: true });
  assert.equal(todasLasAlertas.filas.length, 25);
  assert.equal(todasLasAlertas.totalAlertas, 4);
  const alertasSucursal = await listarStock({ ...base, pagina: 1, sucursalId: 1, administrador: false, soloAlertas: true, contarAlertas: true });
  assert.equal(alertasSucursal.totalAlertas, 124);
  assert.equal(alertasSucursal.filas.length, 50);
  assert.equal(alertasSucursal.filas[0].stockLocal, 0);
  const transito = await listarLineasTransito(null, 1);
  assert.equal(transito.total, 125);
  assert.equal(transito.unidades, 125);
  assert.equal(transito.traslados, 3);
  assert.equal(transito.filas.length, 50);
  assert.equal((await listarLineasTransito(null, 3)).filas.length, 25);
  const destino = await listarLineasTransito(1, 3);
  assert.equal(destino.total, 120);
  assert.equal(destino.filas.length, 20);
  assert.equal((await buscarProductosTraslado(1, "Producto")).length, 8);
  assert.deepEqual((await buscarProductosTraslado(1, "SKU-125")).map(p => p.id), [125]);
  assert.deepEqual(await buscarProductosTraslado(2, "Producto"), []);
  const { paginaGruposDuplicados } = await import("../src/lib/duplicados-stock.ts");
  const grupos = Array.from({ length: 30 }, (_, i) => ({ tipo: "codigo", clave: `grupo-${i}`, ids: [i * 2 + 1, i * 2 + 2] }));
  const duplicados1 = paginaGruposDuplicados(grupos, 1);
  const duplicados2 = paginaGruposDuplicados(grupos, 2);
  assert.equal(duplicados1.ids.length, 50);
  assert.equal(duplicados2.ids.length, 10);
  assert.equal(new Set([...duplicados1.ids, ...duplicados2.ids]).size, 60);
  console.log("Vistas de stock: límites, páginas, búsqueda, filtros y totales OK");
  const { client: dbClient } = await import("../src/db/index.ts");
  await dbClient.close();
} finally {
  await client.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
