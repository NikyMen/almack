import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export function SectionCards({ items }: { items: { href: string; title: string; description: string; icon: LucideIcon }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-h-40 sm:min-h-48 xl:min-h-52 flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 xl:p-6 shadow-sm transition duration-300 ease-out hover:-translate-y-2 hover:border-orange-400 hover:bg-orange-50/60 hover:shadow-xl hover:shadow-orange-900/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500 motion-reduce:transform-none motion-reduce:transition-none">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-2xl bg-orange-50 p-3 text-orange-700 transition duration-300 group-hover:scale-110 group-hover:bg-orange-600 group-hover:text-white motion-reduce:transform-none motion-reduce:transition-none"><Icon className="h-7 w-7" aria-hidden="true" /></span>
            <ArrowUpRight className="h-5 w-5 text-slate-400 transition duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-orange-600 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold sm:text-xl text-navy transition-colors duration-300 group-hover:text-orange-700 motion-reduce:transition-none">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
        </Link>
      ))}
    </div>
  );
}
