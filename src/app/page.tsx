import { StoreHeader } from "@/components/store/StoreHeader";
import { BottomNav } from "@/components/store/BottomNav";
import { CartDrawer } from "@/components/store/CartDrawer";
import { SideMenu } from "@/components/store/SideMenu";
import { Footer } from "@/components/store/Footer";
import { VisitTracker } from "@/components/store/VisitTracker";
import { Toaster } from "@/components/store/Toaster";
import { FloatingActions } from "@/components/store/FloatingActions";
import TiendaHomePage from "./tienda/page";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <div className="gestoria-store flex min-h-screen flex-col bg-brand-cream"><VisitTracker /><StoreHeader /><main className="flex-1 pb-20 md:pb-12"><div className="mx-auto w-full max-w-6xl"><TiendaHomePage /></div></main><Footer /><div className="md:hidden"><BottomNav /></div><CartDrawer /><SideMenu /><FloatingActions /><Toaster /></div>;
}
