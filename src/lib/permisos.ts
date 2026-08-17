// Catálogo de módulos y helpers de permisos. SIN dependencias de Node, así que
// se puede importar tanto desde server components como desde client components.

export type ModuloKey =
  | "panel"
  | "caja"
  | "stock"
  | "ventas"
  | "compras"
  | "clientes"
  | "facturacion"
  | "tienda"
  | "whatsapp"
  | "ia"
  | "equipo";

export type Modulo = { key: ModuloKey; label: string; href: string; oculto?: boolean };

// `oculto` saca el módulo de los menús y de los permisos asignables, pero NO
// desactiva la ruta ni el backend: /whatsapp y /tienda siguen funcionando si se
// entra por URL. Volver a mostrarlos = borrar la línea `oculto: true`.
export const MODULOS: Modulo[] = [
  { key: "panel", label: "Panel", href: "/" },
  { key: "caja", label: "Caja", href: "/caja" },
  { key: "stock", label: "Stock", href: "/stock" },
  { key: "ventas", label: "Ventas", href: "/ventas" },
  { key: "compras", label: "Compras", href: "/compras" },
  { key: "clientes", label: "Clientes", href: "/clientes" },
  { key: "facturacion", label: "Facturación", href: "/facturacion" },
  { key: "tienda", label: "Tienda online", href: "/tienda", oculto: true },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp", oculto: true },
  { key: "ia", label: "Asistente IA", href: "/ia" },
  { key: "equipo", label: "Equipo", href: "/equipo" },
];

export const MODULOS_VISIBLES = MODULOS.filter((m) => !m.oculto);

// Permisos típicos para un miembro nuevo (el mostrador: caja y stock)
export const PERMISOS_DEFAULT: ModuloKey[] = ["caja", "stock"];

// Forma del usuario en sesión que circula por la app (sin datos sensibles)
export type UsuarioActual = {
  id: number;
  nombre: string;
  usuario: string;
  rol: string; // admin | miembro
  permisos: ModuloKey[];
};

export function parsePermisos(json: string | null | undefined): ModuloKey[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? (arr as ModuloKey[]) : [];
  } catch {
    return [];
  }
}

export function esAdmin(u: UsuarioActual | null): boolean {
  return u?.rol === "admin";
}

export function tieneAcceso(u: UsuarioActual | null, modulo: ModuloKey): boolean {
  if (!u) return false;
  if (u.rol === "admin") return true;
  return u.permisos.includes(modulo);
}

// A dónde mandar al usuario cuando no tiene acceso al módulo pedido. Se buscan
// solo módulos visibles: no tiene sentido aterrizar en uno oculto del menú.
export function primerModuloPermitido(u: UsuarioActual): string {
  if (u.rol === "admin") return "/";
  const m = MODULOS_VISIBLES.find((x) => u.permisos.includes(x.key));
  return m?.href ?? "/login";
}
