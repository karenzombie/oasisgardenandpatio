import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

interface CheckboxGroupProps {
  label: string;
  options: FilterOption[];
  selected: string;
  onChange: (value: string) => void;
  defaultOpen?: boolean;
}

/**
 * Single-select checkbox facet used across all product browse screens
 * (Search, Shop/category, manufacturer product lists). Toggling the checked
 * option clears it. Combine different facets to narrow results.
 */
export function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
  defaultOpen = true,
}: CheckboxGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (options.length === 0) return null;

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <button
        className="w-full flex items-center justify-between text-left mb-3"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="text-xs uppercase tracking-widest font-semibold text-foreground">
          {label}
        </span>
        {open ? (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {options.map((opt) => {
            const checked = selected === opt.value;
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? "" : opt.value)}
                  className="size-3.5 rounded-sm accent-primary shrink-0"
                />
                <span
                  className={`text-sm leading-snug transition-colors ${
                    checked
                      ? "text-foreground font-medium"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
