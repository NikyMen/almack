import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

if (!process.env.TURSO_DATABASE_URL?.startsWith("file:transfer-test-")) throw new Error("La prueba necesita una base temporal aislada.");
const migration = spawnSync(process.execPath, ["--import", "tsx", "src/db/migrate.ts"], {
  env: process.env, encoding: "utf8",
});
if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout);

const { client } = await import("../src/db/index.ts");
const { enviarTransferencia, verificarTransferencia, devolverTransferencia } = await import("../src/lib/transferencias.ts");
const run = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const scalar = async (sql, args = []) => Number((await run(sql, args))[0]?.n ?? 0);

try {
  const origen = await scalar("SELECT id AS n FROM sucursales ORDER BY id LIMIT 1");
  const destino = Number((await client.execute("INSERT INTO sucursales (nombre) VALUES ('Destino')")).lastInsertRowid);
  const producto = Number((await client.execute("INSERT INTO productos (sku,nombre,stock) VALUES ('TEST-TR','Producto de prueba',10)")).lastInsertRowid);
  await run("INSERT INTO stock_sucursal (producto_id,sucursal_id,cantidad) VALUES (?,?,10)", [producto, origen]);
  const usuario = { id: 1, nombre: "Tester" };
  const stock = async (sucursal) => scalar("SELECT cantidad AS n FROM stock_sucursal WHERE producto_id=? AND sucursal_id=?", [producto, sucursal]);
  const transito = async () => scalar("SELECT cantidad AS n FROM stock_transito WHERE producto_id=? AND sucursal_id=?", [producto, destino]);
  const total = async () => scalar("SELECT stock AS n FROM productos WHERE id=?", [producto]);
  const itemId = async (id) => scalar("SELECT id AS n FROM stock_movimiento_items WHERE movimiento_id=?", [id]);
  const enviar = (cantidad) => enviarTransferencia({ origenId: origen, destinoId: destino, nota: "Prueba", items: [{ productoId: producto, cantidad }], usuario });

  const primero = await enviar(5);
  assert.equal(await stock(origen), 5);
  assert.equal(await stock(destino), 0);
  assert.equal(await transito(), 5);
  assert.equal(await total(), 5);
  await verificarTransferencia({ id: primero.id, decision: "aceptar", cantidades: [{ itemId: await itemId(primero.id), cantidad: 3 }], nota: "Faltaron dos", usuario });
  assert.equal(await stock(destino), 3);
  assert.equal(await transito(), 0);
  assert.equal(await total(), 8);
  await assert.rejects(() => verificarTransferencia({ id: primero.id, decision: "aceptar", cantidades: [], nota: "", usuario }));

  const segundo = await enviar(2);
  await verificarTransferencia({ id: segundo.id, decision: "rechazar", cantidades: [{ itemId: await itemId(segundo.id), cantidad: 3 }], nota: "Llegaron tres; no se acepta", usuario });
  assert.equal(await stock(destino), 3);
  assert.equal(await transito(), 2);
  await devolverTransferencia({ id: segundo.id, cantidades: [{ itemId: await itemId(segundo.id), cantidad: 1 }], nota: "Volvió solo una", usuario });
  assert.equal(await stock(origen), 4);
  assert.equal(await transito(), 0);
  assert.equal(await total(), 7);

  const tercero = await enviar(1);
  await verificarTransferencia({ id: tercero.id, decision: "aceptar", cantidades: [{ itemId: await itemId(tercero.id), cantidad: 2 }], nota: "Llegó una extra", usuario });
  assert.equal(await stock(origen), 3);
  assert.equal(await stock(destino), 5);
  assert.equal(await transito(), 0);
  assert.equal(await total(), 8);
  console.log("Transferencias: envío, faltante, sobrante, rechazo, devolución e idempotencia OK.");
} finally {
  await client.close();
}
