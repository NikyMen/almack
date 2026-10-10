import { verificarClaveAdministrador } from "./clave-admin";
import { db, cajaTurnos, cajaMovimientos, ventas, ventaItems, productos, stockSucursal, cajaSeguridad, cajaIntentos, cajaExtracciones } from "@/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { cantidadValida, redondearCantidad } from "@/lib/cantidades";
export type CajaTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// El cliente SQLite embebido comparte conexión; serializamos sus operaciones
// de caja. En Turso, cada transacción usa el aislamiento del servidor.
let colaLocal: Promise<void> = Promise.resolve();
function transaccionCaja<T>(operacion: (tx: CajaTx) => Promise<T>): Promise<T> {
  if (!(process.env.TURSO_DATABASE_URL?.trim() || "file:gestoria.db").startsWith("file:")) return db.transaction(operacion);
  const resultado = colaLocal.then(() => db.transaction(operacion));
  colaLocal = resultado.then(() => {}, () => {});
  return resultado;
}
const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function validarMonto(n: number, positivo = false) {
  if (!Number.isFinite(n) || n < 0 || (positivo && n === 0) || n > 1e12 || Math.abs(n - redondear(n)) > 0.000001) throw new Error("Ingresá un importe válido con hasta dos decimales.");
}
export async function cajaAbierta(sucursalId: number, executor: CajaTx | typeof db = db) {
  const [turno] = await executor.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursalId), eq(cajaTurnos.estado, "abierta")));
  return turno ?? null;
}
export async function resumenCaja(turno: typeof cajaTurnos.$inferSelect, executor: CajaTx | typeof db = db) {
  const cobros = await executor.select({ medio: ventas.medioPago, total: sql<number>`coalesce(sum(${ventas.total}),0)`, cantidad: sql<number>`count(*)` }).from(ventas).where(and(eq(ventas.cajaTurnoId, turno.id), eq(ventas.estado, "completada"))).groupBy(ventas.medioPago);
  const movimientos = await executor.select().from(cajaMovimientos).where(eq(cajaMovimientos.turnoId, turno.id)).orderBy(desc(cajaMovimientos.id));
  const ingresos = redondear(movimientos.filter(m => m.tipo === "ingreso").reduce((a,m) => a + m.monto, 0));
  const retiros = redondear(movimientos.filter(m => m.tipo === "retiro").reduce((a,m) => a + m.monto, 0));
  const efectivo = redondear(cobros.find(c => c.medio === "efectivo")?.total ?? 0);
  return { cobros, movimientos, ingresos, retiros, efectivo, esperado: redondear(turno.fondoInicial + efectivo + ingresos - retiros) };
}
export async function abrirCaja(sucursalId: number, responsable: string, fondoInicial: number, usarSaldoAnterior = false) {
  validarMonto(fondoInicial);
  return transaccionCaja(async tx => {
    if (await cajaAbierta(sucursalId, tx)) throw new Error("Esta sucursal ya tiene una caja abierta.");
    if (usarSaldoAnterior) {
      const anterior = await saldoUltimoCierre(sucursalId, tx);
      if (!anterior) throw new Error("Esta sucursal todavía no tiene un cierre anterior.");
      fondoInicial = anterior.disponible;
    }
    const [turno] = await tx.insert(cajaTurnos).values({ sucursalId, responsable, fondoInicial }).returning();
    return turno;
  });
}
export async function moverEfectivo(sucursalId: number, turnoId: number, responsable: string, tipo: string, monto: number, motivo: string) {
  validarMonto(monto, true);
  if (tipo !== "ingreso") throw new Error("Los retiros requieren la clave de administrador. Usá Extracción.");
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá el tipo de movimiento y un motivo de hasta 500 caracteres.");
  await transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió o ya está cerrada. Actualizá la pantalla.");
await tx.insert(cajaMovimientos).values({ turnoId, responsable, tipo, monto, motivo: motivo.trim() });
  });
}
export async function cerrarCaja(sucursalId: number, turnoId: number, responsable: string, contado: number, observaciones: string) {
  validarMonto(contado);
  if (observaciones.length > 2000) throw new Error("Las observaciones no pueden superar 2000 caracteres.");
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió o ya está cerrada. Actualizá la pantalla.");
    const resumen = await resumenCaja(turno, tx);
    const diferencia = redondear(contado - resumen.esperado);
    if (diferencia !== 0 && !observaciones.trim()) throw new Error("Explicá el faltante o sobrante antes de cerrar.");
    await tx.update(cajaTurnos).set({ estado: "cerrada", cerradoPor: responsable, cerradoEn: new Date(), efectivoContado: contado, efectivoEsperado: resumen.esperado, diferencia, resumen: JSON.stringify(resumen.cobros), observaciones: observaciones.trim() }).where(eq(cajaTurnos.id, turnoId));
    return { esperado: resumen.esperado, contado, diferencia };
  });
}
export async function venderEnCaja(sucursalId: number, cajero: string, items: { productoId: number; cantidad: number }[], medioPago: string, opts?: { clienteId?: number | null; canal?: string }) {
  if (!items.length || !["efectivo", "qr", "tarjeta"].includes(medioPago)) throw new Error("Revisá los productos y el medio de pago.");
  const cantidades = new Map<number, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.productoId) || !Number.isFinite(item.cantidad) || item.cantidad <= 0) throw new Error("Revisá las cantidades del pedido.");
    cantidades.set(item.productoId, redondearCantidad((cantidades.get(item.productoId) ?? 0) + item.cantidad));
  }
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno) throw new Error("Abrí la caja de esta sucursal antes de cobrar.");
    const lineas = [];
    let total = 0;
    for (const [productoId, cantidad] of cantidades) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, productoId));
      if (!p || !p.activo) throw new Error("Hay un producto que ya no está disponible.");
      if (!cantidadValida(cantidad, p.unidadMedida as "unidad" | "kg")) throw new Error(`Cantidad inválida de "${p.nombre}". Usá unidades enteras o kg con hasta tres decimales.`);
      validarMonto(p.precioVenta);
      const r = await tx.update(stockSucursal).set({ cantidad: sql`round(${stockSucursal.cantidad} - ${cantidad}, 3)` }).where(and(eq(stockSucursal.productoId, productoId), eq(stockSucursal.sucursalId, sucursalId), sql`${stockSucursal.cantidad} >= ${cantidad}`));
      if (!r.rowsAffected) throw new Error(`Sin stock suficiente de "${p.nombre}".`);
      await tx.update(productos).set({ stock: sql`(select coalesce(sum(cantidad),0) from stock_sucursal where producto_id = ${productoId})` }).where(eq(productos.id, productoId));
      lineas.push({ productoId, cantidad, precioUnit: p.precioVenta });
      total += p.precioVenta * cantidad;
    }
    total = redondear(total);
    const [venta] = await tx.insert(ventas).values({ sucursalId, cajaTurnoId: turno.id, cajero, total, medioPago, clienteId: opts?.clienteId ?? null, canal: opts?.canal === "online" ? "online" : "local", estado: "completada" }).returning({ id: ventas.id });
    await tx.insert(ventaItems).values(lineas.map(l => ({ ...l, ventaId: venta.id })));
    return { ventaId: venta.id, total };
  });
}


export async function saldoUltimoCierre(sucursalId: number, executor: CajaTx | typeof db = db) {
  const [turno] = await executor.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursalId), eq(cajaTurnos.estado, "cerrada"))).orderBy(desc(cajaTurnos.id)).limit(1);
  if (!turno) return null;
  const [r] = await executor.select({ total: sql<number>`coalesce(sum(${cajaExtracciones.monto}),0)` }).from(cajaExtracciones).where(and(eq(cajaExtracciones.turnoId, turno.id), eq(cajaExtracciones.estadoCaja, "cerrada")));
  return { turnoId: turno.id, contado: turno.efectivoContado ?? 0, extraido: redondear(r.total), disponible: redondear((turno.efectivoContado ?? 0) - r.total) };
}
export async function extraerEfectivo(datos: { sucursalId: number; turnoId: number; usuario: string; responsable: string; clave: string; monto: number; motivo: string; solicitudId: string }) {
  validarMonto(datos.monto, true);
  if (!datos.motivo?.trim() || datos.motivo.length > 500) throw new Error("Indicá un motivo de hasta 500 caracteres.");
  if (!/^[a-f0-9-]{36}$/i.test(datos.solicitudId)) throw new Error("Solicitud inválida. Actualizá la pantalla.");
  return transaccionCaja(async tx => {
    const [config] = await tx.select().from(cajaSeguridad).where(eq(cajaSeguridad.id, 1));
    if (!config) return { ok: false, error: "El administrador debe configurar la clave en Equipo antes de realizar extracciones." };
    const [intento] = await tx.select().from(cajaIntentos).where(eq(cajaIntentos.usuario, datos.usuario));
    const ahora = Math.floor(Date.now() / 1000);
    if (intento && intento.bloqueadoHasta > ahora) return { ok: false, error: "Demasiados intentos. Volvé a intentar en 15 minutos." };
    if (!verificarClaveAdministrador(datos.clave, config.claveHash)) {
      const fallos = (intento?.bloqueadoHasta ? 0 : intento?.fallos ?? 0) + 1;
      await tx.insert(cajaIntentos).values({ usuario: datos.usuario, fallos, bloqueadoHasta: fallos >= 5 ? ahora + 900 : 0 }).onConflictDoUpdate({ target: cajaIntentos.usuario, set: { fallos, bloqueadoHasta: fallos >= 5 ? ahora + 900 : 0 } });
      return { ok: false, error: fallos >= 5 ? "Demasiados intentos. Volvé a intentar en 15 minutos." : "Clave de administrador incorrecta." };
    }
    await tx.delete(cajaIntentos).where(eq(cajaIntentos.usuario, datos.usuario));
    const [repetida] = await tx.select().from(cajaExtracciones).where(eq(cajaExtracciones.solicitudId, datos.solicitudId));
    if (repetida) {
      if (repetida.sucursalId !== datos.sucursalId || repetida.turnoId !== datos.turnoId || repetida.responsable !== datos.responsable || repetida.monto !== datos.monto || repetida.motivo !== datos.motivo.trim()) throw new Error("La solicitud ya fue usada con otros datos.");
      return { ok: true, error: "" };
    }
    const abierta = await cajaAbierta(datos.sucursalId, tx);
    const anterior = abierta ? null : await saldoUltimoCierre(datos.sucursalId, tx);
    if ((abierta?.id ?? anterior?.turnoId) !== datos.turnoId) throw new Error("La caja cambió. Actualizá la pantalla antes de extraer.");
    const disponible = abierta ? (await resumenCaja(abierta, tx)).esperado : anterior?.disponible ?? 0;
    if (datos.monto > disponible) throw new Error("La extracción supera el efectivo disponible.");
    const estadoCaja = abierta ? "abierta" : "cerrada";
    await tx.insert(cajaExtracciones).values({ solicitudId: datos.solicitudId, sucursalId: datos.sucursalId, turnoId: datos.turnoId, estadoCaja, monto: datos.monto, motivo: datos.motivo.trim(), responsable: datos.responsable });
    if (abierta) await tx.insert(cajaMovimientos).values({ turnoId: abierta.id, tipo: "retiro", monto: datos.monto, motivo: `Extracción: ${datos.motivo.trim()}`, responsable: datos.responsable });
    return { ok: true, error: "" };
  });
}



