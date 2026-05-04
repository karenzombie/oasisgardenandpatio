import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import commercial1 from "@/assets/commercial-1.jpg";
import commercial2 from "@/assets/commercial-2.jpg";
import commercial3 from "@/assets/commercial-3.jpg";
import commercial4 from "@/assets/commercial-4.png";

const CONTACT_EMAIL = "sales@oasisgardenandpatio.com";

export default function Commercial() {
  return (
    <div className="bg-background min-h-[60vh]">
      {/* ── Intro section ─────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-10">
        <nav className="text-xs uppercase tracking-wide text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Commercial</span>
        </nav>

        <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight text-foreground mb-5">
          Commercial
        </h1>
        <p className="text-lg md:text-xl text-foreground/80 max-w-2xl leading-relaxed mb-10">
          Specializing in commercial sales, give us a call for your next
          project.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="default" className="rounded-none px-6 font-serif tracking-wide">
            <Link href="/">Return Home</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-none px-6 font-serif tracking-wide">
            <Link href="/contact">Visit Showroom</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-none px-6 font-serif tracking-wide"
          >
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </Button>
        </div>
      </div>

      {/* ── Wide hero image ────────────────────────────────────── */}
      <div className="w-full max-w-6xl mx-auto px-4 mb-10">
        <div className="w-full aspect-[3/1] overflow-hidden">
          <img
            src={commercial4}
            alt="Resort pool deck with commercial outdoor furniture at dusk"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      </div>

      {/* ── Three-up gallery ──────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="overflow-hidden aspect-square">
            <img
              src={commercial1}
              alt="Commercial resort chaise lounges at twilight"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              loading="lazy"
            />
          </div>
          <div className="overflow-hidden aspect-square">
            <img
              src={commercial2}
              alt="Beachside commercial umbrellas and chaise lounges"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              loading="lazy"
            />
          </div>
          <div className="overflow-hidden aspect-square">
            <img
              src={commercial3}
              alt="Hotel pool deck with commercial chaise lounges"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              loading="lazy"
            />
          </div>
        </div>

        {/* ── Call-to-action strip ─────────────────────────────── */}
        <div className="mt-14 border border-border rounded-sm p-8 md:p-12 text-center bg-muted/30">
          <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-3">
            Ready to start your project?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
            From boutique hotels to large resort properties, we supply the
            commercial-grade outdoor furniture your project demands. Get in
            touch and let's talk.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              asChild
              className="rounded-none px-8 font-serif tracking-wide"
            >
              <a href={`mailto:${CONTACT_EMAIL}`}>
                Email Us
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-none px-8 font-serif tracking-wide"
            >
              <a href="tel:6612559909">Call (661) 255-9909</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{CONTACT_EMAIL}</p>
        </div>
      </div>
    </div>
  );
}
