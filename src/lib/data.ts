import type { Product, Order, Customer, Staff } from "./types";

/** Stock inicial con el que se carga cada producto del catálogo. */
export const STOCK_INICIAL = 50;

// Imágenes reales de promos (en /public).
const IMG = {
  medallones: "/1.jpeg",
  pataMuslo10: "/5.jpeg",
  suprema: "/6.jpeg",
  pataMuslo15: "/8.jpeg",
  cuartosTraseros: "/9.jpeg",
  patitas: "/10.jpeg",
};

export const products: Product[] = [
  {
    id: "p-suprema-5kg",
    name: "Suprema (Filet) — Bolsa 5kg",
    description: "Bolsa de suprema/filet de pollo de 5 kg. Ideal para milanesas.",
    price: 36000,
    category: "cortes",
    image: IMG.suprema,
    badge: "Promo del día",
    dailyOffer: true,
    available: true,
    stock: STOCK_INICIAL,
  },
  {
    id: "p-pata-muslo-10kg",
    name: "Pata Muslo Calisa — Cajón 10kg",
    description: "Cajón de pata muslo Calisa de 10 kg. El pollo argentino.",
    price: 31000,
    category: "cajones",
    image: IMG.pataMuslo10,
    badge: "Promo del día",
    dailyOffer: true,
    available: true,
    stock: STOCK_INICIAL,
  },
  {
    id: "p-pata-muslo-15kg",
    name: "Pata Muslo — Cajón 15kg",
    description: "Cajón de pata muslo de 15 kg. Rinde más para tu familia o negocio.",
    price: 42000,
    category: "cajones",
    image: IMG.pataMuslo15,
    badge: "Promo del día",
    dailyOffer: true,
    available: true,
    stock: STOCK_INICIAL,
  },
  {
    id: "p-cuartos-traseros-3kg",
    name: "Cuartos Traseros Fadel — 3kg",
    description: "Bolsa de cuartos traseros (pata muslo) Fadel IQF de 3 kg.",
    price: 9500,
    category: "cortes",
    image: IMG.cuartosTraseros,
    dailyOffer: false,
    available: true,
    stock: STOCK_INICIAL,
  },
  {
    id: "p-medallones-1kg",
    name: "Medallones de Pollo Calisa — 1kg",
    description: "Medallones de pollo Calisa Pack Familiar, listos para el horno.",
    price: 8500,
    category: "rebozados",
    image: IMG.medallones,
    badge: "Más vendido",
    dailyOffer: false,
    available: true,
    stock: STOCK_INICIAL,
  },
  {
    id: "p-patitas-1kg",
    name: "Patitas de Pollo Crujix — 1kg",
    description: "Patitas de pollo Crujix Pack Familiar Calisa, crocantes y rendidoras.",
    price: 8500,
    category: "rebozados",
    image: IMG.patitas,
    dailyOffer: false,
    available: true,
    stock: STOCK_INICIAL,
  },
];

/**
 * Producto que se regala con el código de bienvenida (una vez por teléfono).
 * Lo usa el seed del cupón BIENVENIDA y el aviso del carrito.
 */
export const REGALO_BIENVENIDA_PRODUCT_ID = "p-patitas-1kg";

/** Código que el cliente tiene que escribir para llevarse el regalo. */
export const CODIGO_BIENVENIDA = "PATITAS50";

export const categories: { id: Product["category"] | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "cortes", label: "Cortes" },
  { id: "cajones", label: "Cajones" },
  { id: "rebozados", label: "Rebozados" },
];

export const offers: Product[] = products.filter(
  (p) => p.dailyOffer || p.oldPrice || p.badge === "Promo del día"
);

// ---------- Pedidos (admin) ----------
export const orders: Order[] = [
  {
    id: "#1042",
    customer: "Martín Gómez",
    items: [{ productId: "p-suprema-5kg", name: "Suprema (Filet) — Bolsa 5kg", qty: 1, price: 36000 }],
    total: 36000,
    status: "entregado",
    payment: "mercadopago",
    date: "2026-06-11T12:10:00",
  },
  {
    id: "#1041",
    customer: "Lucía Fernández",
    items: [{ productId: "p-pata-muslo-15kg", name: "Pata Muslo — Cajón 15kg", qty: 1, price: 42000 }],
    total: 42000,
    status: "en_camino",
    payment: "tarjeta",
    date: "2026-06-11T12:02:00",
  },
  {
    id: "#1040",
    customer: "Diego Sosa",
    items: [{ productId: "p-medallones-1kg", name: "Medallones de Pollo Calisa — 1kg", qty: 2, price: 8500 }],
    total: 17000,
    status: "en_preparacion",
    payment: "efectivo",
    date: "2026-06-11T11:55:00",
  },
  {
    id: "#1039",
    customer: "Sofía Ramírez",
    items: [{ productId: "p-cuartos-traseros-3kg", name: "Cuartos Traseros Fadel — 3kg", qty: 1, price: 9500 }],
    total: 9500,
    status: "pendiente",
    payment: "transferencia",
    date: "2026-06-11T11:48:00",
  },
  {
    id: "#1038",
    customer: "Javier Páez",
    items: [{ productId: "p-patitas-1kg", name: "Patitas de Pollo Crujix — 1kg", qty: 1, price: 8500 }],
    total: 8500,
    status: "entregado",
    payment: "mercadopago",
    date: "2026-06-11T11:30:00",
  },
  {
    id: "#1037",
    customer: "Carla Núñez",
    items: [{ productId: "p-pata-muslo-10kg", name: "Pata Muslo Calisa — Cajón 10kg", qty: 1, price: 31000 }],
    total: 31000,
    status: "cancelado",
    payment: "efectivo",
    date: "2026-06-11T11:12:00",
  },
];

// ---------- Clientes (admin) ----------
export const customers: Customer[] = [
  {
    id: "c-1",
    name: "Martín Gómez",
    email: "martin.gomez@mail.com",
    phone: "+54 379 412-3344",
    document: "30.123.456",
    orders: 28,
    spent: 312500,
    joined: "2025-02-14",
  },
  {
    id: "c-2",
    name: "Lucía Fernández",
    email: "lucia.f@mail.com",
    phone: "+54 379 455-1290",
    document: "27.998.221",
    orders: 41,
    spent: 487900,
    joined: "2024-11-03",
  },
  {
    id: "c-3",
    name: "Diego Sosa",
    email: "diego.sosa@mail.com",
    phone: "+54 379 488-7711",
    orders: 12,
    spent: 98700,
    joined: "2025-08-20",
  },
  {
    id: "c-4",
    name: "Sofía Ramírez",
    email: "sofia.r@mail.com",
    phone: "+54 379 401-5566",
    orders: 6,
    spent: 41200,
    joined: "2026-01-09",
  },
  {
    id: "c-5",
    name: "Javier Páez",
    email: "j.paez@mail.com",
    phone: "+54 379 477-9080",
    orders: 19,
    spent: 176400,
    joined: "2025-05-27",
  },
];

// ---------- Equipo (empleados) ----------
export const staff: Staff[] = [
  { id: "s-1", name: "Roberto Díaz", role: "encargado", phone: "+54 379 410-0001", permissions: [], active: true, createdAt: "2024-09-01" },
  { id: "s-2", name: "Marcela Ojeda", role: "cajero", phone: "+54 379 410-0002", permissions: [], active: true, createdAt: "2025-01-15" },
  { id: "s-3", name: "Hugo Benítez", role: "cocina", phone: "+54 379 410-0003", permissions: [], active: true, createdAt: "2025-03-10" },
  { id: "s-4", name: "Nicolás Rivero", role: "repartidor", phone: "+54 379 410-0004", permissions: [], active: true, createdAt: "2025-06-20" },
  { id: "s-5", name: "Emanuel Aguirre", role: "repartidor", phone: "+54 379 410-0005", permissions: [], active: true, createdAt: "2026-02-02" },
];

export function productById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
