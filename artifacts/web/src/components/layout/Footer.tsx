import { Link } from "wouter";
import logoImg from "@/assets/logo.png";

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground pt-16 pb-8 border-t border-border mt-auto">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Brand Col */}
          <div>
            <Link href="/" className="inline-block mb-6">
              <img
                src={logoImg}
                alt="Oasis Garden & Patio"
                className="h-12 object-contain filter brightness-0"
              />
            </Link>
            <p className="italic text-secondary-foreground/80 max-w-xs text-sm leading-relaxed mb-6">
              Family-owned outdoor patio furniture retailer in Santa Clarita, CA.
              Quietly confident craftsmanship for your outdoor living space.
            </p>
          </div>

          {/* Contact Col */}
          <div>
            <h3 className="font-bodoni italic text-xl mb-3">Experience the difference in person.</h3>
            <p className="text-secondary-foreground/80 text-sm leading-relaxed mb-6">
              Serving Santa Clarita for over 20 years. Step into our showroom to feel the quality, test the comfort, and let our experts help you design your perfect outdoor oasis.
            </p>
            <address className="not-italic text-secondary-foreground/80 text-sm space-y-3">
              <p>21182 Centre Pointe Pkwy #100<br/>Santa Clarita, CA 91350</p>
              <p>
                <a
                  href="https://www.google.com/maps/dir/?api=1&destination=21182+Centre+Pointe+Pkwy+%23100,+Santa+Clarita,+CA+91350"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors"
                >
                  Get Directions
                </a>
              </p>
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
            <h3 className="font-bodoni italic text-xl mb-6">Hours & Links</h3>
            <div className="text-secondary-foreground/80 text-sm mb-6 space-y-1">
              {(() => {
                const isDST = new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/Los_Angeles",
                  timeZoneName: "short",
                }).format(new Date()).includes("PDT");
                return isDST
                  ? <p>Sun–Sat: 10:00am – 6:00pm</p>
                  : <p>Sun–Sat: 10:00am – 5:00pm</p>;
              })()}
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link>
              </li>
              <li>
                <a href="/shipping-returns.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Shipping & Returns</a>
              </li>
              <li>
                <a href="/warranty.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Warranty</a>
              </li>
              <li>
                <a href="/privacy-policy.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Privacy Policy</a>
              </li>
              <li>
                <a href="/terms-conditions.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Terms & Conditions</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-secondary-foreground/10 pt-8 flex flex-col items-center md:items-start gap-2 text-xs text-secondary-foreground/60">
          <p className="text-sm font-bold">© {new Date().getFullYear()} Oasis Garden & Patio. All rights reserved.</p>
          <p>
            Built by Zombie Platforms LLC.{" "}
            <a
              href="https://zombieplatforms.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary transition-colors"
            >
              Learn more
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
