import { leerReglasStock } from "@/lib/reglas-stock";
import { AlertasStock } from "@/components/alertas-stock";
import { MultiplicadorStock } from "@/components/stock-configuracion";
import { db, productos, stockMovimientoItems, stockMovimientos } from "@/db";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { esSuperAdmin, tieneAcceso } from "@/lib/permisos";
import { PageHeader } from "@/components/ui";
import { StockManager, type ProductoConStock } from "@/components/stock-manager";
import { desgloseStock, desgloseTransito } from "@/lib/stock";
import { getContextoSucursal } from "@/lib/sucursal";
import { StockTransitoView, type LineaEnTransito } from "@/components/stock-transito-view";
import { SectionCards } from "@/components/section-cards";
import { listarStock, ORDENES_STOCK, type OrdenStock } from "@/lib/stock-listado";
import { Boxes, ArrowLeftRight, Truck, TriangleAlert, PackagePlus, Archive } from "lucide-react";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ sucursal?: string; vista?: string; pagina?: string; buscar?: string; categoria?: string; orden?: string }> }) {
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
  const listado = !modoAlertas && !modoTransito
    ? await listarStock({ pagina, busqueda, categoria, orden, sucursalId: activaId, administrador })
    : null;
  const [items, desglose, transito, config] = modoAlertas ? await Promise.all([
    db.select().from(productos).where(eq(productos.activo, true)).orderBy(desc(productos.id)),
    desgloseStock(), desgloseTransito(), leerReglasStock(),
  ]) : [[], new Map(), new Map(), { multiplicador: listado?.multiplicador ?? null, reglas: [] }];

  const pendientes = modoTransito ? await db
    .select({
      itemId: stockMovimientoItems.id,
      movimientoId: stockMovimientos.id,
      sku: productos.sku,
      producto: stockMovimientoItems.descripcion,
      cantidad: stockMovimientoItems.cantidad,
      origenId: stockMovimientos.origenId,
      destinoId: stockMovimientos.destinoId,
      estado: stockMovimientos.estado,
      creadoEn: stockMovimientos.creadoEn,
    })
    .from(stockMovimientoItems)
    .innerJoin(stockMovimientos, eq(stockMovimientoItems.movimientoId, stockMovimientos.id))
    .innerJoin(productos, eq(stockMovimientoItems.productoId, productos.id))
    .where(and(
      inArray(stockMovimientos.estado, ["en_transito", "rechazado"]),
      destinoSeguro ? eq(stockMovimientos.destinoId, destinoSeguro) : undefined,
    ))
    .orderBy(desc(stockMovimientos.id), stockMovimientoItems.id) : [];
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

  // En "Todas" la columna Stock es el total de la empresa; dentro de un local,
  // lo que hay en ese local y nada más.
  const filas: ProductoConStock[] = listado?.filas ?? items.map((p) => {
    const porSucursal: Record<number, number> = {};
    for (const d of desglose.get(p.id) ?? []) if (administrador || d.sucursalId === activaId) porSucursal[d.sucursalId] = d.cantidad;
    const transitoPorSucursal: Record<number, number> = {};
    for (const d of transito.get(p.id) ?? []) if (administrador || d.sucursalId === activaId) transitoPorSucursal[d.sucursalId] = d.cantidad;
    return {
      ...p,
      stock: administrador ? p.stock : (activaId ? porSucursal[activaId] ?? 0 : 0),
      alertaActiva: config.reglas.find(r => r.productoId === p.id)?.alertaActiva ?? true,
      multiplicadorCosto: config.reglas.find(r => r.productoId === p.id)?.multiplicador ?? null,
      porSucursal,
      transitoPorSucursal,
      stockLocal: activaId ? porSucursal[activaId] ?? 0 : p.stock,
      transitoLocal: activaId ? transitoPorSucursal[activaId] ?? 0 : Object.values(transitoPorSucursal).reduce((a, b) => a + b, 0),
    };
  });

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
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
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
      {administrador && !modoTransito && <MultiplicadorStock valor={config.multiplicador} />}
      {listado && <>
        <form action="/admin/stock" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value="inventario" />
          {params.sucursal && <input type="hidden" name="sucursal" value={params.sucursal} />}
          <label className="min-w-[180px] flex-1 text-xs text-slate-600">Buscar en todo el stock
            <input className="input mt-1" name="buscar" defaultValue={busqueda} maxLength={100} placeholder="Nombre, SKU, categoría o precio…" />
          </label>
          <label className="text-xs text-slate-600">Categoría
            <select className="input mt-1" name="categoria" defaultValue={categoria}><option value="">Todas</option>{listado.categorias.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="text-xs text-slate-600">Ordenar
            <select className="input mt-1" name="orden" defaultValue={orden}>
              <option value="recientes">Más recientes</option><option value="bajo">Stock bajo primero</option>
              <option value="stock_asc">Menor stock primero</option><option value="stock_desc">Mayor stock primero</option>
              <option value="precio_asc">Menor precio de venta</option><option value="precio_desc">Mayor precio de venta</option>
              <option value="transito_desc">Mayor stock en tránsito</option><option value="transito_asc">Menor stock en tránsito</option>
            </select>
          </label>
          <button className="btn-primary" type="submit">Aplicar</button>
        </form>
        <p className="mb-3 text-sm text-slate-500">{listado.total} resultado(s) · página {listado.paginaActual} de {listado.paginas}</p>
      </>}
      {modoTransito
        ? <StockTransitoView lineas={lineasEnTransito} sucursales={lista} destinoId={destinoSeguro} elegirDestino={administrador} />
        : modoAlertas ? <AlertasStock items={filas} administrador={administrador} global={config.multiplicador} />
        : <StockManager items={filas} totalProductos={listado?.totalProductos ?? 0} sucursales={lista} sucursalActivaId={activaId} administrador={administrador} multiplicadorGeneral={config.multiplicador} />}
      {listado && listado.paginas > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Páginas de stock">
        {listado.paginaActual > 1 && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { vista: "inventario", ...(params.sucursal ? { sucursal: params.sucursal } : {}), ...(busqueda ? { buscar: busqueda } : {}), ...(categoria ? { categoria } : {}), orden, pagina: listado.paginaActual - 1 } }}>← Anterior</Link>}
        <span className="text-sm text-slate-600">{listado.paginaActual} / {listado.paginas}</span>
        {listado.paginaActual < listado.paginas && <Link className="btn-ghost" href={{ pathname: "/admin/stock", query: { vista: "inventario", ...(params.sucursal ? { sucursal: params.sucursal } : {}), ...(busqueda ? { buscar: busqueda } : {}), ...(categoria ? { categoria } : {}), orden, pagina: listado.paginaActual + 1 } }}>Siguiente →</Link>}
      </nav>}
    </>
  );
}
