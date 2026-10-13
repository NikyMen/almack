"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { db, proveedorArticulos, proveedorFormatos, proveedores } from "@/db";
import { CAMPOS_CATALOGO, CAMPOS_COMPROBANTE, type ArticuloImportado, type MapeoCampos, type ReglaCampo } from "@/lib/catalogo-proveedor-config";
import { leerArchivoCatalogo } from "@/lib/catalogo-proveedor";

const ruta = "/admin/compras/proveedores";
const error = (mensaje: string) => ({ ok: false as const, error: mensaje });
const limpio = (x: unknown, max = 200) => String(x ?? "").trim().slice(0, max);

async function existeProveedor(id: number) {
  const [p] = await db.select({ id: proveedores.id }).from(proveedores).where(eq(proveedores.id, id)).limit(1);
  return Boolean(p);
}

export async function guardarProveedor(datos: { id?: number; nombre: string; cuit: string; contacto: string; telefono: string; email: string; direccion: string; notas: string; activo: boolean }) {
  await requireAcceso("compras");
  const nombre = limpio(datos.nombre, 120);
  if (!nombre) return error("Ingresá el nombre del proveedor.");
  const [duplicado] = await db.select({ id: proveedores.id }).from(proveedores).where(sql`lower(${proveedores.nombre}) = lower(${nombre})`).limit(1);
  if (duplicado && duplicado.id !== datos.id) return error("Ya existe un proveedor con ese nombre.");
  const valores = { nombre, cuit: limpio(datos.cuit, 30), contacto: limpio(datos.contacto, 120), telefono: limpio(datos.telefono, 60), email: limpio(datos.email, 120), direccion: limpio(datos.direccion, 250), notas: limpio(datos.notas, 2000), activo: datos.activo === true };
  if (datos.id) {
    if (!await existeProveedor(datos.id)) return error("Proveedor inexistente.");
    await db.update(proveedores).set(valores).where(eq(proveedores.id, datos.id));
    revalidatePath(ruta);
    return { ok: true as const, id: datos.id };
  }
  const [creado] = await db.insert(proveedores).values(valores).returning({ id: proveedores.id });
  revalidatePath(ruta);
  return { ok: true as const, id: creado.id };
}

export async function guardarArticulo(proveedorId: number, datos: { id?: number; codigo: string; nombre: string; precio: number; marca: string; categoria: string; unidad: string; moneda: string; activo: boolean }) {
  await requireAcceso("compras");
  if (!await existeProveedor(proveedorId)) return error("Proveedor inexistente.");
  const codigo = limpio(datos.codigo, 100);
  const nombre = limpio(datos.nombre, 250);
  if (!codigo || !nombre) return error("Código y nombre son obligatorios.");
  if (!Number.isFinite(datos.precio) || datos.precio < 0 || datos.precio > 1e12) return error("Ingresá un precio válido.");
  const valores = { proveedorId, codigo, nombre, precio: datos.precio, marca: limpio(datos.marca, 120), categoria: limpio(datos.categoria, 120), unidad: limpio(datos.unidad, 60) || "unidad", moneda: limpio(datos.moneda, 10).toUpperCase() || "ARS", activo: datos.activo === true, actualizadoEn: new Date() };
  const [duplicado] = await db.select({ id: proveedorArticulos.id }).from(proveedorArticulos).where(and(eq(proveedorArticulos.proveedorId, proveedorId), eq(proveedorArticulos.codigo, codigo))).limit(1);
  if (duplicado && duplicado.id !== datos.id) return error("Ese código ya existe en el catálogo del proveedor.");
  if (datos.id) {
    const [actualizado] = await db.update(proveedorArticulos).set(valores).where(and(eq(proveedorArticulos.id, datos.id), eq(proveedorArticulos.proveedorId, proveedorId))).returning({ id: proveedorArticulos.id });
    if (!actualizado) return error("Artículo inexistente.");
  } else await db.insert(proveedorArticulos).values(valores);
  revalidatePath(`${ruta}/${proveedorId}`);
  return { ok: true as const };
}

export async function guardarFormato(proveedorId: number, datos: { id?: number; nombre: string; clase: string; tipoArchivo: string; hoja: string; filaEncabezado: number; separador: string; campos: MapeoCampos; notas: string }) {
  await requireAcceso("compras");
  if (!await existeProveedor(proveedorId)) return error("Proveedor inexistente.");
  if (!limpio(datos.nombre, 120)) return error("Ingresá un nombre para el formato.");
  if (!["catalogo", "comprobante"].includes(datos.clase)) return error("Clase de formato inválida.");
  if (!["csv", "tsv", "xlsx", "txt", "pdf"].includes(datos.tipoArchivo) || (datos.clase === "catalogo" && !["csv", "tsv", "xlsx"].includes(datos.tipoArchivo))) return error("Tipo de archivo inválido.");
  if (!Number.isInteger(datos.filaEncabezado) || datos.filaEncabezado < 1 || datos.filaEncabezado > 200) return error("La fila de encabezado debe estar entre 1 y 200.");
  if (!["auto", "coma", "punto_coma", "tab"].includes(datos.separador)) return error("Separador inválido.");
  const camposValidos = datos.clase === "catalogo" ? CAMPOS_CATALOGO : CAMPOS_COMPROBANTE;
  const campos: MapeoCampos = {};
  for (const campo of camposValidos) {
    const regla = datos.campos?.[campo];
    if (!regla) continue;
    const origen = limpio(regla.origen, 120);
    const transformacion: ReglaCampo["transformacion"] = ["ninguna", "mayusculas", "minusculas", "decimal_coma", "decimal_punto"].includes(regla.transformacion) ? regla.transformacion : "ninguna";
    if (origen) campos[campo] = { origen, transformacion };
  }
  if (datos.clase === "catalogo" && ["codigo", "nombre", "precio"].some(c => !campos[c as keyof MapeoCampos]?.origen)) return error("Asigná las columnas de código, nombre y precio.");
  const valores = { proveedorId, nombre: limpio(datos.nombre, 120), clase: datos.clase, tipoArchivo: datos.tipoArchivo, hoja: limpio(datos.hoja, 100), filaEncabezado: datos.filaEncabezado, separador: datos.separador, campos: JSON.stringify(campos), notas: limpio(datos.notas, 2000), actualizadoEn: new Date() };
  if (datos.id) {
    const [actualizado] = await db.update(proveedorFormatos).set(valores).where(and(eq(proveedorFormatos.id, datos.id), eq(proveedorFormatos.proveedorId, proveedorId))).returning({ id: proveedorFormatos.id });
    if (!actualizado) return error("Formato inexistente.");
  } else await db.insert(proveedorFormatos).values(valores);
  revalidatePath(`${ruta}/${proveedorId}`);
  return { ok: true as const };
}

async function formatoCatalogo(proveedorId: number, formatoId: number) {
  const [formato] = await db.select().from(proveedorFormatos).where(and(eq(proveedorFormatos.id, formatoId), eq(proveedorFormatos.proveedorId, proveedorId), eq(proveedorFormatos.clase, "catalogo"))).limit(1);
  return formato;
}

export async function previsualizarCatalogo(proveedorId: number, formatoId: number, archivo: File) {
  await requireAcceso("compras");
  if (!await existeProveedor(proveedorId)) return error("Proveedor inexistente.");
  const formato = await formatoCatalogo(proveedorId, formatoId);
  if (!formato) return error("Elegí un formato de catálogo del proveedor.");
  try {
    const lectura = await leerArchivoCatalogo(archivo, formato);
    return { ok: true as const, total: lectura.articulos.length, muestra: lectura.articulos.slice(0, 15), errores: lectura.errores.slice(0, 20), hayErrores: lectura.errores.length > 0 };
  } catch (e) { return error(e instanceof Error ? e.message : "No se pudo leer el catálogo."); }
}

export async function importarCatalogo(proveedorId: number, formatoId: number, archivo: File) {
  await requireAcceso("compras");
  if (!await existeProveedor(proveedorId)) return error("Proveedor inexistente.");
  const formato = await formatoCatalogo(proveedorId, formatoId);
  if (!formato) return error("Elegí un formato de catálogo del proveedor.");
  let articulos: ArticuloImportado[];
  try {
    const lectura = await leerArchivoCatalogo(archivo, formato);
    if (lectura.errores.length) return error(`Corregí el archivo antes de importarlo. ${lectura.errores[0]}`);
    articulos = lectura.articulos;
  } catch (e) { return error(e instanceof Error ? e.message : "No se pudo leer el catálogo."); }
  const ahora = new Date();
  const columnas = JSON.parse(formato.campos) as MapeoCampos;
  try {
    await db.transaction(async tx => {
      for (let i = 0; i < articulos.length; i += 50) {
        await tx.insert(proveedorArticulos).values(articulos.slice(i, i + 50).map(a => ({ proveedorId, ...a, activo: true, actualizadoEn: ahora })))
          .onConflictDoUpdate({ target: [proveedorArticulos.proveedorId, proveedorArticulos.codigo], set: {
            nombre: sqlExcluded("nombre"), precio: sqlExcluded("precio"),
            ...(columnas.marca?.origen ? { marca: sqlExcluded("marca") } : {}),
            ...(columnas.categoria?.origen ? { categoria: sqlExcluded("categoria") } : {}),
            ...(columnas.unidad?.origen ? { unidad: sqlExcluded("unidad") } : {}),
            ...(columnas.moneda?.origen ? { moneda: sqlExcluded("moneda") } : {}),
            activo: true, actualizadoEn: ahora,
          } });
      }
    });
  } catch { return error("No se pudo actualizar el catálogo. Revisá el archivo e intentá nuevamente."); }
  revalidatePath(`${ruta}/${proveedorId}`);
  return { ok: true as const, total: articulos.length };
}

// SQLite permite referir los valores del INSERT durante el upsert.
function sqlExcluded(columna: string) { return sql.raw(`excluded.${columna}`); }
