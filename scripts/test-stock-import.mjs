import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";

if (!process.env.TURSO_DATABASE_URL?.startsWith("file:stock-import-test-")) throw new Error("Se requiere una base temporal.");
const migration = spawnSync(process.execPath, ["--import", "tsx", "src/db/migrate.ts"], { env: process.env, encoding: "utf8" });
assert.equal(migration.status, 0, migration.stderr || migration.stdout);
const { db, client, productos, compras, compraLineas, compraHistorial, stockSucursal, diferenciasPrecios, compraItems, stockConfiguracion, stockReglas } = await import("../src/db/index.ts");
const { extraerDocumentoStock, leerTablaStock } = await import("../src/lib/documento-stock.ts");
const { diferenciaCosto } = await import("../src/lib/precios-stock.ts");
const { confirmarStockEnTransaccion } = await import("../src/lib/confirmar-stock.ts");
const { stockDespues } = await import("../src/lib/cantidades.ts");
const { clasificarItem } = await import("../src/lib/matching.ts");
const { eliminarCompraEnTransaccion } = await import("../src/lib/eliminar-compra.ts");

try {
  const csv = new File(['Nombre;Código;Cantidad;Costo unitario\n"Alfajor; Milka";00123;5;"1.234,56"'], "ticket.csv");
  const lectura = await extraerDocumentoStock(csv);
  assert.equal(lectura.items[0].codigo, "00123");
  assert.equal(lectura.items[0].precioUnit, 1234.56);
  assert.equal(lectura.items[0].descripcion, "Alfajor; Milka");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");
  sheet.addRows([["Nombre", "Código", "Cantidad", "Costo unitario"], ["Milka", "00123", 2, 110]]);
  const xlsx = await extraerDocumentoStock(new File([await workbook.xlsx.writeBuffer()], "ticket.xlsx"));
  assert.equal(xlsx.items[0].precioUnit, 110);
  assert.equal(xlsx.items[0].codigo, "00123");
  const sinCosto = leerTablaStock([["Nombre", "Stock actual"], ["Sin costo", "3"]]);
  assert.equal(sinCosto.items[0].precioUnit, 0);
  const costoVacio = leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Vacío", "2", ""], ["Cero", "1", "0"]]);
  assert.deepEqual(costoVacio.items.map(i => i.precioUnit), [0, 0]);
  assert.throws(() => leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Inválido", "1", "-10"]]));
  assert.throws(() => leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Inválido", "1", "abc"]]));
  assert.equal(diferenciaCosto(60, 0, 180, 3).sugerido, null);
  assert.throws(() => leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Milka", "-2", "100"]]));
  const fraccion = leerTablaStock([["Nombre", "Cantidad", "Costo"], ["Queso", "1.5", "100"]]);
  assert.equal(fraccion.items[0].cantidad, 1.5);
  assert.equal(fraccion.items[0].unidadMedida, "kg");
  const inventario = leerTablaStock([["Producto", "Stock actual", "Precio de costo"], ["Cero", "0", "100"], ["Deuda", "-2", "100"], ["Queso", "0,375", "100"]]);
  assert.deepEqual(inventario.items.map(i => i.cantidad), [0, -2, 0.375]);
  assert.equal(inventario.omitidos, 0);
  assert.ok(inventario.items.every(i => i.modoStock === "fijar"));
  await assert.rejects(() => extraerDocumentoStock(new File(["texto"], "ticket.doc")), /Formato no soportado/);
  assert.equal(diferenciaCosto(0, 100, 200).sugerido, null);

  const sucursalId = Number((await client.execute("SELECT id FROM sucursales LIMIT 1")).rows[0].id);
  const [producto] = await db.insert(productos).values({ sku: "00123", nombre: "Milka", stock: 10, precioCompra: 100, precioVenta: 200 }).returning();
  const item = { descripcion: "Milka", codigo: "OTRO-SKU", cantidad: 1, precioUnit: 100 };
  assert.equal(clasificarItem(item, [producto]).estado, "nuevo");
  assert.equal(clasificarItem(item, [producto]).productoId, null);
  assert.equal(clasificarItem({ ...item, codigo: "00123" }, [producto]).productoId, producto.id);
  assert.equal(clasificarItem({ ...item, codigo: "" }, [producto]).productoId, producto.id);
  assert.equal(clasificarItem({ ...item, codigo: "A B" }, [{ ...producto, sku: "A-B" }]).estado, "nuevo");
  assert.equal(stockDespues(14, -2, "fijar"), 0);
  assert.equal(stockDespues(14, 0.375, "fijar"), 0.375);
  await db.insert(stockSucursal).values({ productoId: producto.id, sucursalId, cantidad: 10 });
  const [compra] = await db.insert(compras).values({ proveedor: "Prueba", sucursalId }).returning();
  const usuario = { id: 0, nombre: "Tester" };
  const agregar = async costo => (await db.insert(compraLineas).values({ compraId: compra.id, productoId: producto.id, descripcion: "Milka", codigo: "00123", cantidad: 2, precioUnit: costo, estado: "match" }).returning())[0];
  const impacto = (linea, costo, venta, stock) => ({ lineaId: linea.id, nombre: "Milka", codigo: "00123", stockAnterior: stock, stockNuevo: stock + 2, costoAnterior: costo, costoNuevo: linea.precioUnit, ventaAnterior: venta, ...diferenciaCosto(costo, linea.precioUnit, venta) });
  const aplicar = (pendientes, impactos, revalorizar = []) => confirmarStockEnTransaccion({ compraId: compra.id, pendientes, sucursalId, usuario, opciones: { actualizarCosto: true, impactos, revalorizar } });
  const primera = await agregar(110);
  await aplicar([primera], [impacto(primera, 100, 200, 10)], [primera.id]);
  let [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 12);
  assert.equal(actual.precioCompra, 110);
  assert.equal(actual.precioVenta, 220);
  let historial = await db.select().from(diferenciasPrecios);
  assert.equal(historial.length, 1);
  assert.ok(Math.abs(historial[0].porcentaje - 10) < 1e-8);
  assert.equal(historial[0].revalorizado, true);
  await assert.rejects(() => aplicar([primera], [impacto(primera, 100, 200, 10)]), /borrador cambió/);

  const segunda = await agregar(99);
  await assert.rejects(() => aplicar([segunda], [impacto(segunda, 100, 220, 12)]), /precios cambiaron/);
  assert.equal((await db.select().from(compraItems)).length, 1);
  await aplicar([segunda], [impacto(segunda, 110, 220, 12)]);
  [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 14);
  assert.equal(actual.precioVenta, 220);
  historial = await db.select().from(diferenciasPrecios);
  assert.equal(historial.length, 2);
  assert.ok(Math.abs(historial[1].porcentaje + 10) < 1e-8);
  assert.equal(historial[1].ventaSugerida, 198);
  assert.equal(historial[1].revalorizado, false);

  const tercera = await agregar(120);
  const [otro] = await db.insert(productos).values({ sku: "X", nombre: "Otro", precioCompra: 1, precioVenta: 2 }).returning();
  const [fantasma] = await db.insert(compraLineas).values({ compraId: compra.id, productoId: otro.id, descripcion: "No existe", codigo: "X", cantidad: 1, precioUnit: 1, estado: "match" }).returning();
  await assert.rejects(() => aplicar([tercera, fantasma], [impacto(tercera, 99, 220, 14), { lineaId: fantasma.id, costoNuevo: 1, stockAnterior: 0, stockNuevo: 1 }]), /precios cambiaron/);
  [actual] = await db.select().from(productos).where(eq(productos.id, producto.id));
  assert.equal(actual.stock, 14);
  assert.equal(actual.precioCompra, 99);
  assert.equal((await db.select().from(diferenciasPrecios)).length, 2);
  const { unificarBorrador } = await import("../src/lib/unificar-borrador.ts");
  const [duplicada] = await db.insert(compras).values({ proveedor: "Duplicados", sucursalId }).returning();
  const repetidos = await db.insert(compraLineas).values([
    { compraId: duplicada.id, descripcion: "LECHE ENTERA", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
    { compraId: duplicada.id, descripcion: "LECHE ENTERA (12)", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
    { compraId: duplicada.id, descripcion: "LECHE ENTERA", codigo: "LECHE-TEST", cantidad: 12, precioUnit: 1795, precioVenta: 3590, estado: "nuevo", confirmado: true },
  ]).returning();
  assert.equal(await unificarBorrador(duplicada.id), 2);
  const agrupadas = await db.select().from(compraLineas).where(eq(compraLineas.compraId, duplicada.id));
  assert.equal(agrupadas.length, 1); assert.equal(agrupadas[0].cantidad, 36);
  await confirmarStockEnTransaccion({ compraId: duplicada.id, pendientes: agrupadas, sucursalId, usuario, opciones: { impactos: [{ lineaId: agrupadas[0].id, nombre: agrupadas[0].descripcion, codigo: "LECHE-TEST", stockAnterior: 0, stockNuevo: 36, costoAnterior: 0, costoNuevo: 1795, ventaAnterior: 0, porcentaje: null, sugerido: null }] } });
  const leche = await db.select().from(productos).where(eq(productos.sku, "LECHE-TEST"));
  assert.equal(leche.length, 1); assert.equal(leche[0].stock, 36); assert.equal(leche[0].precioVenta, 3590);
  assert.equal(await unificarBorrador(duplicada.id), 0);
  const [conflicto] = await db.insert(compras).values({ proveedor: "Conflicto", sucursalId }).returning();
  await db.insert(compraLineas).values([
    { compraId: conflicto.id, descripcion: "A", codigo: "CONFLICTO", cantidad: 1, precioUnit: 100, precioVenta: 200 },
    { compraId: conflicto.id, descripcion: "A", codigo: "CONFLICTO", cantidad: 1, precioUnit: 110, precioVenta: 200 },
  ]);
  await assert.rejects(() => unificarBorrador(conflicto.id), /precios distintos/);
  assert.equal((await db.select().from(compraLineas).where(eq(compraLineas.compraId, conflicto.id))).length, 2);
  const [inventarioCompra] = await db.insert(compras).values({ proveedor: "Inventario", sucursalId }).returning();
  const saldos = await db.insert(compraLineas).values([
    { compraId: inventarioCompra.id, productoId: producto.id, descripcion: "Milka", codigo: "00123", cantidad: -2, modoStock: "fijar", precioUnit: 100, estado: "match" },
    { compraId: inventarioCompra.id, descripcion: "Sin existencias", codigo: "CERO", cantidad: 0, modoStock: "fijar", precioUnit: 100, precioVenta: 200, confirmado: true, estado: "nuevo" },
    { compraId: inventarioCompra.id, descripcion: "Queso a peso", codigo: "PESO", cantidad: 0.375, modoStock: "fijar", unidadMedida: "kg", precioUnit: 100, precioVenta: 200, confirmado: true, estado: "nuevo" },
    { compraId: inventarioCompra.id, descripcion: "Nuevo negativo", codigo: "NEGATIVO", cantidad: -3, modoStock: "fijar", precioUnit: 100, precioVenta: 200, estado: "nuevo" },
  ]).returning();
  const vistas = saldos.map((l, i) => ({
    lineaId: l.id, nombre: l.descripcion, codigo: l.codigo,
    stockAnterior: i === 0 ? 14 : 0, stockNuevo: Math.max(0, l.cantidad),
    costoAnterior: i === 0 ? 99 : 0, costoNuevo: 100,
    ventaAnterior: i === 0 ? 220 : 0, ventaNueva: i === 0 ? 220 : 200,
    ...diferenciaCosto(i === 0 ? 99 : 0, 100, i === 0 ? 220 : 0),
  }));
  await assert.rejects(() => confirmarStockEnTransaccion({ compraId: inventarioCompra.id, pendientes: saldos.slice(0, 2), sucursalId, usuario, opciones: { impactos: vistas.map(v => v.lineaId === saldos[0].id ? { ...v, stockNuevo: -2 } : v) } }), /borrador cambió/);
  await confirmarStockEnTransaccion({ compraId: inventarioCompra.id, pendientes: saldos.slice(0, 2), sucursalId, usuario, opciones: { impactos: vistas } });
  assert.equal((await db.select().from(compraLineas).where(eq(compraLineas.compraId, inventarioCompra.id))).filter(l => !l.aplicado).length, 2);
  await confirmarStockEnTransaccion({ compraId: inventarioCompra.id, pendientes: saldos.slice(2), sucursalId, usuario, opciones: { impactos: vistas } });
  assert.equal((await db.select().from(productos).where(eq(productos.id, producto.id)))[0].stock, 0);
  const [negativoNuevo] = await db.select().from(productos).where(eq(productos.sku, "NEGATIVO"));
  assert.equal(negativoNuevo.stock, 0);
  assert.equal((await db.select().from(stockSucursal).where(eq(stockSucursal.productoId, negativoNuevo.id)))[0].cantidad, 0);
  assert.equal((await db.select().from(productos).where(eq(productos.sku, "CERO")))[0].stock, 0);
  const [porPeso] = await db.select().from(productos).where(eq(productos.sku, "PESO"));
  assert.equal(porPeso.stock, 0.375); assert.equal(porPeso.unidadMedida, "kg");
  const movimientosInventario = await db.select().from(compraItems).where(eq(compraItems.compraId, inventarioCompra.id));
  assert.deepEqual(movimientosInventario.map(i => i.cantidad), [-14, 0, 0.375, 0]);
  const { precioDesdeCosto, validarMultiplicador } = await import("../src/lib/reglas-stock.ts");
  assert.equal(precioDesdeCosto(123.45,1.8),222.21);
  for (const factor of [0,-1,NaN,Infinity,1001,1.12345]) assert.throws(()=>validarMultiplicador(factor));
  await db.insert(stockConfiguracion).values({id:1,multiplicador:2.5,actualizadoPor:"admin"});
  const [auto] = await db.insert(productos).values({sku:"AUTO",nombre:"Automático",precioCompra:50,precioVenta:77,stock:2,stockMinimo:100}).returning();
  await db.insert(stockSucursal).values({productoId:auto.id,sucursalId,cantidad:2});
  const [autoCompra] = await db.insert(compras).values({proveedor:"Reglas",sucursalId}).returning();
  const autoLinea = async costo => (await db.insert(compraLineas).values({compraId:autoCompra.id,productoId:auto.id,descripcion:auto.nombre,codigo:auto.sku,cantidad:1,precioUnit:costo,estado:"match"}).returning())[0];
  const vistaAuto=(linea,costo,venta,stock,factor)=>({lineaId:linea.id,nombre:auto.nombre,codigo:auto.sku,stockAnterior:stock,stockNuevo:stock+1,costoAnterior:costo,costoNuevo:linea.precioUnit,ventaAnterior:venta,multiplicador:factor,ventaNueva:precioDesdeCosto(linea.precioUnit,factor),...diferenciaCosto(costo,linea.precioUnit,venta,factor)});
  const confirmarAuto=(linea,vista)=>confirmarStockEnTransaccion({compraId:autoCompra.id,pendientes:[linea],sucursalId,usuario,opciones:{actualizarCosto:false,impactos:[vista]}});
  const a1=await autoLinea(60);
  await confirmarAuto(a1,vistaAuto(a1,50,77,2,2.5));
  let [a]=await db.select().from(productos).where(eq(productos.id,auto.id));
  assert.equal(a.precioVenta,150); assert.equal(a.precioCompra,60);
  await db.insert(stockReglas).values({productoId:auto.id,multiplicador:3,alertaActiva:false,actualizadoPor:"admin"});
  const {getResumen}=await import("../src/lib/queries.ts");
  assert.equal((await getResumen(sucursalId)).bajoStock.some(p=>p.id===auto.id),false);
  const a2=await autoLinea(60);
  const antesConfig= vistaAuto(a2,60,150,3,2.5);
  await assert.rejects(()=>confirmarAuto(a2,antesConfig),/multiplicador cambió/);
  await confirmarAuto(a2,vistaAuto(a2,60,150,3,3));
  [a]=await db.select().from(productos).where(eq(productos.id,auto.id));
  assert.equal(a.precioVenta,180); assert.equal(a.stock,4);
  await db.update(stockReglas).set({alertaActiva:true}).where(eq(stockReglas.productoId,auto.id));
  assert.equal((await getResumen(sucursalId)).bajoStock.some(p=>p.id===auto.id),true);
  const [nueva]=await db.insert(compraLineas).values({compraId:autoCompra.id,descripcion:"Nuevo automático",codigo:"AUTO-NUEVO",cantidad:1,precioUnit:40,precioVenta:999,confirmado:true,estado:"nuevo"}).returning();
  const nuevaVista={lineaId:nueva.id,nombre:nueva.descripcion,codigo:nueva.codigo,stockAnterior:0,stockNuevo:1,costoAnterior:0,costoNuevo:40,ventaAnterior:0,multiplicador:2.5,ventaNueva:100,...diferenciaCosto(0,40,0,2.5)};
  await confirmarAuto(nueva,nuevaVista);
  const [n]=await db.select().from(productos).where(eq(productos.sku,"AUTO-NUEVO"));
  assert.equal(n.precioVenta,100);
  const cero=await autoLinea(0);
  const vistaCero = { ...vistaAuto(cero,60,180,4,3), ventaNueva: 180 };
  await confirmarAuto(cero,vistaCero);
  const [sinCambioPrecio] = await db.select().from(productos).where(eq(productos.id,auto.id));
  assert.equal(sinCambioPrecio.stock,5);
  assert.equal(sinCambioPrecio.precioCompra,60);
  assert.equal(sinCambioPrecio.precioVenta,180);
  const [nuevoSinCosto] = await db.insert(compraLineas).values({compraId:autoCompra.id,descripcion:"Sin costo conocido",codigo:"SIN-COSTO",cantidad:3,precioUnit:0,precioVenta:250,estado:"nuevo"}).returning();
  await confirmarAuto(nuevoSinCosto, {lineaId:nuevoSinCosto.id,nombre:nuevoSinCosto.descripcion,codigo:nuevoSinCosto.codigo,stockAnterior:0,stockNuevo:3,costoAnterior:0,costoNuevo:0,ventaAnterior:0,multiplicador:2.5,ventaNueva:250,...diferenciaCosto(0,0,0,2.5)});
  const [sinCostoCreado] = await db.select().from(productos).where(eq(productos.sku,"SIN-COSTO"));
  assert.equal(sinCostoCreado.stock,3);
  assert.equal(sinCostoCreado.precioCompra,0);
  assert.equal(sinCostoCreado.precioVenta,250);
  // Eliminar una compra aplicada con un producto archivado y un borrador
  // parcialmente eliminado no altera el inventario ni otras compras.
  const [paraBorrar] = await db.insert(compras).values({proveedor:"Eliminar aplicada",sucursalId}).returning();
  const [archivado] = await db.insert(productos).values({sku:"ARCHIVADO",nombre:"Eliminado individualmente",activo:false,stock:0}).returning();
  await db.insert(compraItems).values([
    {compraId:paraBorrar.id,productoId:auto.id,cantidad:2,precioUnit:60},
    {compraId:paraBorrar.id,productoId:archivado.id,cantidad:1,precioUnit:0},
  ]);
  const borradorEliminar = await db.insert(compraLineas).values([
    {compraId:paraBorrar.id,productoId:auto.id,descripcion:auto.nombre,aplicado:true},
    {compraId:paraBorrar.id,descripcion:"Pendiente"},
  ]).returning();
  await db.delete(compraLineas).where(eq(compraLineas.id,borradorEliminar[1].id));
  await db.insert(compraHistorial).values({compraId:paraBorrar.id,campo:"Carga al stock"});
  await db.insert(diferenciasPrecios).values({compraId:paraBorrar.id,productoId:auto.id,nombre:auto.nombre,codigo:auto.sku,costoAnterior:50,costoNuevo:60,porcentaje:20,ventaAnterior:150,ventaNueva:180,usuarioNombre:"Tester"});
  const stockAntesBorrar = await db.select().from(stockSucursal);
  const productosAntesBorrar = await db.select().from(productos);
  const otrasCompras = await db.select().from(compraItems).where(eq(compraItems.compraId,autoCompra.id));
  await client.execute(`CREATE TRIGGER impedir_eliminacion_prueba BEFORE DELETE ON compras WHEN OLD.id = ${paraBorrar.id} BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END`);
  await assert.rejects(()=>eliminarCompraEnTransaccion(paraBorrar.id));
  assert.equal((await db.select().from(compraItems).where(eq(compraItems.compraId,paraBorrar.id))).length,2);
  assert.equal((await db.select().from(compraLineas).where(eq(compraLineas.compraId,paraBorrar.id))).length,1);
  assert.equal((await db.select().from(compraHistorial).where(eq(compraHistorial.compraId,paraBorrar.id))).length,1);
  assert.equal((await db.select().from(diferenciasPrecios).where(eq(diferenciasPrecios.compraId,paraBorrar.id))).length,1);
  await client.execute("DROP TRIGGER impedir_eliminacion_prueba");
  await eliminarCompraEnTransaccion(paraBorrar.id);
  for (const tabla of [compraItems,compraLineas,compraHistorial,diferenciasPrecios]) assert.equal((await db.select().from(tabla).where(eq(tabla.compraId,paraBorrar.id))).length,0);
  assert.equal((await db.select().from(compras).where(eq(compras.id,paraBorrar.id))).length,0);
  assert.deepEqual(await db.select().from(stockSucursal),stockAntesBorrar);
  assert.deepEqual(await db.select().from(productos),productosAntesBorrar);
  assert.deepEqual(await db.select().from(compraItems).where(eq(compraItems.compraId,autoCompra.id)),otrasCompras);
  assert.equal(await eliminarCompraEnTransaccion(paraBorrar.id),null);
  const [vacia] = await db.insert(compras).values({proveedor:"Borrador vacío",sucursalId}).returning();
  await eliminarCompraEnTransaccion(vacia.id);
  assert.equal((await db.select().from(compras).where(eq(compras.id,vacia.id))).length,0);
  console.log("Eliminación de compras: aplicada, producto archivado, filas eliminadas, dependencias, rollback, reintentos y conservación del stock OK.");
  console.log("Reglas: costo × multiplicador general, prioridad por producto, reglas obsoletas, costo cero, alertas activas/desactivadas y productos nuevos OK.");  console.log("Duplicados: un solo producto, suma de unidades, venta costo × 2 y rollback de precios incompatibles OK.");
  console.log("Stock: CSV/XLSX, códigos, validación, subas/bajas, margen, revalorización, idempotencia, precios obsoletos y rollback OK.");
} finally { await client.close(); }
