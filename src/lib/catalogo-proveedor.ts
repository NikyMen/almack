import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import type { MapeoCampos, ReglaCampo, ArticuloImportado } from "@/lib/catalogo-proveedor-config";


const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
function numeroDocumento(valor: string, modo: ReglaCampo["transformacion"] = "ninguna") {
  let texto = valor.trim().replace(/[$\s]/g, "");
  if (modo === "decimal_coma" && !texto.includes(",") && /^\d+\.\d{1,2}$/.test(texto)) return Number(texto);
  if (modo === "decimal_coma" || (modo !== "decimal_punto" && texto.lastIndexOf(",") > texto.lastIndexOf("."))) texto = texto.replace(/\./g, "").replace(",", ".");
  else if (modo === "decimal_punto" || texto.includes(",")) texto = texto.replace(/,/g, "");
  return Number(texto);
}
function indiceColumna(s: string) {
  if (!/^[A-Z]{1,2}$/i.test(s)) return -1;
  return [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}
function leerCelda(fila: string[], cabecera: string[], regla?: ReglaCampo) {
  if (!regla?.origen.trim()) return "";
  const origen = regla.origen.trim();
  const porNombre = cabecera.findIndex(h => normalizar(h) === normalizar(origen));
  const indice = porNombre >= 0 ? porNombre : indiceColumna(origen);
  let valor = indice >= 0 ? fila[indice]?.trim() ?? "" : "";
  if (regla.transformacion === "mayusculas") valor = valor.toUpperCase();
  if (regla.transformacion === "minusculas") valor = valor.toLowerCase();
  return valor;
}

export function leerFilasCatalogo(filas: string[][], filaEncabezado: number, campos: MapeoCampos) {
  if (!Number.isInteger(filaEncabezado) || filaEncabezado < 1 || filaEncabezado > filas.length) throw new Error("La fila de encabezados no existe en el archivo.");
  const cabecera = filas[filaEncabezado - 1];
  for (const campo of ["codigo", "nombre", "precio"] as const) {
    if (!campos[campo]?.origen?.trim()) throw new Error(`Falta asignar la columna de ${campo}.`);
  }
  for (const [campo, regla] of Object.entries(campos)) {
    const origen = regla?.origen?.trim();
    if (origen && !cabecera.some(h => normalizar(h) === normalizar(origen)) && indiceColumna(origen) < 0) throw new Error(`No se encontró la columna de ${campo}. Revisá el formato del proveedor.`);
  }
  const articulos: ArticuloImportado[] = [];
  const errores: string[] = [];
  const codigos = new Set<string>();
  for (let i = filaEncabezado; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila.some(c => c.trim())) continue;
    const codigo = leerCelda(fila, cabecera, campos.codigo);
    const nombre = leerCelda(fila, cabecera, campos.nombre);
    const precioTexto = leerCelda(fila, cabecera, campos.precio);
    const precio = numeroDocumento(precioTexto, campos.precio?.transformacion);
    if (!codigo || !nombre || !precioTexto || !Number.isFinite(precio) || precio < 0 || precio > 1e12) {
      errores.push(`Fila ${i + 1}: código, nombre o precio inválido.`); continue;
    }
    if (codigos.has(codigo)) { errores.push(`Fila ${i + 1}: código ${codigo} repetido.`); continue; }
    codigos.add(codigo);
    articulos.push({ codigo, nombre, precio, marca: leerCelda(fila, cabecera, campos.marca), categoria: leerCelda(fila, cabecera, campos.categoria), unidad: leerCelda(fila, cabecera, campos.unidad) || "unidad", moneda: leerCelda(fila, cabecera, campos.moneda) || "ARS" });
  }
  if (!articulos.length) throw new Error("El catálogo no contiene artículos válidos.");
  return { articulos, errores };
}

export async function leerArchivoCatalogo(archivo: File, formato: { tipoArchivo: string; hoja: string; filaEncabezado: number; separador: string; campos: string }) {
  if (!archivo.size || archivo.size > 8 * 1024 * 1024) throw new Error("El archivo debe pesar hasta 8 MB.");
  const extension = archivo.name.split(".").pop()?.toLowerCase();
  if (!["csv", "tsv", "xlsx"].includes(extension ?? "") || extension !== formato.tipoArchivo) throw new Error(`Elegí un archivo ${formato.tipoArchivo.toUpperCase()} para este formato.`);
  const buffer = Buffer.from(await archivo.arrayBuffer());
  let filas: string[][];
  if (extension === "xlsx") {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as Parameters<typeof libro.xlsx.load>[0]);
    const hoja = formato.hoja ? libro.getWorksheet(formato.hoja) : libro.worksheets[0];
    if (!hoja) throw new Error("La hoja configurada no existe en el archivo.");
    if (hoja.rowCount > 5001 || hoja.columnCount > 80) throw new Error("Usá hasta 5000 artículos y 80 columnas.");
    filas = Array.from({ length: hoja.rowCount }, (_, i) => Array.from({ length: hoja.columnCount }, (_, j) => hoja.getRow(i + 1).getCell(j + 1).text));
  } else {
    const texto = buffer.toString("utf8");
    const primera = texto.split(/\r?\n/)[0];
    const separador = formato.separador === "tab" ? "\t" : formato.separador === "punto_coma" ? ";" : formato.separador === "coma" ? "," : extension === "tsv" ? "\t" : primera.includes(";") ? ";" : ",";
    filas = parse(texto, { delimiter: separador, bom: true, skip_empty_lines: false, max_record_size: 20000, relax_column_count: true }) as string[][];
    if (filas.length > 5001 || filas.some(f => f.length > 80)) throw new Error("Usá hasta 5000 artículos y 80 columnas.");
  }
  let campos: MapeoCampos;
  try { campos = JSON.parse(formato.campos) as MapeoCampos; } catch { throw new Error("El mapeo de columnas no es válido."); }
  return leerFilasCatalogo(filas, formato.filaEncabezado, campos);
}
