type IdentidadProducto = { id: number; sku: string; nombre: string };

export type GrupoDuplicados = {
  tipo: "codigo" | "nombre";
  clave: string;
  ids: number[];
};

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const palabras = (valor: string) => normalizar(valor).split(" ").filter(Boolean).sort();

function nombresSimilares(a: string, b: string) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.length < 2 || pb.length < 2) return normalizar(a) === normalizar(b);
  if (pa.join(" ") === pb.join(" ")) return true;
  const aa = new Set(pa);
  const bb = new Set(pb);
  const comunes = [...aa].filter(p => bb.has(p)).length;
  return comunes >= 2 && comunes / new Set([...aa, ...bb]).size >= 0.8;
}

export function agruparDuplicadosStock(productos: IdentidadProducto[]): GrupoDuplicados[] {
  const porCodigo = new Map<string, number[]>();
  for (const p of productos) {
    const codigo = normalizar(p.sku);
    // Los SKU generados automáticamente no representan un código de barras compartido.
    if (!codigo || /^sku \d+$/.test(codigo)) continue;
    porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), p.id]);
  }
  const gruposCodigo = [...porCodigo].filter(([, ids]) => ids.length > 1)
    .map(([clave, ids]): GrupoDuplicados => ({ tipo: "codigo", clave, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.clave.localeCompare(b.clave, "es"));

  // Los productos ya reunidos por código aparecen una sola vez. El resto se
  // agrupa por nombres iguales aunque cambie el orden de las palabras.
  const reunidos = new Set(gruposCodigo.flatMap(g => g.ids));
  const pendientes = productos.filter(p => !reunidos.has(p.id) && normalizar(p.nombre));
  const padre = pendientes.map((_, i) => i);
  const raiz = (i: number): number => padre[i] === i ? i : (padre[i] = raiz(padre[i]));
  for (let i = 0; i < pendientes.length; i++) {
    for (let j = i + 1; j < pendientes.length; j++) {
      if (nombresSimilares(pendientes[i].nombre, pendientes[j].nombre)) padre[raiz(j)] = raiz(i);
    }
  }
  const porNombre = new Map<number, number[]>();
  pendientes.forEach((p, i) => {
    const r = raiz(i);
    porNombre.set(r, [...(porNombre.get(r) ?? []), p.id]);
  });
  const gruposNombre = [...porNombre.values()].filter(ids => ids.length > 1)
    .map((ids): GrupoDuplicados => ({ tipo: "nombre", clave: pendientes.find(p => p.id === ids[0])!.nombre, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.clave.localeCompare(b.clave, "es"));
  return [...gruposCodigo, ...gruposNombre];
}
