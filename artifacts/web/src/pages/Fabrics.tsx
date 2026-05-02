import { Link } from "wouter";

export default function Fabrics() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Fabrics</span>
      </nav>

      <h1 className="font-serif text-4xl md:text-5xl mb-4">Fabrics</h1>
      <p className="text-muted-foreground mb-10 max-w-2xl">
        We work exclusively with solution-dyed performance fabrics from the
        leading outdoor mills. Stop by our showroom to see and feel the full
        range of patterns and weights.
      </p>

      <div className="prose max-w-none text-foreground/80">
        <h2>Sunbrella®</h2>
        <p>
          The category-defining solution-dyed acrylic. Color is locked into each
          fiber before it is woven, so the fabric resists fading from sun, salt,
          and chlorine. Excellent for cushions, umbrellas, and full-furniture
          slipcovers.
        </p>

        <h2>Outdura®</h2>
        <p>
          Solution-dyed acrylic with a softer hand and a strong line of
          contemporary patterns and textures. A great alternative to Sunbrella
          when you want a more textile-like feel.
        </p>

        <h2>Bella-Dura®</h2>
        <p>
          Solution-dyed olefin known for stain resistance and easy cleaning.
          Often used on commercial pieces and high-traffic residential
          applications.
        </p>

        <h2>Care</h2>
        <ul>
          <li>Brush off loose dirt regularly.</li>
          <li>Spot clean with mild soap and water.</li>
          <li>For deeper cleaning, remove covers and machine wash on cold, then air dry.</li>
          <li>
            Store cushions indoors during prolonged wet, smoky, or freezing
            weather to extend their life.
          </li>
        </ul>

        <h2>Warranty</h2>
        <p>
          Performance fabrics typically carry a 5-year limited warranty against
          fading. See our{" "}
          <Link href="/warranty" className="text-primary">warranty page</Link>{" "}
          for full details.
        </p>
      </div>
    </div>
  );
}
