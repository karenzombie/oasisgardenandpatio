import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useStaffSession } from "../../lib/staffSession";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Mail } from "lucide-react";
import {
  useGetCushionOrder,
  useUpdateCushionOrder,
  useSendCushionOrderEmail,
  getGetCushionOrderQueryKey,
  getListCushionOrdersQueryKey,
  type CushionOrderDetailStatus,
  type CushionOrderItemRow,
} from "@workspace/api-client-react";
import { PageHeader, PageBody } from "../../StaffShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABEL: Record<CushionOrderDetailStatus, string> = {
  submitted: "Submitted",
  in_review: "In Review",
  ordered: "Ordered",
  complete: "Complete",
};

const TYPE_LABEL: Record<string, string> = {
  hinged_chaise: "Hinged Chaise / Chair",
  club_chair: "Club Chair (Seat & Back)",
  trapezoid: "Trapezoid",
  bench: "Bench",
  ottoman: "Ottoman",
  dining_chair: "Dining Chair",
};

export default function CushionOrderDetail() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { user } = useStaffSession();
  const basePrefix =
    user?.role === "admin" ? "/admin/cushion-orders" : "/agent/cushion-orders";

  const { data, isLoading } = useGetCushionOrder(id);
  const update = useUpdateCushionOrder();
  const sendEmail = useSendCushionOrderEmail();

  const [status, setStatus] = useState<CushionOrderDetailStatus>("submitted");
  const [agentNotes, setAgentNotes] = useState("");
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setStatus(data.status);
      setAgentNotes(data.agentNotes ?? "");
    }
  }, [data]);

  if (isLoading || !data) {
    return (
      <PageBody>
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  async function save() {
    if (!data) return;
    await update.mutateAsync({
      id,
      data: { status, agentNotes: agentNotes.trim() || null },
    });
    await queryClient.invalidateQueries({
      queryKey: getGetCushionOrderQueryKey(id),
    });
    await queryClient.invalidateQueries({
      queryKey: getListCushionOrdersQueryKey(),
    });
    setSavedFlash("Saved.");
    setTimeout(() => setSavedFlash(null), 2000);
  }

  async function emailCustomer() {
    await sendEmail.mutateAsync({ id });
    setSavedFlash("Confirmation email re-sent to customer.");
    setTimeout(() => setSavedFlash(null), 2500);
  }

  return (
    <>
      <PageHeader
        title={`Cushion Order ${data.orderNumber}`}
        subtitle={`${data.customerName} · ${new Date(
          data.submittedAt,
        ).toLocaleString()}`}
        action={
          <Link href={basePrefix} className="text-sm flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> All cushion orders
          </Link>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Section title="Customer">
              <Field label="Name">{data.customerName}</Field>
              <Field label="Email">{data.customerEmail || "—"}</Field>
              <Field label="Phone">{data.customerPhone || "—"}</Field>
              {data.customerNotes && (
                <Field label="Customer notes">
                  <p className="whitespace-pre-wrap">{data.customerNotes}</p>
                </Field>
              )}
            </Section>

            {data.orderKind === "custom" && (
              <Section title="Fabric & Options">
                <Field label="Fabric">
                  {data.fabricName}
                  {data.fabricItemNumber && (
                    <span className="text-muted-foreground ml-2">
                      #{data.fabricItemNumber}
                    </span>
                  )}
                </Field>
                <Field label="Contrasting fabric">
                  {data.contrastingFabricName || "—"}
                </Field>
                <Field label="Ties">{data.ties || "—"}</Field>
                <Field label="Seat welt">{data.seatWelt || "—"}</Field>
                <Field label="Back welt">{data.backWelt || "—"}</Field>
                <Field label="Buttons">{data.buttons || "—"}</Field>
                <Field label="Tuft">{data.tuft || "—"}</Field>
                <Field label="Template available">
                  {data.templateAvailable || "—"}
                </Field>
              </Section>
            )}

            <Section title={`Items (${data.items.length})`}>
              {data.orderKind === "custom" ? (
                <CustomItemsTable items={data.items} />
              ) : (
                <StockItemsTable items={data.items} />
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Status">
              <div className="space-y-3">
                <Badge>{STATUS_LABEL[data.status]}</Badge>
                <div>
                  <Label>Update status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setStatus(v as CushionOrderDetailStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Internal notes</Label>
                  <Textarea
                    rows={4}
                    value={agentNotes}
                    onChange={(e) => setAgentNotes(e.target.value)}
                  />
                </div>
                <Button onClick={save} disabled={update.isPending} className="w-full">
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                {savedFlash && (
                  <p className="text-xs text-[hsl(var(--brand-green,142_30%_30%))]">
                    {savedFlash}
                  </p>
                )}
              </div>
            </Section>

            <Section title="Send & Export">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  asChild
                >
                  <a
                    href={`/api/cushions/orders/${data.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download vendor PDF
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={emailCustomer}
                  disabled={sendEmail.isPending || !data.customerEmail}
                >
                  <Mail className="w-4 h-4 mr-2" /> Resend customer confirmation
                </Button>
                {!data.customerEmail && (
                  <p className="text-xs text-muted-foreground">
                    No email on file for this customer.
                  </p>
                )}
              </div>
            </Section>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-4 space-y-3 text-sm">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-xs uppercase text-muted-foreground self-center">
        {label}
      </dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

function CustomItemsTable({ items }: { items: CushionOrderItemRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">a</th>
            <th className="py-2 pr-2">b</th>
            <th className="py-2 pr-2">c</th>
            <th className="py-2 pr-2">d</th>
            <th className="py-2 pr-2">e</th>
            <th className="py-2 pr-2">f</th>
            <th className="py-2 pr-2">Thick.</th>
            <th className="py-2 pr-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-border">
              <td className="py-2 pr-2 font-medium">
                {it.cushionType ? TYPE_LABEL[it.cushionType] ?? it.cushionType : "—"}
              </td>
              <td className="py-2 pr-2">{it.quantity}</td>
              <td className="py-2 pr-2">{it.measurementA ?? "—"}</td>
              <td className="py-2 pr-2">{it.measurementB ?? "—"}</td>
              <td className="py-2 pr-2">{it.measurementC ?? "—"}</td>
              <td className="py-2 pr-2">{it.measurementD ?? "—"}</td>
              <td className="py-2 pr-2">{it.measurementE ?? "—"}</td>
              <td className="py-2 pr-2">{it.measurementF ?? "—"}</td>
              <td className="py-2 pr-2">{it.thickness ?? "—"}</td>
              <td className="py-2 pr-2 text-muted-foreground">{it.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockItemsTable({ items }: { items: CushionOrderItemRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">Fabric</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-border">
              <td className="py-2 pr-2 font-medium">{it.productName ?? "—"}</td>
              <td className="py-2 pr-2 text-muted-foreground">{it.productSku ?? "—"}</td>
              <td className="py-2 pr-2">
                {it.fabricName ?? "—"}
                {it.fabricItemNumber && (
                  <span className="text-muted-foreground ml-1">
                    #{it.fabricItemNumber}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2">{it.quantity}</td>
              <td className="py-2 pr-2 text-muted-foreground">{it.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
