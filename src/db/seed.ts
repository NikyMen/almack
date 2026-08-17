import { db } from "./index";
import { productos, clientes, ventas, ventaItems, compras, facturas } from "./schema";

async function seed() {
  console.log("Sembrando datos de ejemplo...");

  await db.delete(facturas);
  await db.delete(ventaItems);
  await db.delete(ventas);
  await db.delete(compras);
  await db.delete(productos);
  await db.delete(clientes);

  const prods = await db
    .insert(productos)
    .values([
      { sku: "REM-001", nombre: "Remera algodón premium", categoria: "Indumentaria", precioVenta: 12999, precioCompra: 6000, stock: 42, stockMinimo: 10, publicado: true, descripcion: "Remera 100% algodón peinado." },
      { sku: "ZAP-014", nombre: "Zapatillas urbanas", categoria: "Calzado", precioVenta: 45999, precioCompra: 24000, stock: 8, stockMinimo: 10, publicado: true, descripcion: "Zapatillas livianas para uso diario." },
      { sku: "MAT-007", nombre: "Mate imperial cuero", categoria: "Bazar", precioVenta: 18500, precioCompra: 9000, stock: 3, stockMinimo: 5, publicado: false, descripcion: "Mate forrado en cuero genuino." },
      { sku: "AUR-022", nombre: "Auriculares inalámbricos", categoria: "Electrónica", precioVenta: 32999, precioCompra: 17000, stock: 25, stockMinimo: 8, publicado: true, descripcion: "Bluetooth 5.3, cancelación de ruido." },
      { sku: "TAZ-003", nombre: "Taza cerámica artesanal", categoria: "Bazar", precioVenta: 6999, precioCompra: 2500, stock: 0, stockMinimo: 6, publicado: false, descripcion: "Pieza única hecha a mano." },
    ])
    .returning();

  const clis = await db
    .insert(clientes)
    .values([
      { nombre: "María González", email: "maria@mail.com", telefono: "11-5555-1234", cuit: "27-30111222-3", direccion: "Av. Siempreviva 742" },
      { nombre: "Comercial del Sur SRL", email: "ventas@delsur.com", telefono: "11-4444-9876", cuit: "30-71234567-8", direccion: "San Martín 1200" },
      { nombre: "Juan Pérez", email: "juanp@mail.com", telefono: "11-6666-4321", cuit: "20-28999111-4", direccion: "Belgrano 333" },
    ])
    .returning();

  const v = await db
    .insert(ventas)
    .values([
      { clienteId: clis[0].id, total: 58998, estado: "completada", canal: "online", facturada: true },
      { clienteId: clis[1].id, total: 45999, estado: "completada", canal: "local", facturada: true },
      { clienteId: clis[2].id, total: 12999, estado: "pendiente", canal: "online", facturada: false },
    ])
    .returning();

  await db.insert(ventaItems).values([
    { ventaId: v[0].id, productoId: prods[0].id, cantidad: 2, precioUnit: 12999 },
    { ventaId: v[0].id, productoId: prods[3].id, cantidad: 1, precioUnit: 32999 },
    { ventaId: v[1].id, productoId: prods[1].id, cantidad: 1, precioUnit: 45999 },
    { ventaId: v[2].id, productoId: prods[0].id, cantidad: 1, precioUnit: 12999 },
  ]);

  await db.insert(compras).values([
    { proveedor: "Textiles Andes", total: 120000, estado: "recibida" },
    { proveedor: "Importadora Tech", total: 340000, estado: "pendiente" },
  ]);

  await db.insert(facturas).values([
    { numero: "B-0001-00000001", ventaId: v[0].id, clienteId: clis[0].id, tipo: "B", subtotal: 48758, iva: 10240, total: 58998, estado: "pagada" },
    { numero: "A-0001-00000002", ventaId: v[1].id, clienteId: clis[1].id, tipo: "A", subtotal: 38016, iva: 7983, total: 45999, estado: "emitida" },
  ]);

  console.log("Listo. Datos de ejemplo cargados.");
}

seed();
