import { AlertasStock } from "@/components/alertas-stock";
import { MultiplicadorStock } from "@/components/stock-configuracion";
import { StockFilters } from "@/components/stock-filters";
import Link from "next/link";
import { requireAcceso } from "@/lib/auth";
import { esSuperAdmin, tieneAcceso } from "@/lib/permisos";
import { PageHeader } from "@/components/ui";
import { StockManager } from "@/components/stock-manager";
import { getContextoSucursal } from "@/lib/sucursal";
import { StockTransitoView, type LineaEnTransito } from "@/components/stock-transito-view";
import { SectionCards } from "@/components/section-cards";
import { listarStock, listarLineasTransito, ORDENES_STOCK, type OrdenStock } from "@/lib/stock-listado";
import { Boxes, ArrowLeftRight, Truck, TriangleAlert, PackagePlus, Archive } from "lucide-react";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ sucursal?: string; vista?: string; pagina?: string; buscar?: string; categoria?: string; orden?: string; todas?: string }> }) {
  const usuario = await requireAcceso("stock");
  const params = await searchParams;
  if (!params.vista && !params.sucursal) {
    return <>
      <PageHeader title="Stock" subtitle="Elegí cómo querés gestionar el inventario." />
      <SectionCards items={[
        ...(usuario.rol === "admin" ? [{ href: "/admin/stock/respaldos", title: "Respaldos", description: "Guardá y descargá copias del inventario y de las cargas. Solo admin.", icon: Archive }] : []),
        { href: "/admin/stock/carga", title: "Cargar stock", description: "Ingresá comprobantes y revisá cantidades, costos y precios antes de cargar.", icon: PackagePlus },
        { href: "/admin/stock?vista=alertas", title: "Alertas de stock", description: "Revisá faltantes y configurá los mínimos y precios de los productos.", icon: TriangleAlert },
        { href: "/admin/stock?vista=inventario", title: "Ver stock", description: "Consultá productos y existencias de cada sucursal.", icon: Boxes },
        ...(tieneAcceso(usuario, "movimientos") ? [{ href: "/admin/stock/mover", title: "Mover stock", description: "Trasladá mercadería entre sucursales y gestioná los remitos.", icon: ArrowLeftRight }] : []),
        { href: "/admin/stock?sucursal=transito", title: "Stock en tránsito", description: "Revisá la mercadería pendiente de recepción.", icon: Truck },
      ]} />
    </>;
  }
  const contexto = await getContextoSucursal();
  const { lista } = contexto;
  const modoAlertas = params.vista === "alertas";
  const prefijoVista = modoAlertas ? "vista=alertas&" : "";
  const parametro = params.sucursal;
  const administrador = esSuperAdmin(usuario);
  const modoTransito = parametro === "transito" || Boolean(parametro?.startsWith("transito-"));
  const destinoSolicitado = parametro?.startsWith("transito-") ? parametro.slice("transito-".length) : null;
  const destinoId = modoTransito
    ? administrador
      ? lista.find((s) => String(s.id) === destinoSolicitado)?.id ?? null
      : contexto.activaId
    : null;
  const destinoSeguro = administrador ? destinoId : contexto.activaId;
  const activaId = administrador && parametro && !modoTransito
    ? parametro === "todas" ? null : lista.find((s) => String(s.id) === parametro)?.id ?? contexto.activaId
    : contexto.activaId;
  const activa = lista.find((s) => s.id === activaId) ?? null;
  const destino = lista.find((s) => s.id === destinoSeguro) ?? null;

  const busqueda = (params.buscar ?? "").trim().slice(0, 100);
  const categoria = (params.categoria ?? "").slice(0, 100);
  const orden: OrdenStock = ORDENES_STOCK.includes(params.orden as OrdenStock) ? params.orden as OrdenStock : "recientes";
  const paginaSolicitada = Number(params.pagina);
  const pagina = Number.isSafeInteger(paginaSolicitada) && paginaSolicitada > 0 ? paginaSolicitada : 1;
  const mostrarTodasAlertas = modoAlertas && administrador && params.todas === "1";
  const listado = !modoTransito
    ? await listarStock({ pagina, busqueda, categoria: modoAlertas ? "" : categoria, orden: modoAlertas ? "recientes" : orden,
      sucursalId: activaId, administrador, soloAlertas: modoAlertas && !mostrarTodasAlertas, contarAlertas: modoAlertas })
    : null;
  const transito = modoTransito ? await listarLineasTransito(destinoSeguro, pagina) : null;
  const pendientes = transito?.filas ?? [];
  const nombres = new Map(lista.map((s) => [s.id, s.nombre]));
  const lineasEnTransito: LineaEnTransito[] = pendientes.map((p) => ({
    itemId: p.itemId,
    movimientoId: p.movimientoId,
    sku: p.sku,
    producto: p.producto,
    cantidad: p.cantidad,
    origen: nombres.get(p.origenId) ?? `Sucursal ${p.origenId}`,
    destino: nombres.get(p.destinoId) ?? `Sucursal ${p.destinoId}`,
    estado: p.estado === "rechazado" ? "rechazado" : "en_transito",
    creadoEn: p.creadoEn,
  }));

  const filas = listado?.filas ?? [];

  return (
    <>
      <Link href="/admin/stock" className="btn-ghost mb-4">← Opciones de stock</Link>
      <PageHeader
        title={modoAlertas ? "Alertas de stock" : "Stock"}
        subtitle={
          modoTransito
            ? destino ? `Mercadería pendiente para ${destino.nombre}.` : "Mercadería pendiente de todas las sucursales."
            : activa
            ? `Inventario de ${activa.nombre}.`
            : "Inventario consolidado de todas las sucursales."
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        <span className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">Vista</span>
        {administrador && (
          <div className="flex flex-wrap gap-1" aria-label="Elegir sucursal para ver stock">
            <Link href={`/admin/stock?${prefijoVista}sucursal=todas`} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${!modoTransito && !activaId ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>Todas</Link>
            {lista.map((s) => <Link key={s.id} href={`/admin/stock?${prefijoVista}sucursal=${s.id}`} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${!modoTransito && activaId === s.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s.nombre}</Link>)}
          </div>
        )}
        <Link href="/admin/stock?sucursal=transito" aria-current={modoTransito ? "page" : undefined} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${modoTransito ? "bg-amber-100 text-amber-900" : "text-slate-600 hover:bg-slate-100"}`}>Tránsito</Link>
        {tieneAcceso(usuario, "movimientos") && <Link href={`/admin/stock/mover?sucursal=${modoTransito ? destinoId ?? "todas" : activaId ?? "todas"}`} className="ml-auto rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">Mover stock →</Link>}
      </div>
      {administrador && !modoTransito && <MultiplicadorStock valor={listado?.multiplicador ?? null} />}
      {listado && !modoAlertas && <>
        <StockFilters busqueda={busqueda} categoria={categoria} orden={orden} categorias={listado.categorias} sucursal={params.sucursal} />
      </>}
      {modoTransito
        ? <StockTransitoView lineas={lineasEnTransito} sucursales={lista} destinoId={destinoSeguro} elegirDestino={administrador} unidades={transito?.unidades ?? 0} traslados={transito?.traslados ?? 0} total={transito?.total ?? 0} />
        : modoAlertas ? <AlertasStock items={filas} administrador={administrador} global={listado?.multiplicador ?? null} totalAlertas={listado?.totalAlertas ?? 0} total={listado?.total ?? 0} busqueda={busqueda} mostrarTodas={mostrarTodasAlertas} sucursal={params.sucursal} />
        : <StockManager items={filas} totalProductos={listado?.totalProductos ?? 0} totalResultados={listado?.total ?? 0} paginaActual={listado?.paginaActual ?? 1} paginas={listado?.paginas ?? 1} sucursales={lista} sucursalActivaId={activaId} administrador={administrador} multiplicadorGeneral={listado?.multiplicador ?? null} />}
      {listado && listado.paginas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de stock">
        {listado.paginaActual > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { vista: modoAlertas ? "alertas" : "inventario", ...(params.sucursal ? { sucursal: params.sucursal } : {}), ...(busqueda ? { buscar: busqueda } : {}), ...(!modoAlertas && categoria ? { categoria } : {}), ...(!modoAlertas ? { orden } : {}), ...(mostrarTodasAlertas ? { todas: "1" } : {}), pagina: listado.paginaActual - 1 } }}>← Anterior</Link>}
        <span className="text-sm text-slate-600">{listado.paginaActual} / {listado.paginas}</span>
        {listado.paginaActual < listado.paginas && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { vista: modoAlertas ? "alertas" : "inventario", ...(params.sucursal ? { sucursal: params.sucursal } : {}), ...(busqueda ? { buscar: busqueda } : {}), ...(!modoAlertas && categoria ? { categoria } : {}), ...(!modoAlertas ? { orden } : {}), ...(mostrarTodasAlertas ? { todas: "1" } : {}), pagina: listado.paginaActual + 1 } }}>Siguiente →</Link>}
      </nav>}
      {transito && transito.paginas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de tránsito">
        {transito.paginaActual > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { sucursal: params.sucursal ?? "transito", pagina: transito.paginaActual - 1 } }}>← Anterior</Link>}
        <span className="text-sm text-slate-600">{transito.paginaActual} / {transito.paginas}</span>
        {transito.paginaActual < transito.paginas && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { sucursal: params.sucursal ?? "transito", pagina: transito.paginaActual + 1 } }}>Siguiente →</Link>}
      </nav>}
    </>
  );
}
