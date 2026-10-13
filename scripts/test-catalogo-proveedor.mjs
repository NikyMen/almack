import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { leerArchivoCatalogo, leerFilasCatalogo } from "../src/lib/catalogo-proveedor.ts";
import { CAMPOS_INICIALES } from "../src/lib/catalogo-proveedor-config.ts";

const formato = { tipoArchivo: "csv", hoja: "", filaEncabezado: 2, separador: "punto_coma", campos: JSON.stringify(CAMPOS_INICIALES) };
const contenido = "Lista de octubre\nCódigo;Producto;Precio;Marca;Categoría;Unidad;Moneda\n001;Arroz;1.234,50;Almack;Almacén;bolsa;ars\n002;Fideos;900,00;Casa;;unidad;ARS\n";
const archivo = new File([contenido], "lista.csv", { type: "text/csv" });
const lectura = await leerArchivoCatalogo(archivo, formato);
assert.equal(lectura.articulos.length, 2);
assert.deepEqual(lectura.errores, []);
assert.equal(lectura.articulos[0].codigo, "001");
assert.equal(lectura.articulos[0].precio, 1234.5);
assert.equal(lectura.articulos[0].moneda, "ARS");
const estiloPunto = leerFilasCatalogo([["Código", "Producto", "Precio"], ["US-1", "Importado", "1,234.56"]], 1, { ...CAMPOS_INICIALES, precio: { origen: "Precio", transformacion: "decimal_punto" } });
assert.equal(estiloPunto.articulos[0].precio, 1234.56);

const libro = new ExcelJS.Workbook();
const hoja = libro.addWorksheet("Precios");
hoja.addRow(["Código", "Producto", "Precio"]);
hoja.addRow(["X-1", "Aceite", 1500.25]);
const xlsx = new File([await libro.xlsx.writeBuffer()], "precios.xlsx");
const excel = await leerArchivoCatalogo(xlsx, { ...formato, tipoArchivo: "xlsx", hoja: "Precios", filaEncabezado: 1 });
assert.equal(excel.articulos[0].precio, 1500.25);

const conErrores = leerFilasCatalogo([
  ["Código", "Producto", "Precio"], ["A", "Uno", "10"], ["A", "Repetido", "12"], ["B", "Sin precio", ""],
], 1, CAMPOS_INICIALES);
assert.equal(conErrores.articulos.length, 1);
assert.equal(conErrores.errores.length, 2);
assert.throws(() => leerFilasCatalogo([["X", "Y", "Z"], ["A", "B", "1"]], 1, CAMPOS_INICIALES), /columna/);
console.log("Catálogo proveedor: mapeo, precios, códigos y errores correctos.");
