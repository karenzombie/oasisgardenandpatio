import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { GeoGate } from "@/components/GeoGate";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GeoGate>
      <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col w-full">{children}</main>
        <Footer />
      </div>
    </GeoGate>
  );
}
