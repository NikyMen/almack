import Image from "next/image";
import { cn } from "@/lib/cn";

/** Logo horizontal de Almack para encabezados y navegación. */
export function Logo({ className, variant = "horizontal" }: { className?: string; dark?: boolean; variant?: "horizontal" | "compact" }) {
  if (variant === "compact") {
    return (
      <Image
        src="/brand/almack-mascot-hd.png"
        alt="Almack"
        width={1254}
        height={1254}
        priority
        className={cn("h-11 w-11 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div className={cn("relative h-14 w-[190px] overflow-hidden rounded-lg bg-brand-red", className)}>
      <Image
        src="/brand/logo-almack-horizontal.png"
        alt="Almack"
        width={720}
        height={360}
        priority
        unoptimized
        className="h-full w-full object-contain"
      />
    </div>
  );
}
