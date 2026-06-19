import type { ManufacturerAboutInfo } from "@/lib/manufacturerAbout";

interface ManufacturerAboutProps {
  name: string;
  logo: string | null;
  about: ManufacturerAboutInfo;
  /** Optional "N products" / "Loading…" label kept top-right, as before. */
  countLabel?: string;
}

/**
 * Brand info header rendered at the top of a manufacturer page, between the
 * breadcrumb and the "Shop by Type" section. Uses the site's existing type
 * scale, color tokens, and chip/divider styles — no new styling introduced.
 * Degrades gracefully: omits the meta line when founded/location are absent
 * and omits the stats row entirely when there are no stats.
 */
export function ManufacturerAbout({
  name,
  logo,
  about,
  countLabel,
}: ManufacturerAboutProps) {
  const metaParts: string[] = [];
  if (about.foundedYear) metaParts.push(`Founded ${about.foundedYear}`);
  if (about.location) metaParts.push(about.location);
  const metaLine = metaParts.join(" · ");

  const stats = about.stats.filter((s) => s.value?.trim());

  return (
    <div className="mb-10">
      <div className="flex flex-col sm:flex-row gap-6">
        {logo && (
          <div className="bg-white border border-border rounded-sm px-3 py-2 h-14 flex items-center shrink-0 self-start">
            <img src={logo} alt={`${name} logo`} className="h-9 w-auto object-contain" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-serif text-4xl md:text-5xl capitalize">{name}</h1>
            {countLabel ? (
              <p className="text-muted-foreground text-sm shrink-0 mt-3">
                {countLabel}
              </p>
            ) : null}
          </div>

          {metaLine ? (
            <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
              {metaLine}
            </p>
          ) : null}

          <p className="mt-2 text-muted-foreground">{about.tagline}</p>

          {about.pills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {about.pills.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-3 py-1"
                >
                  {pill}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm md:text-base leading-relaxed text-foreground/90 max-w-3xl">
            {about.about}
          </p>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="font-serif text-2xl md:text-3xl text-primary">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 h-px bg-border" />
    </div>
  );
}
