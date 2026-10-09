import assert from 'node:assert/strict';
if (!/^file:caja-test-[a-f0-9-]+\.db$/.test(process.env.TURSO_DATABASE_URL ?? "")) throw new Error("Usá pnpm test:caja: requiere una base temporal aislada.");


const { db, client, sucursales, productos, stockSucursal, ventas, cajaSeguridad, cajaExtracciones, cajaIntentos } = await import('../src/db/index.ts');
const { cajaDDL } = await import('../src/db/caja-ddl.ts');
const { abrirCaja, cerrarCaja, moverEfectivo, venderEnCaja, resumenCaja, validarMonto, extraerEfectivo, saldoUltimoCierre } = await import('../src/lib/caja.ts');
const { hashClaveAdministrador } = await import('../src/lib/clave-admin.ts');
const { randomUUID } = await import('node:crypto');
const { eq } = await import('drizzle-orm');
const extraer = (turnoId, monto, clave = 'secreta123', usuario = 'ana', solicitudId = randomUUID(), sucursalId = 1) => extraerEfectivo({ sucursalId, turnoId, monto, clave, usuario, responsable: usuario, motivo: 'Retiro autorizado', solicitudId });
try {
  await client.executeMultiple(`CREATE TABLE sucursales(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, direccion TEXT DEFAULT '', telefono TEXT DEFAULT '', activo INTEGER DEFAULT 1, orden INTEGER DEFAULT 0, creado_en INTEGER);
CREATE TABLE productos(id INTEGER PRIMARY KEY, sku TEXT, nombre TEXT, descripcion TEXT, categoria TEXT, precio_venta REAL, precio_compra REAL, stock INTEGER, stock_minimo INTEGER, imagen TEXT, publicado INTEGER, descripcion_web TEXT, creado_en INTEGER);
CREATE TABLE stock_sucursal(id INTEGER PRIMARY KEY, producto_id INTEGER, sucursal_id INTEGER, cantidad INTEGER);
CREATE TABLE ventas(id INTEGER PRIMARY KEY, cliente_id INTEGER, sucursal_id INTEGER, caja_turno_id INTEGER, cajero TEXT, total REAL, estado TEXT, canal TEXT, medio_pago TEXT, referencia TEXT, facturada INTEGER, fecha INTEGER);
CREATE TABLE venta_items(id INTEGER PRIMARY KEY, venta_id INTEGER, producto_id INTEGER, cantidad INTEGER, precio_unit REAL);`);
  for (const ddl of cajaDDL) await client.execute(ddl);
  await db.insert(sucursales).values([{id:1,nombre:'Centro'}, {id:2,nombre:'Otra'}]);
  await db.insert(productos).values({id:1,sku:'A',nombre:'Arroz',precioVenta:25,stock:10});
  await db.insert(stockSucursal).values({productoId:1,sucursalId:1,cantidad:10});
  assert.throws(() => validarMonto(NaN));
  assert.throws(() => validarMonto(-1));
  assert.throws(() => validarMonto(1.001));
  await assert.rejects(venderEnCaja(1,'Ana',[{productoId:1,cantidad:1}],'efectivo'), /Abrí/);
  const turno = await abrirCaja(1,'Ana',100);
  await assert.rejects(abrirCaja(1,'Ana',0), /ya tiene/);
  await abrirCaja(2,'Luis',0);
  await venderEnCaja(1,'Ana',[{productoId:1,cantidad:2}],'efectivo');
  await venderEnCaja(1,'Ana',[{productoId:1,cantidad:1}],'qr');
  await venderEnCaja(1,'Ana',[{productoId:1,cantidad:1}],'tarjeta');
  await moverEfectivo(1,turno.id,'Ana','ingreso',20,'Cambio');
  assert.equal((await extraer(turno.id,30)).ok,false);
  await db.insert(cajaSeguridad).values({id:1,claveHash:hashClaveAdministrador('secreta123'),actualizadoPor:'Admin',actualizadoEn:new Date()});
  assert.equal((await extraer(turno.id,30,'equivocada')).ok,false);
  assert.equal((await resumenCaja(turno)).esperado,170);
  await assert.rejects(moverEfectivo(1,turno.id,'Ana','retiro',30,'Gasto'), /clave de administrador/);
  const solicitud = randomUUID();
  assert.equal((await extraer(turno.id,30,'secreta123','ana',solicitud)).ok,true);
  assert.equal((await extraer(turno.id,30,'secreta123','ana',solicitud)).ok,true);
  assert.equal((await db.select().from(cajaExtracciones)).length,1);
  assert.equal((await resumenCaja(turno)).esperado,140);
  await assert.rejects(extraer(turno.id,141), /supera/);
  await assert.rejects(cerrarCaja(1,turno.id,'Ana',135,''), /Explicá/);
  await assert.rejects(cerrarCaja(2,turno.id,'Luis',0,''), /cambió/);
  const antes = (await db.select().from(ventas)).length;
  await assert.rejects(venderEnCaja(1,'Ana',[{productoId:1,cantidad:1},{productoId:999,cantidad:1}],'efectivo'));
  assert.equal((await db.select().from(ventas)).length,antes);
  assert.equal((await db.select().from(stockSucursal))[0].cantidad,6);
  await assert.rejects(venderEnCaja(1,'Ana',[{productoId:1,cantidad:4},{productoId:1,cantidad:4}],'efectivo'));
  const cierre = await cerrarCaja(1,turno.id,'Ana',135,'Faltan cinco');
  assert.equal(cierre.diferencia,-5);
  await assert.rejects(cerrarCaja(1,turno.id,'Ana',135,'Repetido'));
  await assert.rejects(venderEnCaja(1,'Ana',[{productoId:1,cantidad:1}],'efectivo'));
  await assert.rejects(moverEfectivo(1,turno.id,'Ana','ingreso',10,'Tarde'));
  const snapshot = (await client.execute(`SELECT efectivo_contado, diferencia FROM caja_turnos WHERE id=${turno.id}`)).rows[0];
  assert.equal((await saldoUltimoCierre(1)).disponible,135);
  assert.equal((await extraer(turno.id,35)).ok,true);
  assert.equal((await saldoUltimoCierre(1)).disponible,100);
  assert.deepEqual((await client.execute(`SELECT efectivo_contado, diferencia FROM caja_turnos WHERE id=${turno.id}`)).rows[0],snapshot);
  await assert.rejects(extraer(turno.id,101), /supera/);
  await assert.rejects(extraer(turno.id,10,'secreta123','ana',randomUUID(),2), /cambió/);
  const concurrentes = await Promise.allSettled([extraer(turno.id,60), extraer(turno.id,60)]);
  assert.equal(concurrentes.filter(r => r.status === 'fulfilled' && r.value.ok).length,1);
  assert.equal((await saldoUltimoCierre(1)).disponible,40);
  for (let i=0;i<5;i++) assert.equal((await extraer(turno.id,1,'incorrecta','bloqueado')).ok,false);
  assert.match((await extraer(turno.id,1,'secreta123','bloqueado')).error,/15 minutos/);
  assert.equal((await saldoUltimoCierre(1)).disponible,40);
  await db.update(cajaSeguridad).set({claveHash:hashClaveAdministrador('nuevaClave123')}).where(eq(cajaSeguridad.id,1));
  assert.equal((await extraer(turno.id,1)).ok,false);
  assert.equal((await extraer(turno.id,1,'nuevaClave123')).ok,true);
  assert.equal((await saldoUltimoCierre(1)).disponible,39);
  const aperturas = await Promise.allSettled([abrirCaja(1,'Ana',0,true), abrirCaja(1,'Luis',0,true)]);
  assert.equal(aperturas.filter(r => r.status === 'fulfilled').length,1);
  const { cajaAbierta } = await import('../src/lib/caja.ts');
  const nuevo = await cajaAbierta(1);
  assert.equal((await resumenCaja(nuevo)).esperado,39);
  await assert.rejects(extraer(turno.id,1,'nuevaClave123'), /cambió/);
  await cerrarCaja(1,nuevo.id,'Ana',39,'');
  assert.equal((await saldoUltimoCierre(1)).disponible,39);
  await assert.rejects(extraer(nuevo.id,-1,'nuevaClave123'));
  await assert.rejects(extraer(nuevo.id,0,'nuevaClave123'));
  console.log('Caja: apertura, aislamiento por sucursal, cobros, movimientos, arqueo, reapertura y rollback OK.');
} finally {
  client.close();

}




