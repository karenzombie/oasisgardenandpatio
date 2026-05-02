import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground pt-16 pb-8 border-t border-border mt-auto">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Brand Col */}
          <div>
            <Link href="/" className="inline-block mb-6">
              <img
                src="/src/assets/logo.png"
                alt="Oasis Garden & Patio"
                className="h-12 object-contain filter brightness-0"
              />
            </Link>
            <p className="text-secondary-foreground/80 max-w-xs text-sm leading-relaxed mb-6">
              Family-owned outdoor patio furniture retailer in Santa Clarita, CA. 
              Quietly confident craftsmanship for your California outdoor living space.
            </p>
          </div>

          {/* Contact Col */}
          <div>
            <h3 className="font-serif text-xl font-medium mb-6">Visit Our Showroom</h3>
            <address className="not-italic text-secondary-foreground/80 text-sm space-y-3">
              <p>21182 Centre Pointe Pkwy #100<br/>Santa Clarita, CA 91350</p>
              <p>
                <a href="tel:6612559909" className="hover:text-primary transition-colors">(661) 255-9909</a>
              </p>
              <p>
                <a href="mailto:sales@oasisgardenandpatio.com" className="hover:text-primary transition-colors">sales@oasisgardenandpatio.com</a>
              </p>
            </address>
          </div>

          {/* Links Col */}
          <div>
            <h3 className="font-serif text-xl font-medium mb-6">Hours & Links</h3>
            <div className="text-secondary-foreground/80 text-sm mb-6 space-y-1">
              <p>Mon–Sat: 10am – 6pm</p>
              <p>Sun: 11am – 5pm</p>
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms-and-conditions" className="hover:text-primary transition-colors">Terms & Conditions</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-secondary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-secondary-foreground/60">
          <p>© {new Date().getFullYear()} Oasis Garden & Patio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
