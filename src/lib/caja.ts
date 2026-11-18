import { verificarClaveAdministrador } from "./clave-admin";
import { db, cajaTurnos, cajaMovimientos, cajaTraspasos, cajaRevisiones, cajaSaldoMovimientos, ventas, ventaItems, ventaDevoluciones, productos, stockSucursal, cajaSeguridad, cajaIntentos, cajaExtracciones, promociones, cambiosPrecio } from "@/db";
import { cotizarPromocion } from "@/lib/promociones";
import { and, eq, or, sql, desc } from "drizzle-orm";
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
export async function cierrePendiente(sucursalId: number, executor: CajaTx | typeof db = db) {
  const [turno] = await executor.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursalId), eq(cajaTurnos.estado, "pendiente"))).limit(1);
  return turno ?? null;
}
export async function traspasoPendiente(turnoId: number, executor: CajaTx | typeof db = db) {
  const [traspaso] = await executor.select().from(cajaTraspasos).where(and(eq(cajaTraspasos.turnoId, turnoId), eq(cajaTraspasos.estado, "pendiente"))).limit(1);
  return traspaso ?? null;
}
function exigirResponsable(turno: typeof cajaTurnos.$inferSelect, usuario: string, nombre = usuario) {
  if (turno.responsableUsuario ? turno.responsableUsuario !== usuario : turno.responsable !== nombre) throw new Error("La caja está asignada a otro responsable.");
}
export async function resumenCaja(turno: typeof cajaTurnos.$inferSelect, executor: CajaTx | typeof db = db) {
  const cobros = await executor.select({ medio: ventas.medioPago, total: sql<number>`coalesce(sum(${ventas.total}),0)`, cantidad: sql<number>`count(*)` }).from(ventas).where(and(eq(ventas.cajaTurnoId, turno.id), or(eq(ventas.estado, "completada"), eq(ventas.estado, "devuelta")))).groupBy(ventas.medioPago);
  const movimientos = await executor.select().from(cajaMovimientos).where(eq(cajaMovimientos.turnoId, turno.id)).orderBy(desc(cajaMovimientos.id));
  const ingresos = redondear(movimientos.filter(m => m.tipo === "ingreso").reduce((a,m) => a + m.monto, 0));
  const retiros = redondear(movimientos.filter(m => m.tipo === "retiro").reduce((a,m) => a + m.monto, 0));
  const efectivo = redondear(cobros.find(c => c.medio === "efectivo")?.total ?? 0);
  return { cobros, movimientos, ingresos, retiros, efectivo, esperado: redondear(turno.fondoInicial + efectivo + ingresos - retiros) };
}
export async function abrirCaja(sucursalId: number, responsable: string, contado?: number, motivoApertura = "", usuario = responsable, detalle = "{}") {
  return transaccionCaja(async tx => {
    if (await cajaAbierta(sucursalId, tx)) throw new Error("Esta sucursal ya tiene una caja abierta.");
    if (await cierrePendiente(sucursalId, tx)) throw new Error("El cierre anterior espera la aprobación del administrador.");
    const anterior = await saldoUltimoCierre(sucursalId, tx);
    validarMonto(contado ?? NaN);
    const fondoInicial = anterior?.disponible ?? contado!;
    const diferenciaApertura = anterior ? redondear(contado! - fondoInicial) : null;
    if (motivoApertura.length > 500) throw new Error("El motivo no puede superar 500 caracteres.");
    const [turno] = await tx.insert(cajaTurnos).values({ sucursalId, responsable, responsableUsuario: usuario, fondoInicial, fondoContado: contado!, detalleApertura: detalle, fondoEsperado: anterior?.disponible ?? null, diferenciaApertura, motivoApertura: motivoApertura.trim() }).returning();
    return turno;
  });
}
export async function moverEfectivo(sucursalId: number, turnoId: number, responsable: string, tipo: string, monto: number, motivo: string, usuario = responsable, administrador = false) {
  validarMonto(monto, true);
  if (tipo !== "ingreso") throw new Error("Los retiros requieren la clave de administrador. Usá Extracción.");
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá el tipo de movimiento y un motivo de hasta 500 caracteres.");
  await transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió o ya está cerrada. Actualizá la pantalla.");
    if (!administrador) exigirResponsable(turno, usuario, responsable);
    if (await traspasoPendiente(turnoId, tx)) throw new Error("La caja está en traspaso.");
    if (turno.arqueoEn) throw new Error("El arqueo está en curso. Cancelalo antes de registrar movimientos.");
await tx.insert(cajaMovimientos).values({ turnoId, responsable, tipo, monto, motivo: motivo.trim() });
  });
}
export async function cambiarArqueo(sucursalId: number, turnoId: number, activo: boolean, usuario?: string, nombre?: string) {
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió o ya está cerrada. Actualizá la pantalla.");
    if (usuario) exigirResponsable(turno, usuario, nombre);
    if (await traspasoPendiente(turnoId, tx)) throw new Error("La caja está en traspaso.");
    await tx.update(cajaTurnos).set({ arqueoEn: activo ? new Date() : null }).where(eq(cajaTurnos.id, turnoId));
  });
}

export async function devolverVenta(sucursalId: number, ventaId: number, usuario: string, motivo: string, referencia = "", reponerStock = true, usuarioId = usuario) {
  if (!Number.isSafeInteger(ventaId) || ventaId <= 0) throw new Error("Venta inválida.");
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá un motivo de hasta 500 caracteres.");
  if (referencia.length > 100) throw new Error("La referencia no puede superar 100 caracteres.");
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.arqueoEn) throw new Error("Abrí la caja y terminá el arqueo antes de registrar una devolución.");
    exigirResponsable(turno, usuarioId, usuario);
    if (await traspasoPendiente(turno.id, tx)) throw new Error("La caja está en traspaso.");
    const [venta] = await tx.select().from(ventas).where(eq(ventas.id, ventaId));
    if (!venta || venta.sucursalId !== sucursalId || venta.canal !== "local" || venta.estado !== "completada") throw new Error("La venta no admite una devolución local completa.");
    if (venta.facturada) throw new Error("La venta está facturada. Resolvé primero la nota de crédito correspondiente.");
    if (!["efectivo", "qr", "tarjeta"].includes(venta.medioPago)) throw new Error("Este medio de pago requiere un proceso de devolución externo.");
    if (venta.medioPago !== "efectivo" && !referencia.trim()) throw new Error("Registrá la referencia del reintegro confirmado al cliente.");
    if (venta.medioPago === "efectivo" && (await resumenCaja(turno, tx)).esperado < venta.total) throw new Error("No hay suficiente efectivo registrado para devolver esta venta.");
    const items = await tx.select().from(ventaItems).where(eq(ventaItems.ventaId, ventaId));
    if (!items.length) throw new Error("La venta no tiene productos para restituir.");
    await tx.insert(ventaDevoluciones).values({ ventaId, turnoId: turno.id, motivo: motivo.trim(), referencia: referencia.trim(), repuestoStock: reponerStock, usuario });
    if (reponerStock) for (const item of items) {
      await tx.insert(stockSucursal).values({ productoId: item.productoId, sucursalId, cantidad: item.cantidad })
        .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: sql`round(${stockSucursal.cantidad} + ${item.cantidad}, 3)` } });
      await tx.update(productos).set({ stock: sql`(select coalesce(sum(cantidad),0) from stock_sucursal where producto_id = ${item.productoId})` }).where(eq(productos.id, item.productoId));
    }
    if (venta.medioPago === "efectivo") await tx.insert(cajaMovimientos).values({ turnoId: turno.id, tipo: "retiro", monto: venta.total, motivo: `Devolución venta #${ventaId}: ${motivo.trim()}`, responsable: usuario });
    await tx.update(ventas).set({ estado: "devuelta" }).where(eq(ventas.id, ventaId));
    return { turnoId: turno.id, monto: venta.total };
  });
}

export async function cerrarCaja(sucursalId: number, turnoId: number, responsable: string, contado: number, observaciones: string, usuario = responsable, detalle = "{}") {
  validarMonto(contado);
  if (observaciones.length > 2000) throw new Error("Las observaciones no pueden superar 2000 caracteres.");
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió o ya está cerrada. Actualizá la pantalla.");
    exigirResponsable(turno, usuario, responsable);
    if (await traspasoPendiente(turnoId, tx)) throw new Error("La caja está en traspaso.");
    if (!turno.arqueoEn) throw new Error("Iniciá el arqueo antes de cerrar la caja.");
    const resumen = await resumenCaja(turno, tx);
    const diferencia = redondear(contado - resumen.esperado);
    await tx.update(cajaTurnos).set({ estado: "pendiente", cerradoPor: responsable, cerradoEn: new Date(), efectivoContado: contado, declaradoCierre: contado, detalleCierre: detalle, efectivoEsperado: resumen.esperado, diferencia, resumen: JSON.stringify(resumen.cobros), observaciones: observaciones.trim() }).where(eq(cajaTurnos.id, turnoId));
    return { contado };
  });
}
export async function rectificarCierre(sucursalId: number, turnoId: number, administrador: string, contado: number, motivo: string) {
  validarMonto(contado);
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá el motivo de la rectificación.");
  return transaccionCaja(async tx => {
    const turno = await cierrePendiente(sucursalId, tx);
    if (!turno || turno.id !== turnoId || turno.efectivoContado === null || turno.efectivoEsperado === null) throw new Error("El arqueo ya no admite rectificaciones.");
    await tx.insert(cajaRevisiones).values({ turnoId, administrador, contadoAnterior: turno.efectivoContado, contadoNuevo: contado, motivo: motivo.trim() });
    await tx.update(cajaTurnos).set({ efectivoContado: contado, diferencia: redondear(contado - turno.efectivoEsperado) }).where(eq(cajaTurnos.id, turnoId));
  });
}
export async function aprobarCierre(sucursalId: number, turnoId: number, administrador: string) {
  return transaccionCaja(async tx => {
    const turno = await cierrePendiente(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("El cierre ya fue revisado o cambió.");
    const aprobado = await tx.update(cajaTurnos).set({ estado: "cerrada", aprobadoPor: administrador, aprobadoEn: new Date() }).where(and(eq(cajaTurnos.id, turnoId), eq(cajaTurnos.estado, "pendiente")));
    if (!aprobado.rowsAffected) throw new Error("El cierre ya fue revisado.");
    if (turno.diferencia) await tx.insert(cajaSaldoMovimientos).values({ turnoId, tipo: "ajuste", monto: turno.diferencia, motivo: "Diferencia del arqueo aprobada", responsable: administrador });
  });
}
export async function iniciarTraspaso(sucursalId: number, turnoId: number, usuario: string, responsable: string, contado: number, detalle = "{}") {
  validarMonto(contado);
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió.");
    exigirResponsable(turno, usuario, responsable);
    if (turno.arqueoEn || await traspasoPendiente(turnoId, tx)) throw new Error("Ya hay un arqueo o traspaso en curso.");
    const esperado = (await resumenCaja(turno, tx)).esperado;
    await tx.insert(cajaTraspasos).values({ turnoId, saliente: responsable, salienteUsuario: usuario, contadoSalida: contado, detalleSalida: detalle, esperado });
  });
}
export async function recibirTraspaso(sucursalId: number, turnoId: number, usuario: string, responsable: string, contado: number, detalle = "{}") {
  validarMonto(contado);
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió.");
    const traspaso = await traspasoPendiente(turnoId, tx);
    if (!traspaso) throw new Error("No hay un traspaso pendiente.");
    if (traspaso.salienteUsuario === usuario) throw new Error("La recepción debe confirmarla otra persona.");
    const recibido = await tx.update(cajaTraspasos).set({ entrante: responsable, entranteUsuario: usuario, contadoEntrada: contado, detalleEntrada: detalle, estado: "recibido", recibidoEn: new Date() }).where(and(eq(cajaTraspasos.id, traspaso.id), eq(cajaTraspasos.estado, "pendiente")));
    if (!recibido.rowsAffected) throw new Error("El traspaso ya fue recibido.");
    await tx.update(cajaTurnos).set({ responsable, responsableUsuario: usuario }).where(eq(cajaTurnos.id, turnoId));
  });
}
export async function cancelarTraspaso(sucursalId: number, turnoId: number, administrador: string, motivo: string) {
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá el motivo de la cancelación.");
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno || turno.id !== turnoId) throw new Error("La caja cambió.");
    const traspaso = await traspasoPendiente(turnoId, tx);
    if (!traspaso) throw new Error("No hay un traspaso pendiente.");
    const cancelado = await tx.update(cajaTraspasos).set({ estado: "cancelado", canceladoPor: administrador, canceladoEn: new Date(), motivoCancelacion: motivo.trim() }).where(and(eq(cajaTraspasos.id, traspaso.id), eq(cajaTraspasos.estado, "pendiente")));
    if (!cancelado.rowsAffected) throw new Error("El traspaso ya cambió.");
  });
}
export type AjustePrecio = { tipo: "producto" | "total"; productoId?: number; precio?: number; actualizarStock?: boolean; nombrePromocion?: string; productoIds?: number[] };
export async function venderEnCaja(sucursalId: number, cajero: string, items: { productoId: number; cantidad: number }[], medioPago: string, opts?: { clienteId?: number | null; canal?: string; permitirSinStock?: boolean; efectivoRecibido?: number; ajustePrecio?: AjustePrecio; usuario?: string }) {
  if (!items.length || !["efectivo", "qr", "tarjeta"].includes(medioPago)) throw new Error("Revisá los productos y el medio de pago.");
  const ajuste = opts?.ajustePrecio;
  if (ajuste && opts?.canal === "online") throw new Error("El cambio de precio solo está disponible en Caja.");
  const cantidades = new Map<number, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.productoId) || !Number.isFinite(item.cantidad) || item.cantidad <= 0) throw new Error("Revisá las cantidades del pedido.");
    cantidades.set(item.productoId, redondearCantidad((cantidades.get(item.productoId) ?? 0) + item.cantidad));
  }
  return transaccionCaja(async tx => {
    const turno = await cajaAbierta(sucursalId, tx);
    if (!turno) throw new Error("Abrí la caja de esta sucursal antes de cobrar.");
    exigirResponsable(turno, opts?.usuario ?? cajero, cajero);
    if (await traspasoPendiente(turno.id, tx)) throw new Error("La caja está en traspaso.");
    if (turno.arqueoEn) throw new Error("La caja está en arqueo. No se pueden registrar ventas.");
    const lineas: { productoId: number; cantidad: number; precioUnit: number; nombre: string; precioAnterior: number }[] = [];
    let total = 0;
    for (const [productoId, cantidad] of cantidades) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, productoId));
      if (!p || !p.activo) throw new Error("Hay un producto que ya no está disponible.");
      if (!cantidadValida(cantidad, p.unidadMedida as "unidad" | "kg")) throw new Error(`Cantidad inválida de "${p.nombre}". Usá unidades enteras o kg con hasta tres decimales.`);
      validarMonto(p.precioVenta);
      const permitirSinStock = opts?.permitirSinStock === true && opts.canal !== "online";
      if (permitirSinStock) {
        await tx.insert(stockSucursal).values({ productoId, sucursalId, cantidad: -cantidad })
          .onConflictDoUpdate({ target: [stockSucursal.productoId, stockSucursal.sucursalId], set: { cantidad: sql`round(${stockSucursal.cantidad} - ${cantidad}, 3)` } });
      } else {
        const r = await tx.update(stockSucursal).set({ cantidad: sql`round(${stockSucursal.cantidad} - ${cantidad}, 3)` }).where(and(eq(stockSucursal.productoId, productoId), eq(stockSucursal.sucursalId, sucursalId), sql`${stockSucursal.cantidad} >= ${cantidad}`));
        if (!r.rowsAffected) throw new Error(`Sin stock suficiente de "${p.nombre}".`);
      }
      await tx.update(productos).set({ stock: sql`(select coalesce(sum(cantidad),0) from stock_sucursal where producto_id = ${productoId})` }).where(eq(productos.id, productoId));
      lineas.push({ productoId, cantidad, precioUnit: p.precioVenta, precioAnterior: p.precioVenta, nombre: p.nombre });
      total += p.precioVenta * cantidad;
    }
    total = redondear(total);
    const activas = await tx.select().from(promociones).where(eq(promociones.activa, true));
    const mejor = activas.map(p => cotizarPromocion(p, lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad, precio: l.precioUnit })))).filter((q): q is NonNullable<typeof q> => q !== null).sort((a, b) => b.discount - a.discount)[0];
    if (mejor?.discount) total = mejor.total;
    const totalAnterior = total;
    let detalleCambio: string | null = null;
    let promoNueva: { nombre: string; ids: number[]; cantidades: Record<string, number>; precioFijo: number; alcance: string } | null = null;
    if (ajuste) {
      if (ajuste.tipo !== "producto" && ajuste.tipo !== "total") throw new Error("Tipo de cambio de precio inválido.");
      validarMonto(ajuste.precio ?? NaN, true);
      if (ajuste.tipo === "producto") {
        const linea = lineas.find(l => l.productoId === ajuste.productoId);
        if (!linea) throw new Error("El producto a modificar no está en el pedido.");
        if (linea.precioUnit === ajuste.precio) throw new Error("El nuevo precio coincide con el actual.");
        linea.precioUnit = ajuste.precio!;
        total = redondear(lineas.reduce((sum, l) => sum + l.precioUnit * l.cantidad, 0));
        if (ajuste.actualizarStock) {
          await tx.update(productos).set({ precioVenta: ajuste.precio! }).where(eq(productos.id, linea.productoId));
          detalleCambio = JSON.stringify({ producto: linea.nombre, productoId: linea.productoId, anterior: linea.precioAnterior, nuevo: ajuste.precio, destino: "stock" });
        } else {
          const nombre = ajuste.nombrePromocion?.trim() ?? "";
          if (!nombre || nombre.length > 100 || ajuste.precio! >= linea.precioAnterior) throw new Error("Indicá un nombre de promoción y un precio menor al original.");
          promoNueva = { nombre, ids: [linea.productoId], cantidades: { [linea.productoId]: linea.cantidad }, precioFijo: redondear(ajuste.precio! * linea.cantidad), alcance: "productos" };
          detalleCambio = JSON.stringify({ producto: linea.nombre, productoId: linea.productoId, anterior: linea.precioAnterior, nuevo: ajuste.precio, destino: "promocion", promocion: nombre });
        }
      } else {
        const ids = [...new Set(ajuste.productoIds ?? [])];
        const nombre = ajuste.nombrePromocion?.trim() ?? "";
        if (!nombre || nombre.length > 100 || ids.length === 0 || ids.some(id => !lineas.some(l => l.productoId === id)) || ajuste.precio! >= total) throw new Error("Indicá nombre, productos del carrito y un total promocional menor al original.");
        const subtotalFuera = redondear(lineas.filter(l => !ids.includes(l.productoId)).reduce((sum, l) => sum + l.precioUnit * l.cantidad, 0));
        const precioPromocion = redondear(ajuste.precio! - subtotalFuera);
        if (precioPromocion <= 0) throw new Error("El nuevo total debe cubrir los productos que no forman parte de la promoción.");
        total = ajuste.precio!;
        promoNueva = { nombre, ids, cantidades: Object.fromEntries(lineas.filter(l => ids.includes(l.productoId)).map(l => [l.productoId, l.cantidad])), precioFijo: precioPromocion, alcance: "productos" };
        detalleCambio = JSON.stringify({ destino: "promocion", promocion: nombre, productos: lineas.filter(l => ids.includes(l.productoId)).map(l => ({ id: l.productoId, nombre: l.nombre, cantidad: l.cantidad })) });
      }
    }
    const efectivoRecibido = medioPago === "efectivo" && opts?.efectivoRecibido !== undefined ? opts.efectivoRecibido : null;
    if (efectivoRecibido !== null) {
      validarMonto(efectivoRecibido);
      if (efectivoRecibido < total) throw new Error("El efectivo recibido no alcanza para cubrir la venta.");
    }
    const vuelto = efectivoRecibido === null ? null : redondear(efectivoRecibido - total);
    const efectivoAntes = (await resumenCaja(turno, tx)).esperado;
    // El cliente entrega efectivo y recibe vuelto: en el cajón queda el importe de la venta.
    const efectivoDespues = redondear(efectivoAntes + (medioPago === "efectivo" ? total : 0));
    const [venta] = await tx.insert(ventas).values({ sucursalId, cajaTurnoId: turno.id, cajero, total, medioPago, efectivoRecibido, vuelto, efectivoAntes, efectivoDespues, clienteId: opts?.clienteId ?? null, canal: opts?.canal === "online" ? "online" : "local", estado: "completada" }).returning({ id: ventas.id });
    await tx.insert(ventaItems).values(lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad, precioUnit: l.precioUnit, ventaId: venta.id })));
    if (promoNueva) await tx.insert(promociones).values({ nombre: promoNueva.nombre, tipo: "precio_fijo", activa: true, productoIds: JSON.stringify(promoNueva.ids), cantidades: JSON.stringify(promoNueva.cantidades), precioFijo: promoNueva.precioFijo, alcance: promoNueva.alcance, modo: "continua" });
    if (ajuste && detalleCambio) await tx.insert(cambiosPrecio).values({ ventaId: venta.id, sucursalId, usuario: cajero, medioPago, tipo: ajuste.tipo, detalle: detalleCambio, totalAnterior, totalNuevo: total });
    return { ventaId: venta.id, total, efectivoRecibido, vuelto, efectivoAntes, efectivoDespues };
  });
}


export async function saldoUltimoCierre(sucursalId: number, executor: CajaTx | typeof db = db) {
  const [turno] = await executor.select().from(cajaTurnos).where(and(eq(cajaTurnos.sucursalId, sucursalId), eq(cajaTurnos.estado, "cerrada"))).orderBy(desc(cajaTurnos.id)).limit(1);
  if (!turno) return null;
  const extracciones = await executor.select().from(cajaExtracciones).where(and(eq(cajaExtracciones.turnoId, turno.id), eq(cajaExtracciones.estadoCaja, "cerrada"))).orderBy(cajaExtracciones.id);
  const movimientosSaldo = await executor.select().from(cajaSaldoMovimientos).where(eq(cajaSaldoMovimientos.turnoId, turno.id));
  const ajustes = movimientosSaldo.filter(m => m.tipo === "ajuste");
  const contado = ajustes.length && turno.efectivoEsperado !== null
    ? redondear(turno.efectivoEsperado + ajustes.reduce((total, m) => total + m.monto, 0))
    : turno.efectivoContado ?? 0;
  const extraido = redondear(extracciones.reduce((total, e) => total + e.monto, 0));
  const ingresos = movimientosSaldo.filter(m => m.tipo === "ingreso");
  const ingresado = redondear(ingresos.reduce((total, m) => total + m.monto, 0));
  return { turnoId: turno.id, contado, extraido, ingresado, disponible: redondear(contado - extraido + ingresado) };
}
export async function ingresarCambioCerrada(sucursalId: number, turnoId: number, administrador: string, monto: number, motivo: string) {
  validarMonto(monto, true);
  if (!motivo.trim() || motivo.length > 500) throw new Error("Indicá el motivo del ingreso.");
  return transaccionCaja(async tx => {
    if (await cajaAbierta(sucursalId, tx) || await cierrePendiente(sucursalId, tx)) throw new Error("La caja debe estar cerrada y aprobada.");
    const anterior = await saldoUltimoCierre(sucursalId, tx);
    if (!anterior || anterior.turnoId !== turnoId) throw new Error("El saldo cambió. Actualizá la pantalla.");
    await tx.insert(cajaSaldoMovimientos).values({ turnoId, tipo: "ingreso", monto, motivo: motivo.trim(), responsable: administrador });
  });
}
export async function extraerEfectivo(datos: { sucursalId: number; turnoId: number; usuario: string; responsable: string; clave: string; monto: number; saldoRestante: number; motivo: string; entregadoA: string; solicitudId: string }) {
  validarMonto(datos.monto, true);
  validarMonto(datos.saldoRestante);
  if (!datos.motivo?.trim() || datos.motivo.length > 500) throw new Error("Indicá un motivo de hasta 500 caracteres.");
  if (!datos.entregadoA?.trim() || datos.entregadoA.length > 100) throw new Error("Indicá quién recibe el efectivo (hasta 100 caracteres).");
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
      if (repetida.sucursalId !== datos.sucursalId || repetida.turnoId !== datos.turnoId || repetida.responsable !== datos.responsable || repetida.monto !== datos.monto || repetida.saldoRestante !== datos.saldoRestante || repetida.motivo !== datos.motivo.trim() || repetida.entregadoA !== datos.entregadoA.trim()) throw new Error("La solicitud ya fue usada con otros datos.");
      return { ok: true, error: "" };
    }
    const abierta = await cajaAbierta(datos.sucursalId, tx);
    if (abierta?.arqueoEn) throw new Error("El arqueo está en curso. Cancelalo antes de extraer efectivo.");
    if (abierta && await traspasoPendiente(abierta.id, tx)) throw new Error("La caja está en traspaso.");
    if (!abierta && await cierrePendiente(datos.sucursalId, tx)) throw new Error("El cierre espera aprobación.");
    const anterior = abierta ? null : await saldoUltimoCierre(datos.sucursalId, tx);
    if ((abierta?.id ?? anterior?.turnoId) !== datos.turnoId) throw new Error("La caja cambió. Actualizá la pantalla antes de extraer.");
    const disponible = abierta ? (await resumenCaja(abierta, tx)).esperado : anterior?.disponible ?? 0;
    if (datos.monto > disponible) throw new Error("La extracción supera el efectivo disponible.");
    if (redondear(disponible - datos.monto) !== datos.saldoRestante) throw new Error("El saldo que queda en caja debe coincidir con el efectivo disponible menos la extracción. Actualizá la pantalla si hubo otros movimientos.");
    const estadoCaja = abierta ? "abierta" : "cerrada";
    await tx.insert(cajaExtracciones).values({ solicitudId: datos.solicitudId, sucursalId: datos.sucursalId, turnoId: datos.turnoId, estadoCaja, monto: datos.monto, saldoRestante: datos.saldoRestante, motivo: datos.motivo.trim(), entregadoA: datos.entregadoA.trim(), responsable: datos.responsable });
    if (abierta) await tx.insert(cajaMovimientos).values({ turnoId: abierta.id, tipo: "retiro", monto: datos.monto, motivo: `Extracción: ${datos.motivo.trim()}`, responsable: datos.responsable });
    return { ok: true, error: "" };
  });
}



