import assert from 'node:assert/strict';
import { ajusteVigente } from '../src/lib/ajuste-carrito.ts';

const producto = { tipo: 'producto', productoId: 1, precio: 3200, actualizarStock: true };
assert.equal(ajusteVigente(producto, '1:1', '1:1|2:1', [1, 2]), producto, 'agregar otro artículo conserva el precio editado');
assert.equal(ajusteVigente(producto, '1:1', '1:2|2:1', [1, 2]), producto, 'cambiar cantidades conserva el precio unitario');
assert.equal(ajusteVigente(producto, '1:1', '2:1', [2]), null, 'quitar el artículo editado elimina su ajuste');

const total = { tipo: 'total', precio: 3000, actualizarStock: false };
assert.equal(ajusteVigente(total, '1:1', '1:1', [1]), total, 'el ajuste del total sigue vigente sin cambios');
assert.equal(ajusteVigente(total, '1:1', '1:1|2:1', [1, 2]), null, 'el ajuste del total se invalida al cambiar el pedido');
