import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askDeepSeek, aiHabilitado, MAX_HISTORY, MAX_MESSAGE_CHARS } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) })).min(1).max(MAX_HISTORY),
});

const hits = new Map<string, { count: number; resetAt: number }>();

function limited(req: NextRequest): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 12;
}

export async function POST(req: NextRequest) {
  if (!aiHabilitado()) return NextResponse.json({ error: "El asistente no está disponible." }, { status: 503 });
  if (limited(req)) return NextResponse.json({ error: "Esperá un momento antes de volver a consultar." }, { status: 429 });
  try {
    const parsed = schema.parse(await req.json());
    return NextResponse.json({ reply: await askDeepSeek(parsed.messages) });
  } catch (error) {
    console.error("[tienda/ai]", error);
    return NextResponse.json({ error: "No pudimos responderte ahora." }, { status: 502 });
  }
}
