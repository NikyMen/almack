import { NextResponse } from "next/server";
import { mejorPromocion } from "@/lib/promociones";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { items?: { productId: string; qty: number }[] };
    const items = (body.items ?? []).map(i => ({ productoId: Number(i.productId), cantidad: Number(i.qty) })).filter(i => Number.isInteger(i.productoId) && i.productoId > 0 && Number.isFinite(i.cantidad) && i.cantidad > 0);
    const resultado = await mejorPromocion(items);
    return NextResponse.json(resultado?.quote ?? { automatic: false });
  } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
}
