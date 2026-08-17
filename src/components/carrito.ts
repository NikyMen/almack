"use client";

// Lógica de carrito compartida entre la Caja (POS) y el alta manual de venta.
// Mantiene la validación de stock contra lo que ya está cargado, que es lo que
// evita vender dos veces la última unidad.

import { useCallback, useMemo, useState } from "react";
import type { Producto } from "@/db/schema";

export type Linea = { producto: Producto; cantidad: number };

export function useCarrito(productos: Producto[]) {
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [error, setError] = useState("");

  const enCarrito = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of carrito) m.set(l.producto.id, l.cantidad);
    return m;
  }, [carrito]);

  const total = carrito.reduce((a, l) => a + l.producto.precioVenta * l.cantidad, 0);
  const unidades = carrito.reduce((a, l) => a + l.cantidad, 0);

  const agregar = useCallback((p: Producto, delta = 1) => {
    setError("");
    setCarrito((prev) => {
      const existe = prev.find((l) => l.producto.id === p.id);
      const actual = existe?.cantidad ?? 0;
      const siguiente = actual + delta;
      if (siguiente > p.stock) {
        setError(`Sin stock suficiente de "${p.nombre}" (quedan ${p.stock}).`);
        return prev;
      }
      if (siguiente <= 0) return prev.filter((l) => l.producto.id !== p.id);
      if (existe) return prev.map((l) => (l.producto.id === p.id ? { ...l, cantidad: siguiente } : l));
      return [...prev, { producto: p, cantidad: 1 }];
    });
  }, []);

  const quitar = useCallback((id: number) => {
    setCarrito((prev) => prev.filter((l) => l.producto.id !== id));
  }, []);

  const vaciar = useCallback(() => {
    setCarrito([]);
    setError("");
  }, []);

  /** Busca por nombre, SKU o categoría. Devuelve como máximo `limite` productos. */
  const buscar = useCallback(
    (q: string, limite = 24) => {
      const t = q.trim().toLowerCase();
      if (!t) return productos.slice(0, limite);
      return productos
        .filter((p) => `${p.nombre} ${p.sku} ${p.categoria}`.toLowerCase().includes(t))
        .slice(0, limite);
    },
    [productos]
  );

  /**
   * Entrada de lector/cámara: primero intenta match exacto de SKU y si no,
   * cae al primer resultado de la búsqueda. Devuelve el producto agregado.
   */
  const agregarPorCodigo = useCallback(
    (codigo: string) => {
      const t = codigo.trim().toLowerCase();
      if (!t) return null;
      const exacto = productos.find((p) => p.sku.toLowerCase() === t);
      const elegido = exacto ?? buscar(t, 1)[0];
      if (!elegido) {
        setError(`No se encontró ningún producto con el código "${codigo}".`);
        return null;
      }
      agregar(elegido);
      return elegido;
    },
    [productos, buscar, agregar]
  );

  const items = useCallback(
    () => carrito.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
    [carrito]
  );

  return {
    carrito, error, setError,
    enCarrito, total, unidades,
    agregar, quitar, vaciar, buscar, agregarPorCodigo, items,
  };
}
