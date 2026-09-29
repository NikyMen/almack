import { client } from "./index";

// Datos locales para recorrer la aplicación. Nunca borra información existente.
async function run() {
  const existing = await client.execute("SELECT COUNT(*) AS n FROM productos");
  if (Number(existing.rows[0]?.n) > 0) {
    console.log("La base ya tiene productos. Se conservan los datos; no se vuelve a cargar la demo.");
    return;
  }

  async function insert(sql: string, args: (string | number | null)[] = []) {
    const result = await client.execute({ sql, args });
    return Number(result.lastInsertRowid);
  }

  const central = Number((await client.execute("SELECT id FROM sucursales ORDER BY id LIMIT 1")).rows[0]?.id);
  if (!central) throw new Error("Ejecutá la migración antes de cargar la demo.");
  await client.execute({ sql: "UPDATE sucursales SET nombre=?, direccion=?, telefono=? WHERE id=?", args: ["Casa Central", "Av. Principal 123, Corrientes", "3794 000001", central] });
  const norte = await insert("INSERT INTO sucursales (nombre,direccion,telefono,orden) VALUES (?,?,?,1)", ["Sucursal Norte", "Av. Libertad 850, Corrientes", "3794 000002"]);
  const admin = Number((await client.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1")).rows[0]?.id);

  const catalogo = [
    ["POL-001", "Pollo entero fresco", "Pollería", 8500, 5800, 36, 8, "/1.jpeg"],
    ["POL-002", "Pata muslo por kg", "Pollería", 7200, 4900, 65, 12, "/2.jpeg"],
    ["POL-003", "Pechuga deshuesada por kg", "Pollería", 10900, 7600, 24, 10, "/3.jpeg"],
    ["POL-004", "Alitas de pollo por kg", "Pollería", 5800, 3900, 7, 10, "/4.jpeg"],
    ["POL-005", "Milanesas de pollo por kg", "Elaborados", 12400, 8600, 30, 8, "/5.jpeg"],
    ["POL-006", "Supremas rellenas por kg", "Elaborados", 14500, 9800, 18, 6, "/6.jpeg"],
    ["POL-007", "Hamburguesas de pollo x 4", "Elaborados", 6400, 4200, 42, 10, "/7.jpeg"],
    ["POL-008", "Nuggets de pollo x 12", "Congelados", 5900, 3700, 27, 8, "/8.jpeg"],
    ["POL-009", "Caldo casero de pollo", "Almacén", 3200, 1800, 14, 5, "/9.jpeg"],
    ["POL-010", "Combo familiar 10 kg pata muslo", "Promociones", 59000, 44000, 12, 4, "/super-oferta-patamuslo-10kg.png"],
    ["POL-011", "Menudos de pollo por kg", "Pollería", 2900, 1800, 0, 5, "/10.jpeg"],
    ["POL-012", "Brochettes de pollo x 6", "Elaborados", 8900, 6100, 16, 5, "/11.jpeg"],
  ] as const;
  const productIds: number[] = [];
  for (const [sku, nombre, categoria, precio, costo, stock, minimo, imagen] of catalogo) {
    const id = await insert("INSERT INTO productos (sku,nombre,descripcion,categoria,precio_venta,precio_compra,stock,stock_minimo,imagen,publicado,descripcion_web) VALUES (?,?,?,?,?,?,?,?,?,1,?)", [sku, nombre, `Producto de prueba: ${nombre.toLowerCase()}.`, categoria, precio, costo, stock, minimo, imagen, `Disfrutá ${nombre.toLowerCase()} con la calidad de Almack.`]);
    productIds.push(id);
    const enNorte = Math.floor(stock * 0.35);
    await insert("INSERT INTO stock_sucursal (producto_id,sucursal_id,cantidad) VALUES (?,?,?)", [id, central, stock - enNorte]);
    await insert("INSERT INTO stock_sucursal (producto_id,sucursal_id,cantidad) VALUES (?,?,?)", [id, norte, enNorte]);
  }
  for (const [index, anterior, badge, oferta] of [[1, 8900, "Oferta", 1], [4, 14900, "Especial", 1], [9, 75000, "Super oferta", 1]] as const) {
    await insert("INSERT INTO tienda_producto_meta (producto_id,precio_anterior,badge,oferta_del_dia) VALUES (?,?,?,?)", [productIds[index], anterior, badge, oferta]);
  }

  const customerIds: number[] = [];
  for (const [nombre, email, telefono, cuit, direccion] of [
    ["María González", "maria@example.test", "3794000101", "27-30111222-3", "San Martín 120"],
    ["Juan Pérez", "juan@example.test", "3794000102", "20-28999111-4", "Belgrano 333"],
    ["Comedor El Encuentro", "comedor@example.test", "3794000103", "30-71234567-8", "Junín 940"],
    ["Lucía Fernández", "lucia@example.test", "3794000104", "27-34555666-9", "Rivadavia 765"],
  ]) customerIds.push(await insert("INSERT INTO clientes (nombre,email,telefono,cuit,direccion) VALUES (?,?,?,?,?)", [nombre, email, telefono, cuit, direccion]));

  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const sales = [
    { cliente: 0, sucursal: central, canal: "local", pago: "efectivo", estado: "completada", days: 2, items: [[0, 2], [4, 1]] },
    { cliente: 1, sucursal: norte, canal: "local", pago: "tarjeta", estado: "completada", days: 9, items: [[2, 2], [7, 1]] },
    { cliente: 2, sucursal: central, canal: "local", pago: "qr", estado: "completada", days: 38, items: [[1, 6], [5, 2]] },
    { cliente: 3, sucursal: null, canal: "online", pago: "mercadopago", estado: "completada", days: 72, items: [[9, 1]] },
    { cliente: 0, sucursal: null, canal: "online", pago: "mercadopago", estado: "pendiente", days: 1, items: [[3, 2]] },
    { cliente: 1, sucursal: norte, canal: "local", pago: "efectivo", estado: "cancelada", days: 5, items: [[6, 2]] },
  ] as const;
  const saleIds: number[] = [];
  for (const sale of sales) {
    const total = sale.items.reduce((sum, [index, qty]) => sum + catalogo[index][3] * qty, 0);
    const id = await insert("INSERT INTO ventas (cliente_id,sucursal_id,total,estado,canal,medio_pago,facturada,fecha) VALUES (?,?,?,?,?,?,?,?)", [customerIds[sale.cliente], sale.sucursal, total, sale.estado, sale.canal, sale.pago, saleIds.length < 3 ? 1 : 0, now - sale.days * day]);
    saleIds.push(id);
    for (const [index, qty] of sale.items) await insert("INSERT INTO venta_items (venta_id,producto_id,cantidad,precio_unit) VALUES (?,?,?,?)", [id, productIds[index], qty, catalogo[index][3]]);
  }
  for (const [index, tipo, estado] of [[0, "B", "pagada"], [1, "B", "emitida"], [2, "A", "emitida"]] as const) {
    const sale = sales[index];
    const total = sale.items.reduce((sum, [product, qty]) => sum + catalogo[product][3] * qty, 0);
    const subtotal = Math.round(total / 1.21 * 100) / 100;
    await insert("INSERT INTO facturas (numero,venta_id,cliente_id,tipo,subtotal,iva,total,estado,fecha) VALUES (?,?,?,?,?,?,?,?,?)", [`${tipo}-0001-${String(index + 1).padStart(8, "0")}`, saleIds[index], customerIds[sale.cliente], tipo, subtotal, Math.round((total - subtotal) * 100) / 100, total, estado, now - sale.days * day]);
  }
  for (const [index, estado] of [[3, "entregado"], [4, "pendiente"]] as const) {
    await insert("INSERT INTO tienda_pedidos (venta_id,checkout_id,nombre,telefono,direccion,franja_entrega,fecha_entrega,estado_entrega,codigo_entrega,notas) VALUES (?,?,?,?,?,?,?,?,?,?)", [saleIds[index], `demo-checkout-${index}`, index === 3 ? "Lucía Fernández" : "María González", `379400010${index === 3 ? 4 : 1}`, "Rivadavia 765, Corrientes", "Tarde", "2026-09-30", estado, `DEMO${index}`, "Pedido de demostración"]);
  }

  const purchaseDone = await insert("INSERT INTO compras (proveedor,sucursal_id,total,estado,detalle,fecha) VALUES (?,?,?,?,?,?)", ["Granja del Litoral", central, 212000, "verificado", "Pollo entero x 20; pechuga x 6", now - 12 * day]);
  const purchasePending = await insert("INSERT INTO compras (proveedor,sucursal_id,total,estado,detalle,fecha) VALUES (?,?,?,?,?,?)", ["Distribuidora Norte", norte, 98000, "falta_controlar", "Pata muslo x 10; producto nuevo para revisar", now - day]);
  await insert("INSERT INTO compras (proveedor,sucursal_id,total,estado,detalle,fecha) VALUES (?,?,?,?,?,?)", ["Avícola San José", central, 76000, "pedido", "Entrega prevista para la próxima semana", now]);
  for (const [product, qty] of [[0, 20], [2, 6]] as const) {
    await insert("INSERT INTO compra_items (compra_id,producto_id,cantidad,precio_unit) VALUES (?,?,?,?)", [purchaseDone, productIds[product], qty, catalogo[product][4]]);
    await insert("INSERT INTO compra_lineas (compra_id,descripcion,codigo,cantidad,precio_unit,producto_id,estado,origen,confirmado,aplicado,aplicado_en) VALUES (?,?,?,?,?,?,'match','manual',1,1,?)", [purchaseDone, catalogo[product][1], catalogo[product][0], qty, catalogo[product][4], productIds[product], now - 12 * day]);
  }
  await insert("INSERT INTO compra_lineas (compra_id,descripcion,codigo,cantidad,precio_unit,producto_id,estado,origen) VALUES (?,?,?,?,?,?,'match','manual')", [purchasePending, "Pata muslo por kg", "POL-002", 10, 4900, productIds[1]]);
  await insert("INSERT INTO compra_lineas (compra_id,descripcion,codigo,cantidad,precio_unit,precio_venta,estado,origen) VALUES (?,?,?,?,?,?,'nuevo','manual')", [purchasePending, "Bastones de pollo x 10", "POL-013", 10, 4900, 7900]);
  await insert("INSERT INTO compra_historial (compra_id,usuario_id,usuario_nombre,campo,antes,despues) VALUES (?,?,?,?,?,?)", [purchaseDone, admin, "Administrador", "estado", "falta_controlar", "verificado"]);

  const move = await insert("INSERT INTO stock_movimientos (origen_id,destino_id,usuario_id,usuario_nombre,nota,unidades,creado_en) VALUES (?,?,?,?,?,?,?)", [central, norte, admin, "Administrador", "Reposición semanal de prueba", 8, now - 3 * day]);
  await insert("INSERT INTO stock_movimiento_items (movimiento_id,producto_id,descripcion,cantidad) VALUES (?,?,?,?)", [move, productIds[0], catalogo[0][1], 8]);
  await insert("INSERT INTO gastos (sucursal_id,movimiento_id,concepto,categoria,monto,fecha) VALUES (?,?,?,?,?,?)", [norte, move, "Flete de reposición", "flete", 8500, now - 3 * day]);
  await insert("INSERT INTO gastos (sucursal_id,concepto,categoria,monto,fecha) VALUES (?,?,?,?,?)", [central, "Servicios del local", "servicios", 24000, now - 7 * day]);

  const stages = (await client.execute("SELECT id,nombre FROM wa_etapas")).rows;
  const stageId = (name: string) => Number(stages.find((row) => row.nombre === name)?.id);
  for (const [index, nombre, etapa] of [[1, "Consulta de catering", "Leads entrantes"], [2, "Restaurante Norte", "Contactados"], [3, "Evento familiar", "En negociación"], [4, "Almacén del Barrio", "Ganados"]] as const) {
    const lead = await insert("INSERT INTO wa_contactos (jid,telefono,numero_lead,nombre,email,notas,responsable_id,etapa_id,orden,ultimo_mensaje,no_leidos) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [`demo${index}@example.test`, `379400020${index}`, `L-DEMO${index}`, nombre, `lead${index}@example.test`, "Contacto ficticio para probar el tablero", admin, stageId(etapa), index, "Hola, quisiera conocer los precios", index === 1 ? 1 : 0]);
    await insert("INSERT INTO wa_mensajes (contacto_id,desde_mi,texto,timestamp) VALUES (?,0,?,?)", [lead, "Hola, quisiera conocer los precios", now - index * day]);
    if (index >= 2) await insert("INSERT INTO wa_mensajes (contacto_id,desde_mi,texto,timestamp) VALUES (?,1,?,?)", [lead, "Te compartimos nuestro catálogo y presupuesto.", now - index * day + 600]);
    if (index >= 3) {
      const quote = await insert("INSERT INTO wa_presupuestos (contacto_id,estado,total) VALUES (?,?,?)", [lead, index === 4 ? "aprobado" : "borrador", 17000]);
      await insert("INSERT INTO wa_presupuesto_items (presupuesto_id,producto_id,descripcion,cantidad,precio_unit) VALUES (?,?,?,?,?)", [quote, productIds[0], catalogo[0][1], 2, 8500]);
    }
  }
  const chat = await insert("INSERT INTO ia_conversaciones (usuario_id,titulo) VALUES (?,?)", [admin, "Resumen de ventas de prueba"]);
  await insert("INSERT INTO ia_mensajes (conversacion_id,rol,texto) VALUES (?,'user',?)", [chat, "¿Cómo vienen las ventas?"]);
  await insert("INSERT INTO ia_mensajes (conversacion_id,rol,texto) VALUES (?,'assistant',?)", [chat, "Esta es una conversación de ejemplo. Configurá DEEPSEEK_API_KEY para obtener respuestas reales."]);
  console.log(`Demo lista: ${productIds.length} productos, ${customerIds.length} clientes, ${saleIds.length} ventas, 3 compras, 2 sucursales y 4 leads.`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
