import ExcelJS from "exceljs";
import type { ProductoConStock } from "@/components/stock-manager";
import type { Sucursal } from "@/db/schema";

export async function crearExcelStock(items: ProductoConStock[], sucursales: Sucursal[], sucursalId: number | null) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Almack";
  const hoja = libro.addWorksheet("Stock", { views: [{ state: "frozen", ySplit: 1 }] });
  const columnas = [
    { header: "SKU", key: "sku", width: 22 },
    { header: "Producto", key: "nombre", width: 42 },
    { header: "Categoría", key: "categoria", width: 22 },
    { header: "Costo", key: "costo", width: 17 },
    { header: "Precio de venta", key: "venta", width: 19 },
    { header: sucursalId ? "Stock en sucursal" : "Stock total", key: "stock", width: 20 },
    { header: "En tránsito", key: "transito", width: 17 },
    { header: "Unidad", key: "unidad", width: 13 },
    { header: "Stock mínimo", key: "minimo", width: 17 },
    ...(sucursalId ? [] : sucursales.map(s => ({ header: `Stock · ${s.nombre}`, key: `sucursal_${s.id}`, width: 21 }))),
  ];
  hoja.columns = columnas;
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  encabezado.alignment = { vertical: "middle" };
  encabezado.height = 27;

  for (const item of items) {
    const fila: Record<string, string | number> = {
      sku: item.sku,
      nombre: item.nombre,
      categoria: item.categoria ?? "General",
      costo: item.precioCompra,
      venta: item.precioVenta,
      stock: item.stockLocal,
      transito: item.transitoLocal,
      unidad: item.unidadMedida,
      minimo: item.stockMinimo,
    };
    if (!sucursalId) for (const sucursal of sucursales) fila[`sucursal_${sucursal.id}`] = item.porSucursal[sucursal.id] ?? 0;
    hoja.addRow(fila);
  }
  hoja.getColumn("costo").numFmt = '"$"#,##0.00';
  hoja.getColumn("venta").numFmt = '"$"#,##0.00';
  for (const clave of ["stock", "transito", "minimo", ...(!sucursalId ? sucursales.map(s => `sucursal_${s.id}`) : [])]) {
    hoja.getColumn(clave).numFmt = "#,##0.###";
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, hoja.rowCount), column: columnas.length } };
  return Buffer.from(await libro.xlsx.writeBuffer());
}
