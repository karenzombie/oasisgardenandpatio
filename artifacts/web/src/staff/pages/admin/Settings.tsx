import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import {
  useAdminGetSettings,
  useAdminUpdateSettings,
  getAdminGetSettingsQueryKey,
  type SystemSettings,
  type SystemSettingsUpdate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

type FormState = {
  defaultTaxRate: string;
  overdueVendorOrderThresholdDays: string;
  lowStockThreshold: string;
  defaultAgentDiscountCap: string;
  currentSequenceYear: string;
  currentYearOrderSequence: string;
};

function settingsToForm(s: SystemSettings): FormState {
  return {
    defaultTaxRate: (s.defaultTaxRate * 100).toFixed(4),
    overdueVendorOrderThresholdDays: String(s.overdueVendorOrderThresholdDays),
    lowStockThreshold: String(s.lowStockThreshold),
    defaultAgentDiscountCap: (s.defaultAgentDiscountCap * 100).toFixed(4),
    currentSequenceYear: String(s.currentSequenceYear),
    currentYearOrderSequence: String(s.currentYearOrderSequence),
  };
}

function buildUpdate(
  form: FormState,
  original: SystemSettings,
): { update: SystemSettingsUpdate; error: string | null } {
  const update: SystemSettingsUpdate = {};
  function num(raw: string): number | null {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  function int(raw: string): number | null {
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  }

  const tax = num(form.defaultTaxRate);
  if (tax === null) return { update, error: "Default tax rate is invalid." };
  const taxFrac = tax / 100;
  if (taxFrac < 0 || taxFrac > 1)
    return { update, error: "Tax rate must be between 0% and 100%." };
  if (Math.abs(taxFrac - original.defaultTaxRate) > 1e-9)
    update.defaultTaxRate = taxFrac;

  const overdue = int(form.overdueVendorOrderThresholdDays);
  if (overdue === null || overdue < 1)
    return { update, error: "Overdue threshold must be ≥ 1 day." };
  if (overdue !== original.overdueVendorOrderThresholdDays)
    update.overdueVendorOrderThresholdDays = overdue;

  const lowStock = int(form.lowStockThreshold);
  if (lowStock === null || lowStock < 0)
    return { update, error: "Low stock threshold must be ≥ 0." };
  if (lowStock !== original.lowStockThreshold)
    update.lowStockThreshold = lowStock;

  const agentCap = num(form.defaultAgentDiscountCap);
  if (agentCap === null) return { update, error: "Agent discount cap is invalid." };
  const agentCapFrac = agentCap / 100;
  if (agentCapFrac < 0 || agentCapFrac > 1)
    return { update, error: "Agent discount cap must be between 0% and 100%." };
  if (Math.abs(agentCapFrac - original.defaultAgentDiscountCap) > 1e-9)
    update.defaultAgentDiscountCap = agentCapFrac;

  const seqYr = int(form.currentSequenceYear);
  if (seqYr === null || seqYr < 2000 || seqYr > 2999)
    return { update, error: "Sequence year must be between 2000 and 2999." };
  if (seqYr !== original.currentSequenceYear)
    update.currentSequenceYear = seqYr;

  const seqNum = int(form.currentYearOrderSequence);
  if (seqNum === null || seqNum < 0)
    return { update, error: "Current order sequence must be ≥ 0." };
  if (seqNum !== original.currentYearOrderSequence)
    update.currentYearOrderSequence = seqNum;

  return { update, error: null };
}

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const settingsQ = useAdminGetSettings();
  const updateMut = useAdminUpdateSettings();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQ.data && form === null) {
      setForm(settingsToForm(settingsQ.data));
    }
  }, [settingsQ.data, form]);

  const dirty = useMemo(() => {
    if (!form || !settingsQ.data) return false;
    const { update } = buildUpdate(form, settingsQ.data);
    return Object.keys(update).length > 0;
  }, [form, settingsQ.data]);

  if (settingsQ.isLoading || !form || !settingsQ.data) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody>
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        </PageBody>
      </>
    );
  }
  if (settingsQ.isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody>
          <div className="text-rose-600">Failed to load settings.</div>
        </PageBody>
      </>
    );
  }

  const original = settingsQ.data;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const { update: payload, error: validationError } = buildUpdate(
      form,
      original,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    if (Object.keys(payload).length === 0) return;
    try {
      const fresh = await updateMut.mutateAsync({ data: payload });
      await qc.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
      setForm(settingsToForm(fresh));
      toast.toast({ title: "Settings saved" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <PageBody>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
          <Panel
            title="Tax"
            description="Sales tax applied to orders shipped to or picked up in California."
          >
            <Field
              id="taxRate"
              label="Default tax rate"
              suffix="%"
              hint="Santa Clarita default is 9.75%"
            >
              <Input
                id="taxRate"
                type="number"
                step="0.0001"
                min="0"
                max="100"
                value={form.defaultTaxRate}
                onChange={(e) => update("defaultTaxRate", e.target.value)}
              />
            </Field>
          </Panel>

          <Panel
            title="Inventory & Vendor"
            description="Thresholds used by inventory alerts and vendor order tracking."
          >
            <Field
              id="lowStock"
              label="Default low-stock threshold"
              hint="Used when a product has no per-product threshold set"
            >
              <Input
                id="lowStock"
                type="number"
                step="1"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => update("lowStockThreshold", e.target.value)}
              />
            </Field>
            <Field
              id="overdue"
              label="Overdue vendor order threshold"
              suffix="days"
              hint="Days after sending before a vendor order is flagged as overdue"
            >
              <Input
                id="overdue"
                type="number"
                step="1"
                min="1"
                value={form.overdueVendorOrderThresholdDays}
                onChange={(e) =>
                  update("overdueVendorOrderThresholdDays", e.target.value)
                }
              />
            </Field>
          </Panel>

          <Panel
            title="Sales agents"
            description="Defaults applied when creating new sales agents."
          >
            <Field
              id="agentCap"
              label="Default agent discount cap"
              suffix="%"
              hint="Maximum line discount an agent may apply unless overridden per agent"
            >
              <Input
                id="agentCap"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.defaultAgentDiscountCap}
                onChange={(e) =>
                  update("defaultAgentDiscountCap", e.target.value)
                }
              />
            </Field>
          </Panel>

          <Panel
            title="Order numbering"
            description="Controls the human-readable order number prefix and counter. Adjust with care — changing these affects all subsequently created orders."
          >
            <Field id="seqYr" label="Sequence year">
              <Input
                id="seqYr"
                type="number"
                step="1"
                min="2000"
                max="2999"
                value={form.currentSequenceYear}
                onChange={(e) => update("currentSequenceYear", e.target.value)}
              />
            </Field>
            <Field
              id="seqNum"
              label="Current order sequence"
              hint="Last allocated order number for this year"
            >
              <Input
                id="seqNum"
                type="number"
                step="1"
                min="0"
                value={form.currentYearOrderSequence}
                onChange={(e) =>
                  update("currentYearOrderSequence", e.target.value)
                }
              />
            </Field>
            <div className="text-xs text-slate-500 px-1">
              Next order will be{" "}
              <span className="font-mono font-semibold text-slate-700">
                {form.currentSequenceYear}-
                {String(
                  Number(form.currentYearOrderSequence || "0") + 1,
                ).padStart(5, "0")}
              </span>
            </div>
          </Panel>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 sticky bottom-0 bg-[#F5F7FA] py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForm(settingsToForm(original));
                setError(null);
              }}
              disabled={!dirty || updateMut.isPending}
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!dirty || updateMut.isPending}
            >
              <Save className="size-4 mr-1.5" />
              {updateMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border rounded-lg overflow-hidden">
      <header className="px-4 py-3 border-b">
        <div className="font-semibold text-slate-900 text-sm">{title}</div>
        {description && (
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
        )}
      </header>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  suffix,
  hint,
  children,
}: {
  id: string;
  label: string;
  suffix?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
      <Label htmlFor={id} className="sm:pt-2 text-slate-700">
        {label}
      </Label>
      <div className="sm:col-span-2 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 max-w-xs">{children}</div>
          {suffix && (
            <div className="text-xs text-slate-500 font-medium">{suffix}</div>
          )}
        </div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}
