import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useAdminListCategories,
  useAdminCreateCategory,
  useAdminUpdateCategory,
  useAdminSetCategoryActive,
  getAdminListCategoriesQueryKey,
  type AdminCategory,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { SortableHeader, sortRows, toggleSort, type SortState } from "../../lib/sortable";

type CategoriesSortKey = "name" | "slug" | "displayOrder";
import { PageBody, PageHeader } from "../../StaffShell";
import { uploadFile, getStaffObjectUrl } from "../../lib/upload";

const NO_PARENT = "__none__";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CategoryNode extends AdminCategory {
  children: CategoryNode[];
  depth: number;
}

function buildTree(rows: AdminCategory[]): CategoryNode[] {
  const byId = new Map<number, CategoryNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [], depth: 0 }));
  const roots: CategoryNode[] = [];
  byId.forEach((node) => {
    if (node.parentId !== null && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // recompute depths properly via BFS so multi-level nesting is correct
  function setDepth(node: CategoryNode, depth: number) {
    node.depth = depth;
    node.children.forEach((c) => setDepth(c, depth + 1));
  }
  roots.forEach((r) => setDepth(r, 0));
  // sort siblings by displayOrder then name
  function sortChildren(node: CategoryNode) {
    node.children.sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );
    node.children.forEach(sortChildren);
  }
  roots.sort(
    (a, b) =>
      a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
  roots.forEach(sortChildren);
  return roots;
}

function flattenForDisplay(
  roots: CategoryNode[],
  expanded: Set<number>,
): CategoryNode[] {
  const out: CategoryNode[] = [];
  function walk(node: CategoryNode) {
    out.push(node);
    if (expanded.has(node.id)) {
      node.children.forEach(walk);
    }
  }
  roots.forEach(walk);
  return out;
}

/** Recursively collect descendant ids for a category (used to hide invalid parent options). */
function collectDescendants(
  rows: AdminCategory[],
  rootId: number,
): Set<number> {
  const ids = new Set<number>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const r of rows) {
      if (r.parentId !== null && ids.has(r.parentId) && !ids.has(r.id)) {
        ids.add(r.id);
        added = true;
      }
    }
  }
  return ids;
}

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  parentId: string; // NO_PARENT or stringified id
  displayOrder: string;
  isActive: boolean;
  imageUrl: string | null;
}

function emptyForm(initialParent: number | null = null): FormState {
  return {
    name: "",
    slug: "",
    slugTouched: false,
    description: "",
    parentId: initialParent !== null ? String(initialParent) : NO_PARENT,
    displayOrder: "0",
    isActive: true,
    imageUrl: null,
  };
}

function formFromRow(row: AdminCategory): FormState {
  return {
    name: row.name,
    slug: row.slug,
    slugTouched: true,
    description: row.description ?? "",
    parentId: row.parentId !== null ? String(row.parentId) : NO_PARENT,
    displayOrder: String(row.displayOrder),
    isActive: row.isActive,
    imageUrl: row.imageUrl,
  };
}

export default function Categories() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListCategories({
    query: {
      queryKey: getAdminListCategoriesQueryKey(),
      staleTime: 10_000,
    },
  });
  const createMut = useAdminCreateCategory();
  const updateMut = useAdminUpdateCategory();
  const setActiveMut = useAdminSetCategoryActive();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] =
    useState<AdminCategory | null>(null);
  const [sort, setSort] = useState<SortState<CategoriesSortKey>>({ by: null, order: "desc" });
  const handleSort = (key: CategoriesSortKey) => setSort((prev) => toggleSort(prev, key));

  const rows = list.data ?? [];

  const visibleRows = useMemo(() => {
    if (showInactive) return rows;
    return rows.filter((r) => r.isActive);
  }, [rows, showInactive]);

  const tree = useMemo(() => buildTree(visibleRows), [visibleRows]);

  // When searching or sorting, flatten and filter/sort; otherwise use tree
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q || sort.by) {
      // flat list, no nesting indent
      const base = (q
        ? visibleRows.filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              r.slug.toLowerCase().includes(q),
          )
        : visibleRows
      ).map((r) => ({ ...r, children: [], depth: 0 }) as CategoryNode);
      return sortRows(base, sort, (row, key) => row[key]);
    }
    return flattenForDisplay(tree, expanded);
  }, [tree, expanded, search, visibleRows, sort]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function expandAll() {
    setExpanded(new Set(rows.map((r) => r.id)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  function openNew(parentId: number | null = null) {
    setEditing(null);
    setForm(emptyForm(parentId));
    setError(null);
    setOpen(true);
  }
  function openEdit(row: AdminCategory) {
    setEditing(row);
    setForm(formFromRow(row));
    setError(null);
    setOpen(true);
  }

  // Eligible parents in the dialog: exclude self + descendants
  const parentOptions = useMemo(() => {
    const exclude = editing
      ? collectDescendants(rows, editing.id)
      : new Set<number>();
    const tree2 = buildTree(rows.filter((r) => !exclude.has(r.id)));
    return flattenForDisplay(
      tree2,
      new Set(rows.map((r) => r.id)),
    );
  }, [rows, editing]);

  async function handleImage(file: File | null) {
    if (!file) {
      setForm((f) => ({ ...f, imageUrl: null }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.toast({
        variant: "destructive",
        title: "Wrong file type",
        description: "Please choose an image file.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.toast({
        variant: "destructive",
        title: "Too large",
        description: "Image must be under 5 MB.",
      });
      return;
    }
    setUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      setForm((f) => ({ ...f, imageUrl: objectPath }));
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    const slug = form.slug.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Slug must be lowercase letters, numbers, and dashes only");
      return;
    }
    const displayOrder = Number.parseInt(form.displayOrder, 10);
    if (Number.isNaN(displayOrder)) {
      setError("Display order must be a number");
      return;
    }
    const parentId =
      form.parentId === NO_PARENT ? null : Number.parseInt(form.parentId, 10);
    const payload = {
      name,
      slug,
      description: form.description.trim() || null,
      parentId,
      imageUrl: form.imageUrl,
      displayOrder,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast.toast({ title: "Category updated" });
      } else {
        await createMut.mutateAsync({ data: payload });
        toast.toast({ title: "Category created" });
      }
      await qc.invalidateQueries({
        queryKey: getAdminListCategoriesQueryKey(),
      });
      // keep parent expanded so user can see the result
      if (parentId !== null) {
        setExpanded((prev) => new Set(prev).add(parentId));
      }
      setOpen(false);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string } };
        message?: string;
      };
      const status = e?.response?.status;
      const apiMsg = e?.response?.data?.error;
      if (status === 409) {
        setError(apiMsg ?? "A category with that slug already exists.");
      } else if (status === 400) {
        setError(apiMsg ?? "Validation error.");
      } else {
        setError(apiMsg ?? e?.message ?? "Could not save category.");
      }
    }
  }

  async function toggleActive(row: AdminCategory, isActive: boolean) {
    try {
      await setActiveMut.mutateAsync({
        id: row.id,
        data: { isActive },
      });
      await qc.invalidateQueries({
        queryKey: getAdminListCategoriesQueryKey(),
      });
      toast.toast({
        title: isActive ? "Category activated" : "Category deactivated",
      });
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Could not update",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  const isSearching = search.trim().length > 0;
  const isFlat = isSearching || sort.by !== null;

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Organise your catalog. Create top-level categories like Patio Furniture, then nest sub-categories like Dining Sets."
        action={
          <Button
            onClick={() => openNew(null)}
            className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
          >
            <Plus className="size-4" />
            New category
          </Button>
        }
      />
      <PageBody>
        <div className="bg-white border border-slate-200 rounded-md">
          <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-b border-slate-100">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or slug…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-3">
              {!isFlat && (
                <>
                  <Button variant="ghost" size="sm" onClick={expandAll}>
                    Expand all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={collapseAll}>
                    Collapse all
                  </Button>
                </>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
                <Switch
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                Show inactive
              </label>
            </div>
          </div>

          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner className="size-6 text-[#1A3C5E]" />
            </div>
          ) : list.isError ? (
            <div className="p-12 text-center text-sm text-red-600">
              Could not load categories.{" "}
              <button
                className="underline"
                onClick={() => list.refetch()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {rows.length === 0
                ? "No categories yet. Click New category to add your first."
                : "No matches for your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>
                    <SortableHeader sortKey="name" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Name</SortableHeader>
                    <SortableHeader sortKey="slug" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Slug</SortableHeader>
                    <th className="px-4 py-2.5 font-medium w-24 text-center">
                      Products
                    </th>
                    <SortableHeader sortKey="displayOrder" state={sort} onSort={handleSort} align="center" className="px-4 py-2.5 font-medium w-20">Order</SortableHeader>
                    <th className="px-4 py-2.5 font-medium w-24">Status</th>
                    <th className="px-4 py-2.5 font-medium w-36 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayRows.map((node) => {
                    const hasChildren = node.children.length > 0;
                    const img = getStaffObjectUrl(node.imageUrl);
                    return (
                      <tr key={node.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          <div
                            className="flex items-center gap-2"
                            style={{
                              paddingLeft: isSearching
                                ? 0
                                : node.depth * 20,
                            }}
                          >
                            {!isSearching && hasChildren ? (
                              <button
                                onClick={() => toggle(node.id)}
                                className="size-5 flex items-center justify-center text-slate-500 hover:text-slate-900"
                                aria-label={
                                  expanded.has(node.id)
                                    ? "Collapse"
                                    : "Expand"
                                }
                                type="button"
                              >
                                {expanded.has(node.id) ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span className="size-5 inline-block" />
                            )}
                            {img ? (
                              <img
                                src={img}
                                alt=""
                                className="size-7 object-cover rounded border border-slate-200"
                              />
                            ) : (
                              <span className="size-7 rounded bg-slate-100 inline-block" />
                            )}
                            <span>{node.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">
                          {node.slug}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600">
                          {node.productCount}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600">
                          {node.displayOrder}
                        </td>
                        <td className="px-4 py-2.5">
                          {node.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openNew(node.id)}
                              title="Add sub-category"
                            >
                              <Plus className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(node)}
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {node.isActive ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeactivate(node)}
                                title="Deactivate"
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleActive(node, true)}
                                title="Reactivate"
                              >
                                <Power className="size-4 text-emerald-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageBody>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit category" : "New category"}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update this category's details."
                  : "Categories organise your products on the storefront."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="c-name">Name</Label>
                <Input
                  id="c-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: f.slugTouched ? f.slug : slugify(e.target.value),
                    }))
                  }
                  placeholder="Patio Furniture"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="c-slug">Slug</Label>
                <Input
                  id="c-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value,
                      slugTouched: true,
                    }))
                  }
                  placeholder="patio-furniture"
                  className="font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Lowercase letters, numbers, dashes only.
                </p>
              </div>

              <div>
                <Label htmlFor="c-parent">Parent category</Label>
                <Select
                  value={form.parentId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, parentId: v }))
                  }
                >
                  <SelectTrigger id="c-parent">
                    <SelectValue placeholder="Top level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>
                      Top level (no parent)
                    </SelectItem>
                    {parentOptions.map((opt) => (
                      <SelectItem key={opt.id} value={String(opt.id)}>
                        {"\u00A0\u00A0".repeat(opt.depth)}
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="c-desc">Description</Label>
                <Textarea
                  id="c-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={3}
                  placeholder="Optional — short blurb shown on the category page."
                />
              </div>

              <div>
                <Label htmlFor="c-order">Display order</Label>
                <Input
                  id="c-order"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayOrder: e.target.value }))
                  }
                  type="number"
                  min={0}
                  className="w-32"
                />
              </div>

              <div>
                <Label>Image</Label>
                <div className="mt-1 flex items-center gap-3">
                  {form.imageUrl ? (
                    <div className="relative">
                      <img
                        src={getStaffObjectUrl(form.imageUrl)}
                        alt="Category"
                        className="size-16 object-cover rounded border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleImage(null)}
                        className="absolute -top-2 -right-2 size-5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="size-16 rounded border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                      None
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) =>
                        handleImage(e.target.files?.[0] ?? null)
                      }
                    />
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50">
                      {uploading ? (
                        <>
                          <Spinner className="size-4" /> Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="size-4" />{" "}
                          {form.imageUrl ? "Replace" : "Upload"}
                        </>
                      )}
                    </div>
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Optional — appears on the category page. Max 5 MB.
                </p>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label htmlFor="c-active" className="cursor-pointer">
                    Active
                  </Label>
                  <p className="text-xs text-slate-500">
                    Inactive categories are hidden from the storefront.
                  </p>
                </div>
                <Switch
                  id="c-active"
                  checked={form.isActive}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, isActive: c }))
                  }
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate category?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.name} will be hidden from the storefront.
              {confirmDeactivate && confirmDeactivate.productCount > 0 && (
                <>
                  {" "}
                  {confirmDeactivate.productCount} product
                  {confirmDeactivate.productCount === 1 ? "" : "s"} in this
                  category will no longer be browsable by category. They keep
                  their data and can be re-categorised later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate) {
                  toggleActive(confirmDeactivate, false);
                  setConfirmDeactivate(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
