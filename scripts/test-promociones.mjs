import assert from "node:assert/strict";
import { cotizarPromocion, vigente } from "../src/lib/promociones.ts";

const base = {
  id: 1, nombre: "Promo", tipo: "total", activa: true, porcentaje: 10,
  productoIds: "[]", cantidadCombo: 2, modo: "continua", fechaUnica: "", mes: "", dias: "[]", diaSemana: 6,
};
const sabado = new Date("2026-10-10T15:00:00Z");
const domingo = new Date("2026-10-11T15:00:00Z");
assert.equal(vigente({ ...base, modo: "unica", fechaUnica: "2026-10-10" }, sabado), true);
assert.equal(vigente({ ...base, modo: "unica", fechaUnica: "2026-10-10" }, domingo), false);
assert.equal(vigente({ ...base, modo: "dias", mes: "2026-10", dias: "[10,24]" }, sabado), true);
assert.equal(vigente({ ...base, modo: "semanal", mes: "2026-10", diaSemana: 6 }, sabado), true);
assert.equal(vigente({ ...base, modo: "semanal", mes: "2026-10", diaSemana: 6 }, domingo), false);
assert.equal(vigente({ ...base, activa: false }, sabado), false);
const lineas = [{ productoId: 1, cantidad: 2, precio: 100 }, { productoId: 2, cantidad: 1, precio: 50 }];
assert.equal(cotizarPromocion(base, lineas)?.total, 225);
assert.equal(cotizarPromocion({ ...base, tipo: "seleccionados", productoIds: "[1]", porcentaje: 20 }, lineas)?.discount, 40);
assert.equal(cotizarPromocion({ ...base, tipo: "combo", productoIds: "[1,2]", cantidadCombo: 4 }, lineas), null);
assert.equal(cotizarPromocion({ ...base, tipo: "combo", productoIds: "[1,2]", cantidadCombo: 3 }, lineas)?.discount, 25);
console.log("Promociones: calendario y descuentos correctos.");
