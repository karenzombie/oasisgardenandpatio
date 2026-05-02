import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function ComingSoon() {
  const [location] = useLocation();
  const pageName = location.replace('/', '').charAt(0).toUpperCase() + location.slice(2);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-24 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight">
          Coming Soon
        </h1>
        <div className="h-px w-16 bg-primary/40 mx-auto" />
        <p className="text-lg text-muted-foreground leading-relaxed">
          We are currently crafting our online experience for <span className="font-medium text-foreground">{pageName || "this section"}</span>. 
          Please check back soon or visit our Santa Clarita showroom to explore our collections in person.
        </p>
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button className="rounded-none px-8 font-serif bg-primary hover:bg-primary/90" asChild>
            <Link href="/">Return Home</Link>
          </Button>
          <Button variant="outline" className="rounded-none px-8 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-serif" asChild>
            <Link href="/contact">Visit Showroom</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
