import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SizeOption {
  id: number;
  name: string;
}

interface SizeListPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sizes: SizeOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  title: string;
  searchPlaceholder?: string;
}

export function SizeListPicker({
  open,
  onOpenChange,
  sizes,
  selectedId,
  onSelect,
  title,
  searchPlaceholder = "Search sizes…",
}: SizeListPickerProps) {
  const [query, setQuery] = useState("");

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = query.trim()
    ? sizes.filter((s) =>
        s.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : sizes;

  function handleSelect(id: number) {
    onSelect(id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-1"
          autoFocus
        />
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No sizes match &ldquo;{query}&rdquo;
          </p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span>{s.name}</span>
                  {selectedId === s.id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
