import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL?.trim() || "file:gestoria.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (process.env.VERCEL && url.startsWith("file:")) {
  throw new Error(
    "Falta TURSO_DATABASE_URL en Vercel. SQLite local no es persistente en Vercel.",
  );
}

const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const db = drizzle(client, { schema });
export { client };
export * from "./schema";
