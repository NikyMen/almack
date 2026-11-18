import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
if (!process.env.TURSO_DATABASE_URL?.startsWith("file:stock-excel-test-")) throw new Error("Se requiere base temporal aislada.");
const migracion = spawnSync(process.execPath, ["--import", "tsx", "src/db/migrate.ts"], { env: process.env, encoding: "utf8" });
assert.equal(migracion.status, 0, migracion.stderr || migracion.stdout);
const { db, client, productos, sucursales, stockSucursal } = await import("../src/db/index.ts");
const { leerImportacionStock, aplicarImportacionStock } = await import("../src/lib/importar-stock.ts");
try {
  const [sucursal] = await db.select().from(sucursales).limit(1);
  const [existente] = await db.insert(productos).values({ sku: "A1", nombre: "Anterior", stock: 2, precioCompra: 1, precioVenta: 2 }).returning();
  await db.insert(stockSucursal).values({ productoId: existente.id, sucursalId: sucursal.id, cantidad: 2 });
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Stock");
  hoja.addRows([
    ["SKU", "Producto", "Categoría", "Costo", "Precio de venta", "Stock en sucursal", "En tránsito", "Unidad", "Stock mínimo"],
    ["A1", "Actualizado", "Almacén", 10, 20, 5, 0, "unidad", 3],
    ["B2", "Nuevo", "Lácteos", 30, 40, 1.5, 0, "kg", 2],
  ]);
  const archivo = new File([await libro.xlsx.writeBuffer()], "stock.xlsx");
  const filas = await leerImportacionStock(archivo, sucursal.nombre);
  assert.equal(filas.length, 2);
  assert.deepEqual(await aplicarImportacionStock(filas, sucursal.id), { creados: 1, actualizados: 1 });
  const actual = (await db.select().from(productos).where(eq(productos.id, existente.id)))[0];
  assert.deepEqual([actual.nombre, actual.precioCompra, actual.precioVenta, actual.stock], ["Actualizado", 10, 20, 5]);
  const [nuevo] = await db.select().from(productos).where(eq(productos.sku, "B2"));
  assert.deepEqual([nuevo.stock, nuevo.unidadMedida], [1.5, "kg"]);
  const [otra] = await db.insert(sucursales).values({ nombre: "Otra sucursal" }).returning();
  await db.insert(stockSucursal).values({ productoId: existente.id, sucursalId: otra.id, cantidad: 4 });
  const consolidado = new ExcelJS.Workbook();
  consolidado.addWorksheet("Stock").addRows([
    ["SKU", "Producto", "Categoría", "Costo", "Precio de venta", "Stock total", "En tránsito", "Unidad", "Stock mínimo", `Stock · ${sucursal.nombre}`, `Stock · ${otra.nombre}`],
    ["A1", "Actualizado", "Almacén", 10, 20, 11, 0, "unidad", 3, 7, 4],
  ]);
  const filasConsolidadas = await leerImportacionStock(new File([await consolidado.xlsx.writeBuffer()], "consolidado.xlsx"), sucursal.nombre);
  await aplicarImportacionStock(filasConsolidadas, sucursal.id);
  assert.equal((await db.select().from(productos).where(eq(productos.id, existente.id)))[0].stock, 11);
  assert.equal((await db.select().from(stockSucursal).where(eq(stockSucursal.sucursalId, otra.id)))[0].cantidad, 4);
  hoja.addRow(["A1", "Duplicado", "", 1, 2, 3, 0, "unidad", 0]);
  await assert.rejects(leerImportacionStock(new File([await libro.xlsx.writeBuffer()], "duplicados.xlsx"), sucursal.nombre), /más de una vez/);
  assert.equal((await db.select().from(productos)).length, 2);
  console.log("Importación Excel de stock: validación, alta, actualización y rollback OK.");
} finally { client.close(); }
