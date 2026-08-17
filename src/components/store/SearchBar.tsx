"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export function SearchBar({ className = "" }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Sincroniza el input si la query cambia por navegación externa
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/tienda/productos?q=${encodeURIComponent(query)}` : "/tienda/productos");
  }

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-ink/40"
      />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar productos..."
        aria-label="Buscar productos"
        className="w-full rounded-full border border-black/10 bg-white py-2 pl-9 pr-4 text-sm text-brand-ink placeholder:text-brand-ink/40 focus:border-brand-red focus:outline-none"
      />
    </form>
  );
}
