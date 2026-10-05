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
    cantidad: ["cantidad", "cant", "unidades"],
    precioUnit: ["costo", "precio", "precio unitario", "precio compra", "costo unitario"],
  };
  const encabezado = filas.findIndex(f => Object.values(alias).filter(a => f.some(c => a.includes(normalizar(c)))).length >= 3);
  if (encabezado < 0) throw new Error("Usá columnas Nombre, Código, Cantidad y Costo unitario. No se encontró el encabezado.");
  const cab = filas[encabezado].map(normalizar);
  const indice = (key: keyof typeof alias) => cab.findIndex(c => alias[key].includes(c));
  if (["descripcion", "cantidad", "precioUnit"].some(k => indice(k as keyof typeof alias) < 0)) throw new Error("Faltan columnas Nombre, Cantidad o Costo unitario.");
  const items = filas.slice(encabezado + 1).filter(f => f.some(c => c.trim())).map((f, i) => {
    const descripcion = f[indice("descripcion")]?.trim() ?? "";
    const cantidad = numeroDocumento(f[indice("cantidad")] ?? "");
    const precioUnit = numeroDocumento(f[indice("precioUnit")] ?? "");
    if (!descripcion || !Number.isSafeInteger(cantidad) || cantidad <= 0 || !Number.isFinite(precioUnit) || precioUnit <= 0) throw new Error(`Revisá la fila ${encabezado + i + 2}: nombre, cantidad entera positiva y costo unitario positivo son obligatorios.`);
    return { descripcion, codigo: f[indice("codigo")]?.trim() ?? "", cantidad, precioUnit };
  });
  if (!items.length || items.length > 500) throw new Error("El archivo debe contener entre 1 y 500 productos.");
  return { proveedor: "", total: items.reduce((s, i) => s + i.cantidad * i.precioUnit, 0), items };
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
    if (!sheet || sheet.rowCount > 1000 || sheet.columnCount > 100) throw new Error("Usá una hoja de hasta 500 productos y 100 columnas.");
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
