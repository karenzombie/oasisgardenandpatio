import { Link } from "wouter";

export default function ShippingReturns() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Shipping & Returns</span>
      </nav>

      <h1 className="font-serif text-4xl md:text-5xl mb-8">Shipping & Returns</h1>

      <div className="prose max-w-none text-foreground/80">
        <h2>Shipping</h2>
        <p>
          Most in-stock items ship within 3–5 business days. Larger pieces and
          umbrellas may ship via freight carrier and take 1–3 weeks to arrive
          depending on your location. We will always reach out to confirm
          delivery details before shipment.
        </p>
        <p>
          For local Santa Clarita customers, we offer white-glove delivery and
          installation. Please contact our showroom to arrange.
        </p>

        <h2>Returns</h2>
        <p>
          We want you to love what you bought. Most items may be returned in
          new, unused condition within 30 days of delivery for a refund of the
          purchase price (less original shipping costs).
        </p>
        <p>
          Custom orders, special-order fabrics, and clearance items are final
          sale and cannot be returned.
        </p>

        <h2>Damaged or Defective Items</h2>
        <p>
          Inspect your delivery upon arrival. If anything arrives damaged,
          please contact us within 48 hours so we can file a freight claim and
          arrange a replacement.
        </p>

        <h2>How to start a return</h2>
        <p>
          Email{" "}
          <a href="mailto:sales@oasisgardenandpatio.com" className="text-primary">
            sales@oasisgardenandpatio.com
          </a>{" "}
          or call{" "}
          <a href="tel:6612559909" className="text-primary">
            (661) 255-9909
          </a>{" "}
          with your order number and we'll walk you through the process.
        </p>
      </div>
    </div>
  );
}
