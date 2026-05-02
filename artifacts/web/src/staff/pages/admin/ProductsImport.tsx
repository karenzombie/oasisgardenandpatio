import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import Papa from "papaparse";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  PlayCircle,
  Loader2,
} from "lucide-react";
import {
  adminImportProductsDryRun,
  adminImportProductsCommit,
  type ImportProductsDryRunResult,
  type ImportProductsCommitResult,
  type ImportProductsRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getAdminListProductsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

type ProductField = keyof NonNullable<ImportProductsRequest["mapping"]>;

const REQUIRED_FIELDS: ProductField[] = [
  "name",
  "sku",
  "manufacturer",
  "category",
  "price",
];

const OPTIONAL_FIELDS: ProductField[] = [
  "slug",
  "shortDescription",
  "description",
  "cost",
  "weight",
  "dimensions",
  "onHand",
  "reorderThreshold",
  "featured",
  "availableOnline",
  "inStoreOnly",
];

const FIELD_LABELS: Record<ProductField, string> = {
  name: "Name *",
  sku: "SKU *",
  manufacturer: "Manufacturer (by name) *",
  category: "Category (by name) *",
  price: "Price *",
  slug: "Slug",
  shortDescription: "Short description",
  description: "Description",
  cost: "Cost",
  weight: "Weight",
  dimensions: "Dimensions",
  onHand: "On hand (initial stock)",
  reorderThreshold: "Reorder threshold",
  featured: "Featured (true/false)",
  availableOnline: "Available online (true/false)",
  inStoreOnly: "In-store only (true/false)",
};

// Auto-detect: lowercased CSV header → product field
const AUTO_DETECT: Record<string, ProductField> = {
  name: "name",
  "product name": "name",
  "item name": "name",
  title: "name",
  sku: "sku",
  "item sku": "sku",
  "product sku": "sku",
  "model number": "sku",
  model: "sku",
  slug: "slug",
  "url slug": "slug",
  manufacturer: "manufacturer",
  brand: "manufacturer",
  vendor: "manufacturer",
  category: "category",
  "product category": "category",
  cat: "category",
  "short description": "shortDescription",
  short_description: "shortDescription",
  description: "description",
  "long description": "description",
  details: "description",
  price: "price",
  "retail price": "price",
  msrp: "price",
  cost: "cost",
  "wholesale cost": "cost",
  "cost price": "cost",
  weight: "weight",
  dimensions: "dimensions",
  size: "dimensions",
  "on hand": "onHand",
  on_hand: "onHand",
  qty: "onHand",
  quantity: "onHand",
  stock: "onHand",
  "reorder threshold": "reorderThreshold",
  reorder_threshold: "reorderThreshold",
  "low stock": "reorderThreshold",
  featured: "featured",
  "available online": "availableOnline",
  available_online: "availableOnline",
  "in store only": "inStoreOnly",
  in_store_only: "inStoreOnly",
};

function autoMap(headers: string[]): Partial<Record<ProductField, string>> {
  const out: Partial<Record<ProductField, string>> = {};
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    const field = AUTO_DETECT[key];
    if (field && !out[field]) out[field] = h;
  }
  return out;
}

export default function ProductsImport() {
  const qc = useQueryClient();
  const toast = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ProductField, string>>>({});
  const [parseErr, setParseErr] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState<ImportProductsDryRunResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<ImportProductsCommitResult | null>(
    null,
  );

  function reset() {
    setFileName(null);
    setCsvText(null);
    setHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setParseErr(null);
    setDryRun(null);
    setCommitResult(null);
    setServerErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(file: File) {
    setParseErr(null);
    setDryRun(null);
    setCommitResult(null);
    setServerErr(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setParseErr("Could not read file");
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        preview: 5, // first 5 rows for preview only
      });
      if (result.errors.length > 0) {
        setParseErr(
          `CSV parse error: ${result.errors[0]?.message ?? "unknown"}`,
        );
        setHeaders([]);
        setPreviewRows([]);
        return;
      }
      const flds = result.meta.fields ?? [];
      setHeaders(flds);
      setPreviewRows(result.data);
      setMapping(autoMap(flds));
    };
    reader.readAsText(file);
  }

  const requiredMissing = REQUIRED_FIELDS.filter((f) => !mapping[f]);
  const canValidate = csvText !== null && requiredMissing.length === 0;
  const canCommit =
    dryRun !== null &&
    dryRun.errorCount === 0 &&
    dryRun.totalRows > 0 &&
    !committing;

  async function runValidate() {
    if (!csvText) return;
    setValidating(true);
    setServerErr(null);
    setDryRun(null);
    setCommitResult(null);
    try {
      const result = await adminImportProductsDryRun({
        csvText,
        mapping: mapping as ImportProductsRequest["mapping"],
      });
      setDryRun(result);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error ??
        (err as { message?: string })?.message ??
        "Validation failed";
      setServerErr(msg);
    } finally {
      setValidating(false);
    }
  }

  async function runCommit() {
    if (!csvText) return;
    setCommitting(true);
    setServerErr(null);
    setCommitResult(null);
    try {
      const result = await adminImportProductsCommit({
        csvText,
        mapping: mapping as ImportProductsRequest["mapping"],
      });
      setCommitResult(result);
      toast.toast({
        title: "Import complete",
        description: `Created ${result.createdCount}, updated ${result.updatedCount}.`,
      });
      await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error ??
        (err as { message?: string })?.message ??
        "Import failed";
      setServerErr(msg);
      toast.toast({
        variant: "destructive",
        title: "Import failed",
        description: msg,
      });
    } finally {
      setCommitting(false);
    }
  }

  const orderedFields = useMemo<ProductField[]>(
    () => [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS],
    [],
  );

  return (
    <>
      <PageHeader
        title="Import products from CSV"
        subtitle="Upload a vendor spreadsheet, map columns to product fields, validate, then commit."
        action={
          <Button
            variant="outline"
            onClick={() => navigate("/products")}
          >
            <ArrowLeft className="size-4" />
            Back to products
          </Button>
        }
      />
      <PageBody>
        <div className="space-y-6 max-w-6xl">
          {/* Step 1: File upload */}
          <section className="bg-white border border-slate-200 rounded-md p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-1">
              Step 1 · Upload CSV file
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              The first row should contain column headers.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-[#1A3C5E] file:text-white file:px-3 file:py-1.5 file:cursor-pointer hover:file:bg-[#15314c]"
                data-testid="input-csv-file"
              />
              {fileName && (
                <Button variant="outline" size="sm" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
            {fileName && (
              <p className="text-xs text-slate-500 mt-2">
                Loaded: <span className="font-medium">{fileName}</span>
                {previewRows.length > 0 && (
                  <> · {headers.length} columns · showing first {previewRows.length} rows</>
                )}
              </p>
            )}
            {parseErr && (
              <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="size-4" /> {parseErr}
              </p>
            )}
          </section>

          {/* Step 2: Preview + mapping */}
          {headers.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-md p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Step 2 · Map CSV columns to product fields
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Required fields are marked with <span className="text-red-600">*</span>.
                Manufacturer and category are matched by name (case-insensitive) and must
                already exist.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-5">
                {orderedFields.map((field) => {
                  const isRequired = REQUIRED_FIELDS.includes(field);
                  return (
                    <div key={field} className="flex items-center gap-3">
                      <label className="text-sm text-slate-700 w-44 shrink-0">
                        {FIELD_LABELS[field]}
                      </label>
                      <Select
                        value={mapping[field] ?? "__none__"}
                        onValueChange={(v) => {
                          setMapping((m) => {
                            const next = { ...m };
                            if (v === "__none__") delete next[field];
                            else next[field] = v;
                            return next;
                          });
                          setDryRun(null);
                          setCommitResult(null);
                        }}
                      >
                        <SelectTrigger
                          className={
                            isRequired && !mapping[field]
                              ? "border-red-300"
                              : undefined
                          }
                        >
                          <SelectValue placeholder="(not mapped)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">(not mapped)</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Sample preview table */}
              {previewRows.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">
                    Preview (first {previewRows.length} rows)
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 rounded">
                    <table className="text-xs min-w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          {headers.map((h) => (
                            <th
                              key={h}
                              className="px-2 py-1.5 text-left font-medium text-slate-700 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-t border-slate-100 odd:bg-white even:bg-slate-50/40"
                          >
                            {headers.map((h) => (
                              <td
                                key={h}
                                className="px-2 py-1 text-slate-700 max-w-xs truncate"
                                title={row[h] ?? ""}
                              >
                                {row[h] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Step 3: Validate */}
          {csvText && (
            <section className="bg-white border border-slate-200 rounded-md p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Step 3 · Validate (dry-run)
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Checks every row without writing anything. Fix all errors before committing.
              </p>
              {requiredMissing.length > 0 && (
                <p className="text-sm text-amber-700 mb-3 flex items-center gap-1">
                  <AlertTriangle className="size-4" />
                  Map all required fields first:{" "}
                  {requiredMissing.map((f) => FIELD_LABELS[f].replace(" *", "")).join(", ")}.
                </p>
              )}
              <Button
                disabled={!canValidate || validating}
                onClick={runValidate}
                className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
                data-testid="btn-validate"
              >
                {validating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlayCircle className="size-4" />
                )}
                Validate
              </Button>

              {serverErr && !dryRun && !commitResult && (
                <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
                  <AlertTriangle className="size-4" /> {serverErr}
                </p>
              )}

              {dryRun && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge variant="secondary">
                      Total: {dryRun.totalRows}
                    </Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                      Will create: {dryRun.willCreateCount}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                      Will update: {dryRun.willUpdateCount}
                    </Badge>
                    {dryRun.errorCount > 0 && (
                      <Badge variant="destructive">
                        Errors: {dryRun.errorCount}
                      </Badge>
                    )}
                  </div>
                  {dryRun.rows.some((r) => r.errors.length > 0) && (
                    <div className="border border-red-200 rounded overflow-hidden">
                      <div className="bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                        Errors found
                      </div>
                      <table className="text-xs min-w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium text-slate-700">
                              Row
                            </th>
                            <th className="px-2 py-1 text-left font-medium text-slate-700">
                              SKU
                            </th>
                            <th className="px-2 py-1 text-left font-medium text-slate-700">
                              Name
                            </th>
                            <th className="px-2 py-1 text-left font-medium text-slate-700">
                              Issues
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dryRun.rows
                            .filter((r) => r.errors.length > 0)
                            .map((r) => (
                              <tr
                                key={r.rowIndex}
                                className="border-t border-slate-100"
                              >
                                <td className="px-2 py-1 text-slate-700 align-top">
                                  {r.rowIndex}
                                </td>
                                <td className="px-2 py-1 text-slate-700 align-top">
                                  {r.sku ?? "—"}
                                </td>
                                <td className="px-2 py-1 text-slate-700 align-top">
                                  {r.name ?? "—"}
                                </td>
                                <td className="px-2 py-1 text-red-700">
                                  <ul className="list-disc list-inside space-y-0.5">
                                    {r.errors.map((e, i) => (
                                      <li key={i}>
                                        <span className="font-medium">
                                          {e.field}:
                                        </span>{" "}
                                        {e.message}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {dryRun.errorCount === 0 && dryRun.totalRows > 0 && (
                    <p className="text-sm text-emerald-700 flex items-center gap-1 mt-2">
                      <CheckCircle2 className="size-4" />
                      All rows valid. Ready to commit.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Step 4: Commit */}
          {dryRun && dryRun.totalRows > 0 && (
            <section className="bg-white border border-slate-200 rounded-md p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Step 4 · Commit
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Atomically writes all rows. If anything fails mid-way the entire batch is
                rolled back.
              </p>
              <Button
                disabled={!canCommit}
                onClick={runCommit}
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                data-testid="btn-commit"
              >
                {committing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Commit {dryRun.willCreateCount} new + {dryRun.willUpdateCount} updates
              </Button>

              {commitResult && (
                <div className="mt-4 border border-emerald-200 bg-emerald-50 rounded p-3 text-sm text-emerald-900">
                  <div className="flex items-center gap-1 font-medium">
                    <CheckCircle2 className="size-4" />
                    Import complete
                  </div>
                  <div className="mt-1">
                    Created: <strong>{commitResult.createdCount}</strong> · Updated:{" "}
                    <strong>{commitResult.updatedCount}</strong> · Total rows:{" "}
                    <strong>{commitResult.totalRows}</strong>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/products")}
                    >
                      View products
                    </Button>
                  </div>
                </div>
              )}

              {serverErr && commitResult === null && (
                <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
                  <AlertTriangle className="size-4" /> {serverErr}
                </p>
              )}
            </section>
          )}

          {!csvText && (
            <div className="text-sm text-slate-500 italic">
              Choose a CSV file above to begin.
            </div>
          )}

          {validating && !dryRun && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner className="size-4 text-[#1A3C5E]" />
              Validating…
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
