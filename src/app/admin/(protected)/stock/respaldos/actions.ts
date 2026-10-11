"use server";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { guardarRespaldoStock } from "@/lib/respaldos-stock";
import { revalidatePath } from "next/cache";

export async function crearRespaldoManual() {
  const usuario = await requireAdmin();
  await db.transaction(tx => guardarRespaldoStock(tx, "Respaldo manual", usuario.nombre));
  revalidatePath("/admin/stock/respaldos");
}
