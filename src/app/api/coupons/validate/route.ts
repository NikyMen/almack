import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Los cupones todavía no están configurados." }, { status: 400 });
}
