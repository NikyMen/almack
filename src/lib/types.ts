export type Category = string;

/** Posteo/banner de la sección "Novedades" de la home. */
export interface Novedad {
  id: string;
  title?: string;
  image: string;
  link?: string;
  active: boolean;
  position: number;
}

/** Banner principal de la home ("Super Oferta"), editable desde /admin/ofertas. */
export interface SuperOferta {
  id: string;
  title: string;
  subtitle?: string;
  /** Precio de oferta (el que se cobra). */
  price: number;
  /** Precio normal, se muestra tachado. */
  oldPrice?: number;
  /** Imagen de fondo; también es el póster mientras carga el video. */
  image: string;
  /** Video mp4 opcional: si está, se reproduce en loop como fondo del banner. */
  video?: string;
  cartProductId: string;
  cartQuantity: number;
  /** Enlace del botón "Pedila ahora" (default /productos). */
  link?: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  image: string;
  badge?: string;
  /** Precio anterior, para mostrar ofertas */
  oldPrice?: number;
  /** Se muestra en la sección "Ofertas del día" de la home. */
  dailyOffer: boolean;
  available: boolean;
  /** Unidades disponibles. Se vende solo si `available` y `stock > 0`. */
  stock: number;
}

export interface Coupon {
  id: string;
  code: string;
  kind: "coupon" | "second_unit";
  automatic: boolean;
  maxUses: number;
  usedCount: number;
  discountPercent: number;
  discountProductId?: string;
  discountProductName?: string;
  giftProductId?: string;
  giftProductName?: string;
  giftQty: number;
  /** Regalo de bienvenida: solo vale en la primera compra de cada teléfono. */
  firstPurchaseOnly: boolean;
  active: boolean;
}

export interface CouponQuote {
  code: string;
  subtotal: number;
  discount: number;
  total: number;
  description: string;
  automatic?: boolean;
  gift?: { productId: string; name: string; qty: number };
}

export type OrderStatus =
  | "pendiente"
  | "no_pagado"
  | "en_preparacion"
  | "en_camino"
  | "entregado"
  | "cancelado";

/**
 * Forma de entrega del pedido: siempre envío a domicilio.
 * El retiro por sucursal ya no existe.
 */
export type DeliveryType = "envio";

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  /** id interno de la base (cuid); se usa como external_reference en pagos. */
  internalId?: string;
  /** Clave idempotente de un intento de checkout. */
  checkoutId?: string;
  customer: string;
  phone?: string;
  address?: string;
  entrega?: DeliveryType;
  /** Rango horario de entrega elegido por el cliente ("08-12" o "17-20"). */
  deliverySlot?: string;
  /** Fecha calendario estimada de entrega en Argentina (YYYY-MM-DD). */
  deliveryDate?: string;
  /** Punto exacto de entrega marcado en el mapa. */
  lat?: number;
  lng?: number;
  /** Código que el cliente le da al repartidor al recibir el pedido. */
  deliveryCode?: string;
  /** Momento exacto en que se confirmó la entrega. */
  deliveredAt?: string;
  /** Momento exacto en que Mercado Pago confirmó el cobro. */
  paidAt?: string;
  /** Momento exacto en que se canceló el pedido. */
  cancelledAt?: string;
  /** Cancelación logística pendiente de reasignación a otro repartidor. */
  deliveryRetryAt?: string;
  /** Preferencia de Mercado Pago asociada al intento. */
  mpPreferenceId?: string;
  mpInitPoint?: string;
  /** Pago aprobado asociado al pedido. */
  mpPaymentId?: string;
  /** Fin de la reserva temporal del cupón. */
  couponReservedUntil?: string;
  /** Momento en que el uso del cupón quedó confirmado por el pago. */
  couponUsedAt?: string;
  /** Posición del pedido en la ruta optimizada del reparto (1..N). */
  routeSeq?: number;
  /** Momento en que el pedido salió de la sucursal (ISO), al cerrar el lote. */
  dispatchedAt?: string;
  /** Identificador del lote generado en cada cierre de pedidos. */
  routeBatchId?: string;
  /** Momento en que el encargado cerró el reparto. */
  routeClosedAt?: string;
  /** Última actualización del pedido (ISO). Sirve como hora de entrega. */
  updatedAt?: string;
  /** Sucursal desde la que salió el reparto. */
  originSucursalId?: string;
  /** Repartidor (Staff.id) a cargo de la entrega, asignado al cerrar el lote. */
  repartidorId?: string;
  notes?: string;
  items: OrderItem[];
  total: number;
  discount?: number;
  couponCode?: string;
  status: OrderStatus;
  payment: "efectivo" | "tarjeta" | "mercadopago" | "transferencia";
  date: string; // ISO
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  document?: string;
  orders: number;
  spent: number;
  joined: string;
}

export type StaffRole = "cajero" | "cocina" | "repartidor" | "encargado" | "admin";

/** Integrante del equipo de la pollería (empleado). */
export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  phone?: string;
  email?: string;
  /** usuario de login del panel (si puede iniciar sesión) */
  username?: string;
  /** ¿tiene contraseña definida? (nunca exponemos el hash) */
  hasPassword?: boolean;
  /** módulos del panel habilitados (claves de PERM_MODULES) */
  permissions: string[];
  active: boolean;
  createdAt: string;
}
