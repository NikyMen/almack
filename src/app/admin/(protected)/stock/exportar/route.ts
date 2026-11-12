import { requireAcceso } from "@/lib/auth";
import { esSuperAdmin } from "@/lib/permisos";
import { getContextoSucursal } from "@/lib/sucursal";
import { listarStock, ORDENES_STOCK, type OrdenStock } from "@/lib/stock-listado";
import { crearExcelStock } from "@/lib/exportar-stock";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const usuario = await requireAcceso("stock");
  const administrador = esSuperAdmin(usuario);
  const contexto = await getContextoSucursal();
  const params = new URL(request.url).searchParams;
  const parametro = params.get("sucursal");
  const sucursalId = administrador && parametro
    ? parametro === "todas" ? null : contexto.lista.find(s => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const busqueda = (params.get("buscar") ?? "").trim().slice(0, 100);
  const categoria = (params.get("categoria") ?? "").slice(0, 100);
  const ordenSolicitado = params.get("orden") as OrdenStock;
  const orden = ORDENES_STOCK.includes(ordenSolicitado) ? ordenSolicitado : "recientes";
  const listado = await listarStock({ pagina: 1, busqueda, categoria, orden, sucursalId, administrador, sinPaginacion: true });
  const archivo = await crearExcelStock(listado.filas, contexto.lista, sucursalId);
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-${fecha}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
