import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { parse } from "csv-parse/sync";
import { leerRemitoImagen, leerRemitoTexto } from "@/lib/ai";
import { normalizar, type LecturaRemito } from "@/lib/recepcion";

export function numeroDocumento(valor: string): number {
  let texto = valor.trim().replace(/[$\s]/g, "");
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
  return Number(texto);
}

export function leerTablaStock(filas: string[][]): LecturaRemito {
  const alias = {
    descripcion: ["nombre", "producto", "descripcion", "detalle"],
    codigo: ["codigo", "sku", "codigo de barras"],
    cantidad: ["cantidad", "cant", "unidades", "stock actual"],
    precioUnit: ["costo", "precio", "precio unitario", "precio compra", "costo unitario", "precio de costo"],
    precioVenta: ["precio de venta", "precio venta"],
  };
  const encabezado = filas.findIndex(f => {
    const c = f.map(normalizar);
    return ["descripcion", "cantidad", "precioUnit"].every(k => c.some(v => alias[k as keyof typeof alias].includes(v)));
  });
  if (encabezado < 0) throw new Error("No se encontró el encabezado. Usá Producto, Stock actual y Precio de costo, o Nombre, Cantidad y Costo unitario.");
  const cab = filas[encabezado].map(normalizar);
  const indice = (key: keyof typeof alias) => cab.findIndex(c => alias[key].includes(c));
  const esInventario = cab.includes("stock actual");
  const items = filas.slice(encabezado + 1).flatMap((f, i) => {
    if (!f.some(c => c.trim())) return [];
    const descripcion = f[indice("descripcion")]?.trim() ?? "";
    const cantidad = numeroDocumento(f[indice("cantidad")] ?? "");
    const precioUnit = numeroDocumento(f[indice("precioUnit")] ?? "");
    const precioVenta = indice("precioVenta") >= 0 ? numeroDocumento(f[indice("precioVenta")] ?? "") : undefined;
    if (!descripcion || !Number.isFinite(cantidad) || Math.abs(cantidad) > 1_000_000 || Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.000001 || !Number.isFinite(precioUnit) || precioUnit < 0 ||
      (precioVenta !== undefined && (!Number.isFinite(precioVenta) || precioVenta < 0)))
      throw new Error(`Revisá la fila ${encabezado + i + 2}: producto, stock (hasta 3 decimales) y precios válidos son obligatorios.`);
    if (!esInventario && cantidad <= 0) throw new Error(`Revisá la fila ${encabezado + i + 2}: la cantidad de un remito debe ser positiva.`);
    return [{ descripcion, codigo: f[indice("codigo")]?.trim() ?? "", cantidad, precioUnit, precioVenta,
      modoStock: esInventario ? "fijar" as const : "sumar" as const, unidadMedida: Number.isInteger(cantidad) ? "unidad" as const : "kg" as const }];
  });
  if (!items.length || items.length > 1000) throw new Error("El archivo debe contener entre 1 y 1000 productos.");
  return { proveedor: "", total: items.reduce((s, i) => s + i.cantidad * i.precioUnit, 0), items, omitidos: 0 };
}

export async function extraerDocumentoStock(archivo: File): Promise<LecturaRemito> {
  if (!archivo.size || archivo.size > 8 * 1024 * 1024) throw new Error("El archivo debe pesar hasta 8 MB.");
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = archivo.name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext ?? "")) {
    const mediaType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    return leerRemitoImagen({ base64: buffer.toString("base64"), mediaType: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif" });
  }
  if (ext === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets.find(s => s.actualRowCount > 0);
    if (!sheet || sheet.rowCount > 1100 || sheet.columnCount > 100) throw new Error("Usá una hoja de hasta 1000 productos y 100 columnas.");
    const filas: string[][] = [];
    sheet.eachRow(row => filas.push(Array.from({ length: sheet.columnCount }, (_, i) => row.getCell(i + 1).text)));
    return leerTablaStock(filas);
  }
  if (ext === "csv" || ext === "tsv") {
    const texto = buffer.toString("utf8");
    const primera = texto.split(/\r?\n/)[0];
    const delimiter = ext === "tsv" ? "\t" : primera.includes(";") ? ";" : ",";
    return leerTablaStock(parse(texto, { delimiter, bom: true, skip_empty_lines: true, max_record_size: 10000 }) as string[][]);
  }
  if (ext === "docx" || ext === "txt") {
    const texto = ext === "docx" ? (await mammoth.extractRawText({ buffer })).value : buffer.toString("utf8");
    if (!texto.trim() || texto.length > 12000) throw new Error("El documento debe tener texto y no superar 12.000 caracteres.");
    return leerRemitoTexto(texto);
  }
  throw new Error("Formato no soportado. Usá una foto, XLSX, CSV, TSV, DOCX o TXT. Convertí XLS y DOC a formatos actuales.");
}
