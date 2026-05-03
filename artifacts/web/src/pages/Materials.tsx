import { Link } from "wouter";
import { useListMaterials } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

export default function Materials() {
  const { data, isLoading, isError } = useListMaterials();
  const materials = data ?? [];
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <div className="bg-background min-h-[60vh]">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <nav className="text-xs uppercase tracking-wide text-muted-foreground mb-4">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Materials</span>
        </nav>

        <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight text-foreground mb-3">
          Materials
        </h1>
        <p className="text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          Browse outdoor furniture by frame material. Each is built for years
          of California sun, wind, and weather.
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            We could not load materials right now. Please try again later.
          </p>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {materials.map((m) => {
              const imgSrc = m.imageUrl
                ? m.imageUrl.startsWith("http")
                  ? m.imageUrl
                  : `${baseUrl.replace(/\/$/, "")}${m.imageUrl}`
                : null;
              return (
                <div
                  key={m.id}
                  className="group bg-card border border-border rounded-md overflow-hidden flex flex-col"
                  aria-disabled="true"
                  title="Coming soon — products will be browseable by material"
                >
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={m.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h2 className="font-serif text-2xl text-foreground mb-1">
                      {m.name}
                    </h2>
                    {m.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {m.description}
                      </p>
                    )}
                    <span className="mt-4 text-xs uppercase tracking-wide text-muted-foreground/70">
                      Browsing coming soon
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
