import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db, productos } from "@/db";
import { cantidadValida } from "@/lib/cantidades";
import { numeroDocumento } from "@/lib/documento-stock";
import { fijarStockEnTx } from "@/lib/stock";

type FilaStock = { sku: string; nombre: string; categoria: string; costo: number; venta: number; stock: number; unidad: "unidad" | "kg"; minimo: number };
const normalizar = (valor: string) => valor.trim().toLocaleLowerCase("es-AR");

export async function leerImportacionStock(archivo: File, sucursalNombre: string): Promise<FilaStock[]> {
  if (!archivo.name.toLowerCase().endsWith(".xlsx") || !archivo.size || archivo.size > 8 * 1024 * 1024) throw new Error("Elegí una planilla XLSX de hasta 8 MB.");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await archivo.arrayBuffer()) as unknown as Parameters<typeof libro.xlsx.load>[0]);
  const hoja = libro.worksheets.find(h => h.actualRowCount > 0);
  if (!hoja || hoja.rowCount > 1001 || hoja.columnCount > 100) throw new Error("La planilla debe contener hasta 1000 productos y 100 columnas.");
  const cabeceras = Array.from({ length: hoja.columnCount }, (_, i) => normalizar(hoja.getRow(1).getCell(i + 1).text));
  const columna = (nombre: string) => cabeceras.indexOf(normalizar(nombre)) + 1;
  const stockColumna = columna(`Stock · ${sucursalNombre}`) || columna("Stock en sucursal");
  const indices = { sku: columna("SKU"), nombre: columna("Producto"), categoria: columna("Categoría"), costo: columna("Costo"), venta: columna("Precio de venta"), stock: stockColumna, unidad: columna("Unidad"), minimo: columna("Stock mínimo") };
  if (Object.values(indices).some(i => i < 1)) throw new Error(`Usá la planilla exportada desde Stock para ${sucursalNombre}. Debe incluir SKU, producto, precios, unidad y stock de esa sucursal.`);
  const filas: FilaStock[] = [];
  const skus = new Set<string>();
  for (let n = 2; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    if (!fila.hasValues) continue;
    const celda = (indice: number) => fila.getCell(indice).text.trim();
    const sku = celda(indices.sku);
    const nombre = celda(indices.nombre);
    if ([indices.costo, indices.venta, indices.stock, indices.minimo].some(i => !celda(i))) throw new Error(`Revisá la fila ${n}: completá precios, stock y mínimo.`);
    const categoria = celda(indices.categoria) || "General";
    const costo = numeroDocumento(celda(indices.costo));
    const venta = numeroDocumento(celda(indices.venta));
    const stock = numeroDocumento(celda(indices.stock));
    const minimo = numeroDocumento(celda(indices.minimo));
    const unidadTexto = normalizar(celda(indices.unidad));
    const unidad = unidadTexto === "kg" ? "kg" : unidadTexto === "unidad" ? "unidad" : null;
    if (!sku || sku.length > 100 || !nombre || nombre.length > 300 || categoria.length > 100 || !unidad || !cantidadValida(stock, unidad, true) ||
      !Number.isFinite(costo) || costo < 0 || costo > 1e12 || !Number.isFinite(venta) || venta < 0 || venta > 1e12 || !Number.isFinite(minimo) || minimo < 0 || minimo > 1e9)
      throw new Error(`Revisá la fila ${n}: SKU, producto, unidad, precios y stock válidos son obligatorios.`);
    const clave = normalizar(sku);
    if (skus.has(clave)) throw new Error(`El SKU ${sku} aparece más de una vez en la planilla.`);
    skus.add(clave);
    filas.push({ sku, nombre, categoria, costo, venta, stock, unidad, minimo });
  }
  if (!filas.length || filas.length > 1000) throw new Error("La planilla debe contener entre 1 y 1000 productos.");
  return filas;
}

export async function aplicarImportacionStock(filas: FilaStock[], sucursalId: number) {
  return db.transaction(async tx => {
    const existentes = await tx.select({ id: productos.id, sku: productos.sku }).from(productos).where(eq(productos.activo, true));
    const porSku = new Map<string, number>();
    const importados = new Set(filas.map(f => normalizar(f.sku)));
    for (const producto of existentes) {
      const clave = normalizar(producto.sku);
      if (porSku.has(clave) && importados.has(clave)) throw new Error(`El SKU ${producto.sku} está duplicado en el sistema. Resolvelo antes de importar.`);
      porSku.set(clave, producto.id);
    }
    let creados = 0;
    let actualizados = 0;
    for (const fila of filas) {
      const clave = normalizar(fila.sku);
      const datos = { sku: fila.sku, nombre: fila.nombre, categoria: fila.categoria, precioCompra: fila.costo, precioVenta: fila.venta, unidadMedida: fila.unidad, stockMinimo: fila.minimo };
      let id = porSku.get(clave);
      if (id) {
        await tx.update(productos).set(datos).where(eq(productos.id, id));
        actualizados++;
      } else {
        const [creado] = await tx.insert(productos).values({ ...datos, stock: 0 }).returning({ id: productos.id });
        id = creado.id;
        porSku.set(clave, id);
        creados++;
      }
      await fijarStockEnTx(tx, id, sucursalId, fila.stock);
    }
    return { creados, actualizados };
  });
}
