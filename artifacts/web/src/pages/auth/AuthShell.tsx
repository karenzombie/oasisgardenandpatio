import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full bg-muted/30 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border shadow-sm p-8 md:p-10">
          <div className="text-center mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight mb-3">
              {title}
            </h1>
            <div className="h-px w-12 bg-primary/40 mx-auto mb-4" />
            {subtitle && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </div>
        {footer && (
          <div className="text-center text-sm text-muted-foreground mt-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
