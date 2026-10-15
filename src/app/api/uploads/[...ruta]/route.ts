import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { tieneAcceso } from "@/lib/permisos";
import { db, compras, sucursales } from "@/db";
import { and, eq } from "drizzle-orm";

// Los comprobantes NO viven en /public por dos motivos:
//  1. Next solo sirve /public con lo que existía al momento del build, así que
//     una foto subida en producción nunca se vería.
//  2. Son documentos internos del negocio: se sirven detrás del login.
const RAIZ = path.join(process.cwd(), "uploads");

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ ruta: string[] }> }) {
  const usuario = await getUsuarioActual();
  if (!usuario) return new NextResponse("No autenticado", { status: 401 });
  if (!tieneAcceso(usuario, "compras") && !tieneAcceso(usuario, "stock")) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  if (usuario.rol !== "admin") {
    const [sucursal] = await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, usuario.sucursalId!), eq(sucursales.activo, true))).limit(1);
    if (!sucursal) return new NextResponse("No autorizado", { status: 403 });
  }

  const { ruta } = await ctx.params;
  if (ruta.length !== 2 || ruta[0] !== "compras" || !/^[a-zA-Z0-9._-]+$/.test(ruta[1]) || ruta[1].includes("..")) return new NextResponse("Ruta inválida", { status: 400 });
  const url = `/api/uploads/compras/${ruta[1]}`;
  const [compra] = await db.select({ id: compras.id }).from(compras).where(and(eq(compras.imagen, url), usuario.rol === "admin" ? undefined : eq(compras.sucursalId, usuario.sucursalId!))).limit(1);
  if (!compra) return new NextResponse("No encontrado", { status: 404 });
  const destino = path.join(RAIZ, ...ruta);
  // Defensa contra path traversal: el archivo resuelto tiene que caer dentro
  // de la carpeta de subidas.
  if (!destino.startsWith(RAIZ + path.sep)) {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  const tipo = TIPOS[path.extname(destino).toLowerCase()];
  if (!tipo) return new NextResponse("Tipo no soportado", { status: 400 });

  try {
    const [info, datos] = await Promise.all([stat(destino), readFile(destino)]);
    return new NextResponse(new Uint8Array(datos), {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(info.size),
        // Los nombres llevan un sufijo aleatorio: el contenido nunca cambia.
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
