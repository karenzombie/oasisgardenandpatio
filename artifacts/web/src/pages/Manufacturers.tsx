import { Link } from "wouter";
import { useListManufacturers } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

export default function Manufacturers() {
  const { data, isLoading, isError } = useListManufacturers();
  const manufacturers = data ?? [];
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <div className="bg-background min-h-[60vh]">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <nav className="text-xs uppercase tracking-wide text-muted-foreground mb-4">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Manufacturers</span>
        </nav>

        <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight text-foreground mb-3">
          Manufacturers
        </h1>
        <p className="text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          We carry trusted outdoor furniture and fabric brands, hand-picked
          for quality and built to last in the California climate.
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            We could not load manufacturers right now. Please try again later.
          </p>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {manufacturers.map((m) => {
              const logoSrc = m.logoUrl
                ? m.logoUrl.startsWith("http")
                  ? m.logoUrl
                  : `${baseUrl.replace(/\/$/, "")}${m.logoUrl}`
                : null;
              return (
                <div
                  key={m.id}
                  className="group bg-card border border-border rounded-md p-5 flex flex-col items-center text-center"
                  aria-disabled="true"
                  title="Coming soon — products will be browseable by manufacturer"
                >
                  <div className="w-full aspect-[3/2] flex items-center justify-center bg-white rounded-sm overflow-hidden mb-4">
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={`${m.name} logo`}
                        className="max-w-[80%] max-h-[80%] object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="font-serif text-xl text-foreground/70">
                        {m.name}
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-base sm:text-lg text-foreground leading-tight">
                    {m.name}
                  </h2>
                  <span className="mt-2 text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground/70">
                    Browsing coming soon
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
