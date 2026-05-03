import type { ReactNode } from "react";
import logoUrl from "@/assets/logo.png";

export function StaffAuthShell({
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
    <div className="min-h-[100dvh] bg-[#F5F7FA] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <img
            src={logoUrl}
            alt="Oasis Garden & Patio"
            className="h-14 w-auto object-contain"
          />
        </div>
        <div className="bg-white border border-slate-200 shadow-sm rounded-md p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </div>
        {footer && (
          <div className="text-center text-xs text-slate-500 mt-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
