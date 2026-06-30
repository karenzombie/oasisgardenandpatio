import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Users as UsersIcon } from "lucide-react";
import {
  useAdminListCustomers,
  useAdminCreateCustomer,
  useAdminGetCustomer,
  useAdminCreateCustomerAddress,
  getAdminListCustomersQueryKey,
  getAdminGetCustomerQueryKey,
  type AdminCustomer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

const PAGE_SIZE = 25;

export default function AgentCustomers() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useAdminListCustomers({
    ...(search ? { q: search } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Customers" subtitle="View and manage your customer records." />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, phone, or company…" className="pl-8" />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" /> New Customer
          </Button>
        </div>

        {list.isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <UsersIcon className="size-10 opacity-40" />
            <div>No customers yet.</div>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{c.firstName} {c.lastName}</td>
                      <td className="px-3 py-2">{c.email}</td>
                      <td className="px-3 py-2 text-slate-600">{c.phone ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{c.customerType}</td>
                      <td className="px-3 py-2 text-slate-600">{c.companyName ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditing(c)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm">
                <div className="text-slate-500">Page {page + 1} of {totalPages} · {total} total</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}

        <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} />
        <ViewCustomerDialog customer={editing} onClose={() => setEditing(null)} />
      </PageBody>
    </>
  );
}

function CreateCustomerDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMut = useAdminCreateCustomer();
  const addAddrMut = useAdminCreateCustomerAddress();

  const [form, setForm] = useState({
    email: "", firstName: "", lastName: "", phone: "",
    companyName: "", customerType: "residential",
    notes: "",
    street1: "", street2: "", city: "", state: "", zip: "",
  });

  function reset() {
    setForm({
      email: "", firstName: "", lastName: "", phone: "",
      companyName: "", customerType: "residential", notes: "",
      street1: "", street2: "", city: "", state: "", zip: "",
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const customer = await createMut.mutateAsync({
        data: {
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || null,
          companyName: form.companyName.trim() || null,
          customerType: form.customerType as "residential" | "commercial",
          notes: form.notes.trim() || null,
        },
      });
      if (form.street1.trim() && form.city.trim() && form.state.trim() && form.zip.trim()) {
        await addAddrMut.mutateAsync({
          id: customer.id,
          data: {
            type: "shipping",
            street1: form.street1.trim(),
            street2: form.street2.trim() || null,
            city: form.city.trim(),
            state: form.state.trim(),
            zip: form.zip.trim(),
            country: "US",
            isDefault: true,
          },
        });
      }
      toast({ title: "Customer created" });
      queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
      reset();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name *</Label>
              <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label>Last name *</Label>
              <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            <div><Label>Email *</Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Type</Label>
              <Select value={form.customerType} onValueChange={(v) => setForm({ ...form, customerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Company</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
          </div>
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-slate-500 uppercase mb-2">Default shipping address (optional)</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Street 1</Label>
                <Input value={form.street1} onChange={(e) => setForm({ ...form, street1: e.target.value })} /></div>
              <div className="col-span-2"><Label>Street 2</Label>
                <Input value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} /></div>
              <div><Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                <div><Label>ZIP</Label>
                  <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
              </div>
            </div>
          </div>
          <div><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase mb-0.5">{label}</div>
      <div className="text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

function ViewCustomerDialog({
  customer, onClose,
}: { customer: AdminCustomer | null; onClose: () => void }) {
  const open = customer !== null;

  const detail = useAdminGetCustomer(customer?.id ?? 0, {
    query: {
      queryKey: getAdminGetCustomerQueryKey(customer?.id ?? 0),
      enabled: open,
    },
  });

  const addresses = detail.data?.addresses ?? [];
  const billing = addresses.filter((a) => a.type === "billing");
  const shipping = addresses.filter((a) => a.type === "shipping");
  const other = addresses.filter(
    (a) => a.type !== "billing" && a.type !== "shipping",
  );

  function renderGroup(
    title: string,
    list: typeof addresses,
  ) {
    if (list.length === 0) return null;
    return (
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase mb-2">{title}</div>
        <ul className="space-y-2 text-sm">
          {list.map((a) => (
            <li key={a.id} className="border rounded p-2">
              {a.isDefault ? (
                <div className="text-[10px] uppercase text-slate-500">Default</div>
              ) : null}
              {a.recipientName ? <div>{a.recipientName}</div> : null}
              <div>{a.street1}{a.street2 ? `, ${a.street2}` : ""}</div>
              <div>{a.city}, {a.state} {a.zip}</div>
              {a.phone ? <div className="text-slate-500">{a.phone}</div> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Customer Details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Customer account details are managed by the customer from their
            account page and are read-only here.
          </p>
          {customer && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" value={customer.firstName} />
              <Field label="Last name" value={customer.lastName} />
              <Field label="Email" value={customer.email} />
              <Field label="Phone" value={customer.phone ?? ""} />
              <Field label="Type" value={customer.customerType} />
              <Field label="Company" value={customer.companyName ?? ""} />
              <div className="col-span-2">
                <Field label="Notes" value={customer.notes ?? ""} />
              </div>
            </div>
          )}

          {addresses.length > 0 && (
            <div className="border-t pt-3 space-y-4">
              {renderGroup("Billing Address", billing)}
              {renderGroup("Shipping Address", shipping)}
              {renderGroup("Other Addresses", other)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
