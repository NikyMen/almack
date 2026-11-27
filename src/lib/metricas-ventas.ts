import { client } from "@/db";

// Métricas de ventas por período. Todo se calcula con consultas agregadas en
// la base: el navegador solo recibe filas ya sumadas y rankings con LIMIT.
//
// Criterios:
// - Solo cuentan ventas `completada` (quedan afuera canceladas, pendientes y
//   devueltas).
// - El costo es el `precio_compra` ACTUAL del producto: venta_items no guarda
//   el costo del momento, así que la ganancia es una estimación.
// - El ingreso de cada línea se prorratea con el total cobrado de la venta
//   (descuentos, promociones y correcciones de precio se aplican al total), así
//   la suma por producto o categoría coincide con lo facturado.
// - Con una categoría elegida, "ventas" es lo cobrado por los productos de esa
//   categoría y "tickets" los tickets que la incluyen.
// - Las fechas se agrupan en hora de Argentina (UTC-3, sin horario de verano).

export const ZONA_OFFSET_SEG = 3 * 3600;
export const TAMANO_PAGINA = 50;
const LIMITE_RANKING = 10;
const LIMITE_DISPERSION = 40;

export type Segmento = "minorista" | "mayorista" | "online";
export type Filtro = { desde: Date; hasta: Date; sucursalId: number | null; categoria?: string | null; segmento?: Segmento | null };

const n = (x: unknown) => Number(x ?? 0) || 0;
const s = (x: unknown) => (x == null ? "" : String(x));
const CATEGORIA = (alias: string) => `coalesce(nullif(trim(${alias}.categoria), ''), 'General')`;
const SEGMENTO = `case when canal = 'online' then 'online' when coalesce((select es_mayorista from sucursales where id = ventas.sucursal_id), 0) = 1 then 'mayorista' else 'minorista' end`;
const margen = (ganancia: number, ingreso: number) => (ingreso ? (ganancia / ingreso) * 100 : 0);

// CTEs compartidas. `v`: ventas del período; `ia`: todas sus líneas (para
// prorratear el total); `it`: las líneas de la categoría elegida (o todas);
// `lineas`: con ingreso prorrateado; `vg`: totales por venta.
function base(f: Filtro) {
  const args: (number | string)[] = [Math.floor(f.desde.getTime() / 1000), Math.floor(f.hasta.getTime() / 1000)];
  if (f.sucursalId) args.push(f.sucursalId);
  if (f.segmento) args.push(f.segmento);
  if (f.categoria) args.push(f.categoria);
  const sql = `with
  v as (
    select id, total, sucursal_id, caja_turno_id, canal, fecha from ventas
    where estado = 'completada' and fecha >= ? and fecha < ?${f.sucursalId ? " and sucursal_id = ?" : ""}${f.segmento ? ` and ${SEGMENTO} = ?` : ""}
  ),
  ia as (
    select vi.venta_id, vi.producto_id, vi.cantidad, ${CATEGORIA("p")} as categoria,
      vi.cantidad * vi.precio_unit as bruto,
      vi.cantidad * coalesce(p.precio_compra, 0) as costo
    from venta_items vi join v on v.id = vi.venta_id
    left join productos p on p.id = vi.producto_id
  ),
  fb as (select venta_id, sum(bruto) as bruto from ia group by venta_id),
  it as (select * from ia${f.categoria ? " where categoria = ?" : ""}),
  lineas as (
    select it.venta_id, it.producto_id, it.cantidad, it.costo, it.categoria,
      case when fb.bruto > 0 then it.bruto * v.total / fb.bruto else 0 end as ingreso
    from it join fb on fb.venta_id = it.venta_id join v on v.id = it.venta_id
  ),
  vg as (select venta_id, sum(ingreso - costo) as ganancia, sum(ingreso) as ingreso, sum(cantidad) as unidades from lineas group by venta_id)
`;
  return { sql, args };
}

async function q(f: Filtro, cuerpo: string, extra: (number | string)[] = []) {
  const b = base(f);
  const r = await client.execute({ sql: b.sql + cuerpo, args: [...b.args, ...extra] });
  return r.rows;
}

// Con categoría, el total de cada venta es lo cobrado por esa categoría y solo
// cuentan las ventas que la incluyen.
const totalVenta = (f: Filtro) => (f.categoria ? "vg.ingreso" : "v.total");
const unirVg = (f: Filtro) => (f.categoria ? "join" : "left join");

export type FilaGrupo = { clave: string; nombre: string; detalle: string; tickets: number; total: number; ticketPromedio: number; ganancia: number; margenPct: number };
type Acumulado = { tickets: number; total: number; ganancia: number; ingreso: number; unidades: number };
const vacio = (): Acumulado => ({ tickets: 0, total: 0, ganancia: 0, ingreso: 0, unidades: 0 });
const sumar = (a: Acumulado, b: Acumulado) => { a.tickets += b.tickets; a.total += b.total; a.ganancia += b.ganancia; a.ingreso += b.ingreso; a.unidades += b.unidades; };
const fila = (clave: string, nombre: string, detalle: string, a: Acumulado): FilaGrupo => ({
  clave, nombre, detalle, tickets: a.tickets, total: a.total, ticketPromedio: a.tickets ? a.total / a.tickets : 0, ganancia: a.ganancia, margenPct: margen(a.ganancia, a.ingreso),
});

// Una sola consulta sobre el período actual + el anterior (misma duración):
// agrupa por local × caja × canal (resumen, locales, cajas, segmentos), por
// día o mes (evolución de los dos períodos) y por día de semana × hora. Son a
// lo sumo unas centenas de filas ya sumadas en la base.
export type PuntoSerie = { periodo: string; tickets: number; total: number; ganancia: number };
export type CeldaHorario = { dia: number; hora: number; tickets: number; total: number };
export async function getTablero(f: Filtro, anteriorDesde: Date, porMes: boolean) {
  const corte = Math.floor(f.desde.getTime() / 1000);
  const formato = porMes ? "%Y-%m" : "%Y-%m-%d";
  const local = `vm.fecha - ${ZONA_OFFSET_SEG}`;
  const rows = await q({ ...f, desde: anteriorDesde }, `,
  vm as materialized (
    select v.id, v.sucursal_id, v.caja_turno_id, v.canal, v.fecha, case when v.fecha >= ? then 1 else 0 end as actual,
      ${totalVenta(f)} as tv, vg.ganancia, vg.ingreso, vg.unidades
    from v ${unirVg(f)} vg on vg.venta_id = v.id
  )
  select 'g' as tipo, vm.actual, vm.sucursal_id, s.nombre as sucursal, s.es_mayorista, c.id as caja_id, c.numero as caja_numero, cs.nombre as caja_sucursal, vm.canal,
      null as periodo, null as dia, null as hora,
      count(*) as tickets, coalesce(sum(vm.tv), 0) as total, coalesce(sum(vm.ganancia), 0) as ganancia, coalesce(sum(vm.ingreso), 0) as ingreso, coalesce(sum(vm.unidades), 0) as unidades
    from vm
    left join sucursales s on s.id = vm.sucursal_id
    left join caja_turnos t on t.id = vm.caja_turno_id
    left join cajas c on c.id = t.caja_id
    left join sucursales cs on cs.id = c.sucursal_id
    group by vm.actual, vm.sucursal_id, c.id, vm.canal
  union all
  select 's', vm.actual, null, null, null, null, null, null, null, strftime('${formato}', ${local}, 'unixepoch'), null, null,
      count(*), coalesce(sum(vm.tv), 0), coalesce(sum(vm.ganancia), 0), coalesce(sum(vm.ingreso), 0), 0
    from vm group by vm.actual, strftime('${formato}', ${local}, 'unixepoch')
  union all
  select 'h', 1, null, null, null, null, null, null, null, null,
      cast(strftime('%w', ${local}, 'unixepoch') as integer), cast(strftime('%H', ${local}, 'unixepoch') as integer),
      count(*), coalesce(sum(vm.tv), 0), 0, 0, 0
    from vm where vm.actual = 1 group by 11, 12
  limit 5000`, [corte]);
  return {
    actual: agruparTablero(rows.filter(r => r.tipo === "g" && n(r.actual) === 1)),
    anterior: agruparTablero(rows.filter(r => r.tipo === "g" && n(r.actual) === 0)),
    serie: serie(rows.filter(r => r.tipo === "s" && n(r.actual) === 1)),
    serieAnterior: serie(rows.filter(r => r.tipo === "s" && n(r.actual) === 0)),
    horarios: rows.filter(r => r.tipo === "h").map(r => ({ dia: n(r.dia), hora: n(r.hora), tickets: n(r.tickets), total: n(r.total) })) as CeldaHorario[],
  };
}

const serie = (rows: Record<string, unknown>[]): PuntoSerie[] =>
  rows.map(r => ({ periodo: s(r.periodo), tickets: n(r.tickets), total: n(r.total), ganancia: n(r.ganancia) })).sort((a, b) => a.periodo.localeCompare(b.periodo));

function agruparTablero(rows: Record<string, unknown>[]) {
  const resumen = vacio();
  const locales = new Map<string, { nombre: string; detalle: string; a: Acumulado }>();
  const cajas = new Map<string, { nombre: string; detalle: string; a: Acumulado }>();
  const segmentos = new Map<string, Acumulado>();
  const acumular = (m: Map<string, { nombre: string; detalle: string; a: Acumulado }>, clave: string, nombre: string, detalle: string, a: Acumulado) => {
    const e = m.get(clave) ?? { nombre, detalle, a: vacio() };
    sumar(e.a, a); m.set(clave, e);
  };
  for (const r of rows) {
    const a = { tickets: n(r.tickets), total: n(r.total), ganancia: n(r.ganancia), ingreso: n(r.ingreso), unidades: n(r.unidades) };
    sumar(resumen, a);
    const online = r.canal === "online";
    acumular(locales, String(r.sucursal_id ?? "sin"), s(r.sucursal) || "Sin sucursal", r.sucursal_id == null ? "Online o anteriores a sucursales" : r.es_mayorista ? "Mayorista" : "Minorista", a);
    if (r.caja_id != null) acumular(cajas, `c${n(r.caja_id)}`, `Caja ${n(r.caja_numero)}`, s(r.caja_sucursal), a);
    else if (online) acumular(cajas, "online", "Tienda online", "Pedidos web", a);
    else acumular(cajas, `sin-${r.sucursal_id ?? "x"}`, "Sin caja registrada", s(r.sucursal) || "Ventas anteriores al control de caja", a);
    const seg = online ? "online" : r.es_mayorista ? "mayorista" : "minorista";
    const e = segmentos.get(seg) ?? vacio(); sumar(e, a); segmentos.set(seg, e);
  }
  const lista = (m: Map<string, { nombre: string; detalle: string; a: Acumulado }>) => [...m].map(([k, e]) => fila(k, e.nombre, e.detalle, e.a)).sort((x, y) => y.total - x.total);
  const nombres: Record<string, string> = { minorista: "Minorista", mayorista: "Mayorista", online: "Online" };
  return {
    resumen: { ...fila("total", "Total", "", resumen), unidades: resumen.unidades },
    porLocal: lista(locales),
    porCaja: lista(cajas),
    // Orden fijo (no por monto) para que cada segmento conserve su color.
    porSegmento: (["minorista", "mayorista", "online"] as const).filter(k => segmentos.has(k)).map(k => fila(k, nombres[k], "", segmentos.get(k)!)),
  };
}

export type FilaCategoria = { categoria: string; unidades: number; ingreso: number; ganancia: number; margenPct: number; productos: number };
export type FilaProducto = { id: number; nombre: string; categoria: string; unidadMedida: string; unidades: number; ingreso: number; ganancia: number; margenPct: number; tickets: number };

// Una pasada por producto. Devuelve solo lo que se dibuja: los rankings (top 10
// por ganancia, margen, más y menos unidades), los 40 productos que más
// facturaron (para el gráfico volumen vs. margen) y las categorías agregadas.
export async function getProductos(f: Filtro) {
  const rows = await q(f, `,
  pp as materialized (
    select producto_id as id, max(categoria) as categoria, sum(cantidad) as unidades, sum(ingreso) as ingreso, sum(ingreso - costo) as ganancia, count(distinct venta_id) as tickets
    from lineas group by producto_id
  ),
  rk as (
    select pp.*,
      row_number() over (order by ganancia desc, ingreso desc) as rg,
      row_number() over (order by case when ingreso > 0 then ganancia / ingreso end desc nulls last, ingreso desc) as rp,
      row_number() over (order by unidades desc, ingreso desc) as rm,
      row_number() over (order by unidades asc, ingreso asc) as rl,
      row_number() over (order by ingreso desc) as rv
    from pp
  )
  select 'p' as tipo, rk.id, rk.unidades, rk.ingreso, rk.ganancia, rk.tickets, rk.rg, rk.rp, rk.rm, rk.rl, rk.rv, p.nombre, rk.categoria, p.unidad_medida, 0 as productos
  from rk left join productos p on p.id = rk.id
  where rk.rg <= ${LIMITE_RANKING} or rk.rp <= ${LIMITE_RANKING} or rk.rm <= ${LIMITE_RANKING} or rk.rl <= ${LIMITE_RANKING} or rk.rv <= ${LIMITE_DISPERSION}
  union all
  select 'c', null, sum(unidades), sum(ingreso), sum(ganancia), null, null, null, null, null, null, null, categoria, null, count(*)
  from pp group by categoria`);
  const categorias: FilaCategoria[] = rows.filter(r => r.tipo === "c")
    .map(r => ({ categoria: s(r.categoria), unidades: n(r.unidades), ingreso: n(r.ingreso), ganancia: n(r.ganancia), margenPct: margen(n(r.ganancia), n(r.ingreso)), productos: n(r.productos) }))
    .sort((a, b) => b.ingreso - a.ingreso);
  const productos = rows.filter(r => r.tipo === "p").map(r => ({
    rg: n(r.rg), rp: n(r.rp), rm: n(r.rm), rl: n(r.rl), rv: n(r.rv),
    p: { id: n(r.id), nombre: s(r.nombre) || `Producto #${n(r.id)}`, categoria: s(r.categoria) || "General", unidadMedida: s(r.unidad_medida) || "unidad", unidades: n(r.unidades), ingreso: n(r.ingreso), ganancia: n(r.ganancia), margenPct: margen(n(r.ganancia), n(r.ingreso)), tickets: n(r.tickets) } as FilaProducto,
  }));
  const top = (k: "rg" | "rp" | "rm" | "rl" | "rv", limite = LIMITE_RANKING) => productos.filter(x => x[k] <= limite).sort((a, b) => a[k] - b[k]).map(x => x.p);
  return {
    categorias,
    masGanancia: top("rg"), mejorMargen: top("rp"), masMovimiento: top("rm"), menosMovimiento: top("rl"),
    masVendidos: top("rv", LIMITE_DISPERSION),
  };
}

// Productos activos con stock que no tuvieron ni una venta en el período:
// mercadería (y plata) inmovilizada. Se pagina de a 50, ordenado por valor a
// costo, y se resume por categoría (el total sale de sumar ese resumen).
export type FilaSinVenta = { id: number; nombre: string; categoria: string; unidadMedida: string; stock: number; costo: number; valor: number };
export async function getSinVentas(f: Filtro, pagina: number) {
  const stock = f.sucursalId ? "coalesce(ss.cantidad, 0)" : "p.stock";
  const join = f.sucursalId ? "left join stock_sucursal ss on ss.producto_id = p.id and ss.sucursal_id = ?" : "";
  const extra: (number | string)[] = f.sucursalId ? [f.sucursalId] : [];
  if (f.categoria) extra.push(f.categoria);
  const desde = `from productos p ${join}
    where p.activo = 1 and ${stock} > 0${f.categoria ? ` and ${CATEGORIA("p")} = ?` : ""}
      and p.id not in (select producto_id from it where producto_id is not null)`;
  const cats = await q(f, `select ${CATEGORIA("p")} as categoria, count(*) as productos, coalesce(sum(${stock} * p.precio_compra), 0) as valor
    ${desde} group by 1 order by valor desc limit 200`, extra);
  const cantidad = cats.reduce((a, r) => a + n(r.productos), 0);
  const valor = cats.reduce((a, r) => a + n(r.valor), 0);
  const paginas = Math.max(1, Math.ceil(cantidad / TAMANO_PAGINA));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const rows = cantidad ? await q(f, `select p.id, p.nombre, ${CATEGORIA("p")} as categoria, p.unidad_medida, ${stock} as stock, p.precio_compra as costo, ${stock} * p.precio_compra as valor
    ${desde} order by valor desc, p.id limit ? offset ?`, [...extra, TAMANO_PAGINA, (actual - 1) * TAMANO_PAGINA]) : [];
  return {
    cantidad, valor, pagina: actual, paginas,
    filas: rows.map(r => ({ id: n(r.id), nombre: s(r.nombre), categoria: s(r.categoria), unidadMedida: s(r.unidad_medida) || "unidad", stock: n(r.stock), costo: n(r.costo), valor: n(r.valor) })) as FilaSinVenta[],
    porCategoria: cats.map(r => ({ categoria: s(r.categoria), productos: n(r.productos), valor: n(r.valor) })),
  };
}

// Categorías del catálogo activo, para el selector.
export async function getCategorias(): Promise<string[]> {
  const r = await client.execute(`select distinct ${CATEGORIA("p")} as categoria from productos p where p.activo = 1 order by 1 limit 200`);
  return r.rows.map(x => s(x.categoria));
}

// Fecha (unix) de la última venta completada antes de `antesDe`, para saltar
// a un período con datos cuando el elegido está vacío.
export async function getUltimaVentaAntes(antesDe: Date, sucursalId: number | null) {
  const r = await client.execute({
    sql: `select max(fecha) as fecha from ventas where estado = 'completada' and fecha < ?${sucursalId ? " and sucursal_id = ?" : ""}`,
    args: sucursalId ? [Math.floor(antesDe.getTime() / 1000), sucursalId] : [Math.floor(antesDe.getTime() / 1000)],
  });
  const fecha = r.rows[0]?.fecha;
  return fecha == null ? null : n(fecha);
}
