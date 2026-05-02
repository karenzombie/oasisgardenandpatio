import { Link } from "wouter";

export default function Warranty() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Warranty</span>
      </nav>

      <h1 className="font-serif text-4xl md:text-5xl mb-8">Warranty</h1>

      <div className="prose max-w-none text-foreground/80">
        <p>
          Every product we sell carries the original manufacturer's warranty.
          Coverage terms vary by brand, product line, and component (frame,
          fabric, hardware), so we recommend reviewing the warranty information
          for your specific item before purchase.
        </p>

        <h2>Frame warranties</h2>
        <p>
          Most premium aluminum and teak frames carry warranties of 5 to 15
          years against structural defects. Cast aluminum and wrought iron
          frames are typically covered against welds and finish defects.
        </p>

        <h2>Fabric & cushion warranties</h2>
        <p>
          Solution-dyed fabrics from Sunbrella® and similar premium mills carry
          a 5-year limited warranty against fading and degradation under normal
          outdoor conditions. See our{" "}
          <Link href="/fabrics" className="text-primary">fabrics page</Link> for
          care and warranty notes by mill.
        </p>

        <h2>Umbrella warranties</h2>
        <p>
          Treasure Garden umbrellas carry a one-year limited warranty on all
          components, with extended coverage on the frame. Sunbrella canopies
          are covered separately under the fabric warranty.
        </p>

        <h2>Filing a warranty claim</h2>
        <p>
          As your retailer, we'll handle the warranty claim with the
          manufacturer on your behalf. Please email{" "}
          <a href="mailto:sales@oasisgardenandpatio.com" className="text-primary">
            sales@oasisgardenandpatio.com
          </a>{" "}
          with photos of the issue and your order number, and we'll take it
          from there.
        </p>
      </div>
    </div>
  );
}
