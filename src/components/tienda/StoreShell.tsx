"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { useTiendaCart } from "@/store/tienda-cart";
import { useTiendaUI } from "@/store/tienda-ui";
import type { TiendaProducto } from "@/lib/tienda";
import { money } from "@/lib/format";

export function TiendaStoreShell({ children }: { children: ReactNode }) {
  const menuOpen = useTiendaUI((state) => state.menuOpen);
  const closeMenu = useTiendaUI((state) => state.closeMenu);
  const cartOpen = useTiendaUI((state) => state.cartOpen);
  const closeCart = useTiendaUI((state) => state.closeCart);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-ink">
      <TiendaHeader />
      <main className="mx-auto w-full max-w-6xl pb-20 md:pb-10">{children}</main>
      <TiendaFooter />
      <TiendaBottomNav />
      {menuOpen && <TiendaMenu onClose={closeMenu} />}
      {cartOpen && <TiendaCartDrawer onClose={closeCart} />}
      <TiendaAssistant />
    </div>
  );
}

function TiendaHeader() {
  const toggleMenu = useTiendaUI((state) => state.toggleMenu);
  const openCart = useTiendaUI((state) => state.openCart);
  const count = useTiendaCart((state) => state.count());
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
        <button type="button" onClick={toggleMenu} className="rounded-xl p-2 hover:bg-brand-cream md:hidden" aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        <Link href="/tienda" className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red text-lg font-black text-white">G</span>
          <span className="truncate text-base font-extrabold uppercase tracking-tight md:text-lg">Tienda GestorIA</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 text-sm font-semibold md:flex">
          <Link href="/tienda" className="hover:text-brand-red">Inicio</Link>
          <Link href="/tienda/productos" className="hover:text-brand-red">Productos</Link>
          <Link href="/tienda/ofertas" className="hover:text-brand-red">Ofertas</Link>
          <Link href="/tienda/sucursales" className="hover:text-brand-red">Sucursales</Link>
        </nav>
        <button type="button" onClick={openCart} className="relative ml-auto rounded-xl bg-brand-red p-2.5 text-white hover:bg-brand-dark md:ml-4" aria-label="Abrir carrito">
          <ShoppingBag size={20} />
          {count > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-brand-ink">{count}</span>}
        </button>
      </div>
    </header>
  );
}

function TiendaBottomNav() {
  const openCart = useTiendaUI((state) => state.openCart);
  const count = useTiendaCart((state) => state.count());
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_18px_rgba(0,0,0,.08)] md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around py-2 text-[11px] font-semibold">
        <Link href="/tienda" className="flex flex-col items-center gap-1 text-brand-red">Inicio</Link>
        <Link href="/tienda/productos" className="flex flex-col items-center gap-1 text-brand-ink/60">Productos</Link>
        <button type="button" onClick={openCart} className="relative flex flex-col items-center gap-1 text-brand-ink/60">
          Carrito{count > 0 && <span className="absolute -right-3 -top-1 rounded-full bg-brand-red px-1.5 text-[10px] text-white">{count}</span>}
        </button>
        <Link href="/tienda/sucursales" className="flex flex-col items-center gap-1 text-brand-ink/60">Sucursales</Link>
      </div>
    </nav>
  );
}

function TiendaMenu({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />
      <aside className="fixed inset-y-0 left-0 z-50 w-80 max-w-[88vw] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/10 pb-4">
          <span className="font-bold">Navegación</span>
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="rounded-lg p-2 hover:bg-brand-cream"><X size={20} /></button>
        </div>
        <nav className="grid gap-2 py-5 text-base font-semibold">
          {[['/tienda', 'Inicio'], ['/tienda/productos', 'Productos'], ['/tienda/ofertas', 'Ofertas'], ['/tienda/sucursales', 'Sucursales']].map(([href, label]) => (
            <Link key={href} href={href} onClick={onClose} className="rounded-xl px-3 py-3 hover:bg-brand-cream">{label}</Link>
          ))}
        </nav>
      </aside>
    </>
  );
}

export function TiendaProductCard({ product }: { product: TiendaProducto }) {
  const add = useTiendaCart((state) => state.add);
  const openCart = useTiendaUI((state) => state.openCart);
  const [added, setAdded] = useState(false);
  const unavailable = !product.available || product.stock <= 0;
  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-cream">
        <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        {product.badge && <span className="absolute left-3 top-3 rounded-full bg-brand-gold px-2.5 py-1 text-[11px] font-bold">{product.badge}</span>}
        {unavailable && <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">Sin stock</span>}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-red">{product.category}</p>
        <h3 className="mt-1 line-clamp-2 min-h-12 font-bold leading-tight">{product.name}</h3>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs text-brand-ink/60">{product.description || "Producto disponible en nuestra tienda."}</p>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <p className="text-xl font-extrabold">{money(product.price)}</p>
            {product.oldPrice && product.oldPrice > product.price && <p className="text-xs text-brand-ink/40 line-through">{money(product.oldPrice)}</p>}
          </div>
          <button type="button" disabled={unavailable} onClick={() => { add(product); setAdded(true); openCart(); }} className="rounded-xl bg-brand-red px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40">
            {added ? "Agregado" : "Agregar"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function TiendaProductGrid({ products }: { products: TiendaProducto[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)) : products;
  }, [products, query]);
  return (
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
        <Search size={18} className="text-brand-ink/40" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos..." className="w-full bg-transparent text-sm outline-none" />
      </div>
      {filtered.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{filtered.map((product) => <TiendaProductCard key={product.id} product={product} />)}</div> : <div className="rounded-2xl bg-white p-10 text-center text-sm text-brand-ink/60">No hay productos que coincidan.</div>}
    </div>
  );
}

function TiendaCartDrawer({ onClose }: { onClose: () => void }) {
  const lines = useTiendaCart((state) => state.lines);
  const setQty = useTiendaCart((state) => state.setQty);
  const remove = useTiendaCart((state) => state.remove);
  const clear = useTiendaCart((state) => state.clear);
  const total = useTiendaCart((state) => state.total());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [slot, setSlot] = useState("08-12");
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [checkoutId, setCheckoutId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!lines.length) return setError("Agregá al menos un producto.");
    if (name.trim().length < 2 || phone.trim().length < 6 || address.trim().length < 4) return setError("Completá nombre, WhatsApp y dirección.");
    setLoading(true);
    setError("");
    try {
      const attemptId = checkoutId || crypto.randomUUID();
      setCheckoutId(attemptId);
      const response = await fetch("/api/mp/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutId: attemptId,
          nombre: name.trim(),
          telefono: phone.trim(),
          direccion: address.trim(),
          franjaEntrega: slot,
          fechaEntrega: date,
          items: lines.map((line) => ({ productoId: Number(line.product.id), cantidad: line.qty })),
        }),
      });
      const data = (await response.json()) as { initPoint?: string; error?: string };
      if (!response.ok || !data.initPoint) throw new Error(data.error || "No se pudo iniciar el pago.");
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago.");
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" aria-label="Cerrar carrito" onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div><p className="font-bold">Tu carrito</p><p className="text-xs text-brand-ink/50">Stock validado al confirmar</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar carrito" className="rounded-lg p-2 hover:bg-brand-cream"><X size={20} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {!lines.length ? <div className="py-16 text-center text-sm text-brand-ink/50">Tu carrito está vacío.</div> : <div className="space-y-3">
            {lines.map((line) => <div key={line.product.id} className="flex items-center gap-3 rounded-xl border border-black/10 p-3">
              <img src={line.product.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{line.product.name}</p><p className="text-xs text-brand-ink/50">{money(line.product.price)} c/u</p></div>
              <div className="flex items-center gap-1"><button type="button" onClick={() => setQty(line.product.id, line.qty - 1)} className="rounded-lg p-1 hover:bg-brand-cream"><Minus size={14} /></button><span className="w-5 text-center text-sm">{line.qty}</span><button type="button" onClick={() => setQty(line.product.id, line.qty + 1)} className="rounded-lg p-1 hover:bg-brand-cream"><Plus size={14} /></button></div>
              <button type="button" onClick={() => remove(line.product.id)} aria-label="Quitar producto" className="rounded-lg p-1 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>)}
          </div>}
          {lines.length > 0 && <form onSubmit={checkout} className="mt-6 space-y-3 border-t border-black/10 pt-5">
            <h3 className="font-bold">Datos de entrega</h3>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" className="store-input" required />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="WhatsApp" className="store-input" required />
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Dirección, calle y altura" className="store-input" required />
            <div className="grid grid-cols-2 gap-2"><label className="text-xs text-brand-ink/60">Horario<select value={slot} onChange={(event) => setSlot(event.target.value)} className="store-input mt-1"><option value="08-12">08:00 a 12:00</option><option value="17-20">17:00 a 20:00</option></select></label><label className="text-xs text-brand-ink/60">Fecha<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} className="store-input mt-1" /></label></div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="flex items-center justify-between border-t border-black/10 pt-4"><span className="text-sm text-brand-ink/60">Total</span><strong className="text-2xl">{money(total)}</strong></div>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">{loading ? "Redirigiendo..." : "Pagar con MercadoPago"}</button>
            <button type="button" onClick={clear} className="w-full text-xs text-brand-ink/50 hover:text-brand-red">Vaciar carrito</button>
          </form>}
        </div>
      </aside>
    </>
  );
}

function TiendaAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([{ role: "assistant", content: "Hola. Preguntame por productos, precios o stock." }]);
  const [loading, setLoading] = useState(false);
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const response = await fetch("/api/tienda/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-12) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No disponible");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (error) { setMessages([...next, { role: "assistant", content: error instanceof Error ? error.message : "No pudimos responderte." }]); }
    finally { setLoading(false); }
  }
  return <div className="fixed bottom-20 right-4 z-30 md:bottom-6"><button type="button" onClick={() => setOpen((value) => !value)} className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-ink text-white shadow-lg hover:bg-brand-red" aria-label="Abrir asistente"><Bot size={22} /></button>{open && <div className="absolute bottom-14 right-0 flex h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"><header className="flex items-center justify-between bg-brand-cream px-4 py-3"><span className="text-sm font-bold">Asistente de tienda</span><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button></header><div className="flex-1 space-y-2 overflow-y-auto p-3">{messages.map((message, index) => <p key={index} className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${message.role === "user" ? "ml-auto bg-brand-red text-white" : "bg-brand-cream"}`}>{message.content}</p>)}{loading && <p className="text-xs text-brand-ink/50">Escribiendo...</p>}</div><form onSubmit={send} className="flex gap-2 border-t border-black/10 p-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribí tu consulta" maxLength={500} className="store-input" /><button type="submit" className="rounded-xl bg-brand-red px-3 text-white" aria-label="Enviar"><Send size={16} /></button></form></div>}</div>;
}

function TiendaFooter() {
  return <footer className="hidden border-t border-black/10 bg-brand-ink px-6 py-10 text-sm text-white/75 md:block"><div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3"><div><p className="text-lg font-extrabold text-white">Tienda GestorIA</p><p className="mt-2 max-w-xs">Productos publicados desde tu stock real, con pago online y entrega a domicilio.</p></div><div><p className="font-bold text-white">Navegación</p><div className="mt-2 grid gap-1"><Link href="/tienda/productos">Productos</Link><Link href="/tienda/ofertas">Ofertas</Link><Link href="/tienda/sucursales">Sucursales</Link></div></div><div><p className="font-bold text-white">Administración</p><p className="mt-2">El inventario se gestiona desde el panel protegido de GestorIA.</p></div></div></footer>;
}

export function StoreSearchLink() {
  return <Link href="/tienda/productos" className="inline-flex items-center gap-2 rounded-xl border border-white/50 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"><Search size={16} /> Ver catálogo</Link>;
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-brand-red hover:underline">{children}<ChevronRight size={16} /></Link>;
}

export function QuantityHint({ stock }: { stock: number }) {
  return <span className="inline-flex items-center gap-1 text-xs text-brand-ink/50"><PackageCheck size={13} /> {stock > 0 ? `${stock} disponibles` : "Sin stock"}</span>;
}
