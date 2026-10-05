import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";

if (!process.env.TURSO_DATABASE_URL?.startsWith("file:stock-import-test-")) throw new Error("Se requiere una base temporal.");
const migration = spawnSync(process.execPath, ["--import", "tsx", "src/db/migrate.ts"], { env: process.env, encoding: "utf8" });
assert.equal(migration.status, 0, migration.stderr || migration.stdout);
const { db, client, productos, compras, compraLineas, stockSucursal, diferenciasPrecios, compraItems } = await import("../src/db/index.ts");
const { extraerDocumentoStock, leerTablaStock } = await import("../src/lib/documento-stock.ts");
const { diferenciaCosto } = await import("../src/lib/precios-stock.ts");
const { confirmarStockEnTransaccion } = await import("../src/lib/confirmar-stock.ts");

try {
  const csv = new File(['Nombre;Código;Cantidad;Costo unitario\n"Alfajor; Milka";00123;5;"1.234,56"'], "ticket.csv");
  const lectura = await extraerDocumentoStock(csv);
  assert.equal(lectura.items[0].codigo, "00123");
  assert.equal(lectura.items[0].precioUnit, 1234.56);
  assert.equal(lectura.items[0].descripcion, "Alfajor; Milka");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");
  sheet.addRows([["Nombre", "Código", "Cantidad", "Costo unitario"], ["Milka", "00123", 2, 110]]);
  const xlsx = await extraerDocumentoStock(new File([await workbook.xlsx.writeBuffer()], "ticket.xlsx"));
  assert.equal(xlsx.items[0].precioUnit, 110);
  assert.equal(xlsx.items[0].codigo, "00123");
  assert.throws(() => leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Milka", "-2", "100"]]));
  assert.throws(() => leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Milka", "1.5", "100"]]));
  await assert.rejects(() => extraerDocumentoStock(new File(["texto"], "ticket.doc")), /Formato no soportado/);
  assert.equal(diferenciaCosto(0, 100, 200).sugerido, null);

  const sucursalId = Number((await client.execute("SELECT id FROM sucursales LIMIT 1")).rows[0].id);
  const [producto] = await db.insert(productos).values({ sku: "00123", nombre: "Milka", stock: 10, precioCompra: 100, precioVenta: 200 }).returning();
  await db.insert(stockSucursal).values({ productoId: producto.id, sucursalId, cantidad: 10 });
  const [compra] = await db.insert(compras).values({ proveedor: "Prueba", sucursalId }).returning();
  const usuario = { id: 0, nombre: "Tester" };
  const agregar = async costo => (await db.insert(compraLineas).values({ compraId: compra.id, productoId: producto.id, descripcion: "Milka", codigo: "00123", cantidad: 2, precioUnit: costo, estado: "match" }).returning())[0];
  const impacto = (linea, costo, venta, stock) => ({ lineaId: linea.id, nombre: "Milka", codigo: "00123", stockAnterior: stock, stockNuevo: stock + 2, costoAnterior: costo, costoNuevo: linea.precioUnit, ventaAnterior: venta, ...diferenciaCosto(costo, linea.precioUnit, venta) });
  const aplicar = (pendientes, impactos, revalorizar = []) => confirmarStockEnTransaccion({ compraId: compra.id, pendientes, sucursalId, usuario, opciones: { actualizarCosto: true, impactos, revalorizar } });
  const primera = await agregar(110);
  await aplicar([primera], [impacto(primera, 100, 200, 10)], [primera.id]);
  let [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 12);
  assert.equal(actual.precioCompra, 110);
  assert.equal(actual.precioVenta, 220);
  let historial = await db.select().from(diferenciasPrecios);
  assert.equal(historial.length, 1);
  assert.ok(Math.abs(historial[0].porcentaje - 10) < 1e-8);
  assert.equal(historial[0].revalorizado, true);
  await assert.rejects(() => aplicar([primera], [impacto(primera, 100, 200, 10)]), /borrador cambió/);

  const segunda = await agregar(99);
  await assert.rejects(() => aplicar([segunda], [impacto(segunda, 100, 220, 12)]), /precios cambiaron/);
  assert.equal((await db.select().from(compraItems)).length, 1);
  await aplicar([segunda], [impacto(segunda, 110, 220, 12)]);
  [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 14);
  assert.equal(actual.precioVenta, 220);
  historial = await db.select().from(diferenciasPrecios);
  assert.equal(historial.length, 2);
  assert.ok(Math.abs(historial[1].porcentaje + 10) < 1e-8);
  assert.equal(historial[1].ventaSugerida, 198);
  assert.equal(historial[1].revalorizado, false);

  const tercera = await agregar(120);
  const [otro] = await db.insert(productos).values({ sku: "X", nombre: "Otro", precioCompra: 1, precioVenta: 2 }).returning();
  const [fantasma] = await db.insert(compraLineas).values({ compraId: compra.id, productoId: otro.id, descripcion: "No existe", codigo: "X", cantidad: 1, precioUnit: 1, estado: "match" }).returning();
  await assert.rejects(() => aplicar([tercera, fantasma], [impacto(tercera, 99, 220, 14), { lineaId: fantasma.id, costoNuevo: 1, stockAnterior: 0, stockNuevo: 1 }]), /precios cambiaron/);
  [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 14);
  assert.equal(actual.precioCompra, 99);
  assert.equal((await db.select().from(diferenciasPrecios)).length, 2);
  const { unificarBorrador } = await import("../src/lib/unificar-borrador.ts");
  const [duplicada] = await db.insert(compras).values({ proveedor: "Duplicados", sucursalId }).returning();
  const repetidos = await db.insert(compraLineas).values([
    { compraId: duplicada.id, descripcion: "LECHE ENTERA", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
    { compraId: duplicada.id, descripcion: "LECHE ENTERA (12)", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
    { compraId: duplicada.id, descripcion: "LECHE ENTERA", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
  ]).returning();
  assert.equal(await unificarBorrador(duplicada.id), 2);
  const agrupadas = await db.select().from(compraLineas).where(eq(compraLineas.compraId, duplicada.id));
  assert.equal(agrupadas.length, 1); assert.equal(agrupadas[0].cantidad, 36);
  await confirmarStockEnTransaccion({ compraId: duplicada.id, pendientes: agrupadas, sucursalId, usuario, opciones: { impactos: [{ lineaId: agrupadas[0].id, nombre: agrupadas[0].descripcion, codigo: "LECHE-TEST", stockAnterior: 0, stockNuevo: 36, costoAnterior: 0, costoNuevo: 1795, ventaAnterior: 0, porcentaje: null, sugerido: null }] } });
  const leche = await db.select().from(productos).where(eq(productos.sku, "LECHE-TEST"));
  assert.equal(leche.length, 1); assert.equal(leche[0].stock, 36); assert.equal(leche[0].precioVenta, 3590);
  assert.equal(await unificarBorrador(duplicada.id), 0);
  const [conflicto] = await db.insert(compras).values({ proveedor: "Conflicto", sucursalId }).returning();
  await db.insert(compraLineas).values([
    { compraId: conflicto.id, descripcion: "A", codigo: "CONFLICTO", cantidad: 1, precioUnit: 100, precioVenta: 200 },
    { compraId: conflicto.id, descripcion: "A", codigo: "CONFLICTO", cantidad: 1, precioUnit: 110, precioVenta: 200 },
  ]);
  await assert.rejects(() => unificarBorrador(conflicto.id), /precios distintos/);
  assert.equal((await db.select().from(compraLineas).where(eq(compraLineas.compraId, conflicto.id))).length, 2);
  console.log("Duplicados: un solo producto, suma de unidades, venta costo × 2 y rollback de precios incompatibles OK.");
  console.log("Stock: CSV/XLSX, códigos, validación, subas/bajas, margen, revalorización, idempotencia, precios obsoletos y rollback OK.");
} finally { await client.close(); }
