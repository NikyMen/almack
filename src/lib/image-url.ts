import { statSync } from "node:fs";
import path from "node:path";

/** Versiona imágenes locales para evitar caché cuando cambia el archivo. */
export function versionImageUrl(image: string): string {
  if (!image || !image.startsWith("/") || image.startsWith("//")) return image;

  const [pathname, query = ""] = image.split("?", 2);
  const filename = pathname.replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", filename);

  try {
    const file = statSync(filePath);
    const params = new URLSearchParams(query);
    params.set("v", `${file.size}-${Math.floor(file.mtimeMs)}`);
    return `${pathname}?${params.toString()}`;
  } catch {
    return image;
  }
}

/** Quita la versión agregada antes de guardar una URL en la base de datos. */
export function stripImageVersion(image: string): string {
  if (!image.startsWith("/") || image.startsWith("//")) return image;
  const [pathname, query = ""] = image.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("v");
  const remaining = params.toString();
  return `${pathname}${remaining ? `?${remaining}` : ""}`;
}
