import { useState, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminApproveHeldPayment,
  useAdminDeclineHeldPayment,
  useAdminCreateOrderPayment,
  useAdminMarkOrderPaidInFull,
  useAdminUpdateOrderPayment,
  useAdminDeleteOrderPayment,
  getAdminGetOrderQueryKey,
  type AdminOrderPayment,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit card" },
  { value: "debit_card", label: "Debit card" },
  { value: "ach", label: "ACH / Bank transfer" },
  { value: "wire", label: "Wire" },
  { value: "financing", label: "Financing" },
  { value: "store_credit", label: "Store credit" },
  { value: "gift_card", label: "Gift card" },
  { value: "other", label: "Other" },
];

const PAYMENT_STATUSES: Array<{ value: string; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
  { value: "voided", label: "Voided" },
];

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function methodLabel(v: string): string {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v;
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const AVS_LABEL: Record<string, string> = {
  X: "Match",
  Y: "Match",
  A: "Partial match",
  W: "Partial match",
  Z: "Partial match",
  N: "Mismatch",
  B: "Not checked",
  E: "Not checked",
  G: "Not checked",
  P: "Not checked",
  R: "Not checked",
  S: "Not checked",
  U: "Not checked",
};

const CVV_LABEL: Record<string, string> = {
  M: "Match",
  N: "Mismatch",
  P: "Not checked",
  S: "Not provided",
  U: "Not checked",
  X: "Not checked",
};

function avsLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return AVS_LABEL[code.toUpperCase()] ?? `Unknown (${code})`;
}

function cvvLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return CVV_LABEL[code.toUpperCase()] ?? `Unknown (${code})`;
}

function ApiStatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        Paid
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-500">
        Under review
      </Badge>
    );
  }
  if (status === "voided" || status === "failed") {
    return <Badge variant="destructive">Not completed</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

type FormState = {
  amount: string;
  paymentMethod: string;
  status: string;
  transactionId: string;
  cardLast4: string;
  cardType: string;
  notes: string;
  receivedAt: string;
};

const EMPTY_FORM: FormState = {
  amount: "",
  paymentMethod: "cash",
  status: "completed",
  transactionId: "",
  cardLast4: "",
  cardType: "",
  notes: "",
  receivedAt: "",
};

function paymentToForm(p: AdminOrderPayment): FormState {
  return {
    amount: String(p.amount),
    paymentMethod: p.paymentMethod,
    status: p.status,
    transactionId: p.transactionId ?? "",
    cardLast4: p.cardLast4 ?? "",
    cardType: p.cardType ?? "",
    notes: p.notes ?? "",
    receivedAt: toLocalInputValue(p.receivedAt),
  };
}

type EditState =
  | { mode: "create" }
  | { mode: "edit"; payment: AdminOrderPayment };

interface Props {
  orderId: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  paidInFull: boolean;
  payments: AdminOrderPayment[];
}

export default function PaymentsPanel({
  orderId,
  total,
  amountPaid,
  balanceDue,
  paidInFull,
  payments,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const detailKey = getAdminGetOrderQueryKey(orderId);

  const [editing, setEditing] = useState<EditState | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<AdminOrderPayment | null>(
    null,
  );
  const [markFullOpen, setMarkFullOpen] = useState(false);
  const [markFullForm, setMarkFullForm] = useState<FormState>({
    ...EMPTY_FORM,
    paymentMethod: "cash",
  });

  const [confirmAction, setConfirmAction] = useState<{
    paymentId: number;
    action: "approve" | "decline";
    amount: number;
  } | null>(null);

  const createMut = useAdminCreateOrderPayment();
  const updateMut = useAdminUpdateOrderPayment();
  const deleteMut = useAdminDeleteOrderPayment();
  const markFullMut = useAdminMarkOrderPaidInFull();
  const approveMut = useAdminApproveHeldPayment();
  const declineMut = useAdminDeclineHeldPayment();

  const hasLiveApiHold = payments.some(
    (p) => p.isApiPayment && p.status === "pending",
  );

  function handleGatewayAction() {
    if (!confirmAction) return;
    const mut =
      confirmAction.action === "approve" ? approveMut : declineMut;
    mut.mutate(
      { id: orderId, paymentId: confirmAction.paymentId },
      {
        onSuccess: (data) => {
          qc.setQueryData(detailKey, data);
          setConfirmAction(null);
          toast({
            title:
              confirmAction.action === "approve"
                ? "Payment approved"
                : "Payment declined",
          });
        },
        onError: (err) => {
          toast({
            title: "Gateway error",
            description: errMsg(err),
            variant: "destructive",
          });
          setConfirmAction(null);
        },
      },
    );
  }

  function openCreate(prefillBalance: boolean) {
    setForm({
      ...EMPTY_FORM,
      amount: prefillBalance && balanceDue > 0 ? balanceDue.toFixed(2) : "",
    });
    setEditing({ mode: "create" });
  }

  function openEdit(p: AdminOrderPayment) {
    setForm(paymentToForm(p));
    setEditing({ mode: "edit", payment: p });
  }

  function close() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function buildPayload() {
    const amount = Number(form.amount);
    return {
      amount,
      paymentMethod: form.paymentMethod,
      status: form.status,
      transactionId: form.transactionId.trim() || null,
      cardLast4: form.cardLast4.trim() || null,
      cardType: form.cardType.trim() || null,
      notes: form.notes.trim() || null,
      receivedAt: fromLocalInputValue(form.receivedAt),
    };
  }

  function handleSave() {
    if (!editing) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter an amount greater than zero.",
        variant: "destructive",
      });
      return;
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) {
      toast({
        title: "Invalid amount",
        description: "Amount may have at most two decimal places.",
        variant: "destructive",
      });
      return;
    }
    const payload = buildPayload();
    if (editing.mode === "create") {
      createMut.mutate(
        { id: orderId, data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: detailKey });
            toast({ title: "Payment recorded" });
            close();
          },
          onError: (err: unknown) => {
            toast({
              title: "Could not record payment",
              description: errMsg(err),
              variant: "destructive",
            });
          },
        },
      );
    } else {
      updateMut.mutate(
        {
          id: orderId,
          paymentId: editing.payment.id,
          data: payload,
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: detailKey });
            toast({ title: "Payment updated" });
            close();
          },
          onError: (err: unknown) => {
            toast({
              title: "Could not update payment",
              description: errMsg(err),
              variant: "destructive",
            });
          },
        },
      );
    }
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteMut.mutate(
      { id: orderId, paymentId: confirmDelete.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: detailKey });
          toast({ title: "Payment removed" });
          setConfirmDelete(null);
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not remove payment",
            description: errMsg(err),
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleMarkPaidInFull() {
    markFullMut.mutate(
      {
        id: orderId,
        data: {
          paymentMethod: markFullForm.paymentMethod,
          transactionId: markFullForm.transactionId.trim() || null,
          cardLast4: markFullForm.cardLast4.trim() || null,
          cardType: markFullForm.cardType.trim() || null,
          notes: markFullForm.notes.trim() || null,
          receivedAt: fromLocalInputValue(markFullForm.receivedAt),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: detailKey });
          toast({ title: "Order marked paid in full" });
          setMarkFullOpen(false);
          setMarkFullForm({ ...EMPTY_FORM, paymentMethod: "cash" });
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not mark paid in full",
            description: errMsg(err),
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Payments
          </h3>
          {paidInFull ? (
            <Badge className="bg-emerald-600 text-white">Paid in full</Badge>
          ) : amountPaid > 0 ? (
            <Badge variant="secondary">Partial</Badge>
          ) : (
            <Badge variant="outline">Unpaid</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openCreate(false)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Record payment
          </Button>
          {balanceDue > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setMarkFullForm({ ...EMPTY_FORM, paymentMethod: "cash" });
                setMarkFullOpen(true);
              }}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Mark paid in full
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-slate-500">Order total</div>
          <div className="font-medium">{fmtMoney(total)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-500">Amount paid</div>
          <div className="font-medium text-emerald-700">
            {fmtMoney(amountPaid)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-500">Balance due</div>
          <div
            className={
              balanceDue > 0 ? "font-semibold text-amber-700" : "font-medium"
            }
          >
            {fmtMoney(balanceDue)}
          </div>
        </div>
      </div>

      {hasLiveApiHold && (
        <div className="mx-4 mb-3 flex gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {paidInFull ? (
              <>
                <strong>Double-charge risk:</strong> This order shows as paid in
                full, but an Authorize.net hold is still active. Approve or
                decline the hold below before recording any additional payment.
              </>
            ) : (
              <>
                An Authorize.net payment hold is pending review. Use Approve or
                Decline on the row below to resolve it at the gateway.
              </>
            )}
          </span>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          No payments recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Received</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-left">Recorded by</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2 align-top">
                      {fmtDateTime(p.receivedAt ?? p.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {methodLabel(p.paymentMethod)}
                      {p.cardLast4 && (
                        <div className="text-xs text-slate-500">
                          {p.cardType ? `${p.cardType} ` : ""}•••• {p.cardLast4}
                        </div>
                      )}
                      {p.isApiPayment && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Authorize.net
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top font-medium">
                      {fmtMoney(p.amount)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {p.isApiPayment ? (
                        <ApiStatusBadge status={p.status} />
                      ) : (
                        <Badge
                          variant={
                            p.status === "completed"
                              ? "default"
                              : p.status === "refunded" || p.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {p.status}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {p.transactionId || "—"}
                      {p.notes && (
                        <div className="text-xs text-slate-500">{p.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">
                      {p.recordedByEmail ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {p.isApiPayment && p.status === "pending" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-emerald-700 hover:text-emerald-800"
                            onClick={() =>
                              setConfirmAction({
                                paymentId: p.id,
                                action: "approve",
                                amount: p.amount,
                              })
                            }
                            disabled={
                              approveMut.isPending || declineMut.isPending
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setConfirmAction({
                                paymentId: p.id,
                                action: "decline",
                                amount: p.amount,
                              })
                            }
                            disabled={
                              approveMut.isPending || declineMut.isPending
                            }
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                  {p.isApiPayment && (
                    <tr className="bg-slate-50/60">
                      <td
                        colSpan={7}
                        className="px-3 pb-2.5 pt-0 text-xs text-slate-600"
                      >
                        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1.5 border-t border-slate-100">
                          {p.authCode && (
                            <span>
                              <span className="text-slate-400">Auth:</span>{" "}
                              <span className="font-mono">{p.authCode}</span>
                            </span>
                          )}
                          {p.gatewayMessage && (
                            <span>
                              <span className="text-slate-400">Reason:</span>{" "}
                              {p.gatewayMessage}
                            </span>
                          )}
                          <span>
                            <span className="text-slate-400">AVS:</span>{" "}
                            {avsLabel(p.avsResponse)}
                          </span>
                          <span>
                            <span className="text-slate-400">CVV:</span>{" "}
                            {cvvLabel(p.cvvResponse)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === "edit" ? "Edit payment" : "Record payment"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pmt-amount">Amount ($)</Label>
              <Input
                id="pmt-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              {balanceDue > 0 && editing?.mode === "create" && (
                <button
                  type="button"
                  className="mt-1 text-xs text-blue-600 hover:underline"
                  onClick={() =>
                    setForm((f) => ({ ...f, amount: balanceDue.toFixed(2) }))
                  }
                >
                  Use remaining balance ({fmtMoney(balanceDue)})
                </button>
              )}
            </div>
            <div>
              <Label htmlFor="pmt-method">Method</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentMethod: v }))
                }
              >
                <SelectTrigger id="pmt-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pmt-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="pmt-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pmt-received">Received at</Label>
              <Input
                id="pmt-received"
                type="datetime-local"
                value={form.receivedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, receivedAt: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="pmt-ref">Reference / check #</Label>
              <Input
                id="pmt-ref"
                value={form.transactionId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transactionId: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pmt-card-type">Card type</Label>
                <Input
                  id="pmt-card-type"
                  placeholder="Visa"
                  value={form.cardType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardType: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="pmt-last4">Last 4</Label>
                <Input
                  id="pmt-last4"
                  maxLength={4}
                  value={form.cardLast4}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardLast4: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pmt-notes">Notes</Label>
              <Textarea
                id="pmt-notes"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editing?.mode === "edit" ? "Save changes" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid in full dialog */}
      <Dialog open={markFullOpen} onOpenChange={setMarkFullOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark paid in full</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Records a payment of {fmtMoney(balanceDue)} to clear the remaining
            balance.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mk-method">Method</Label>
              <Select
                value={markFullForm.paymentMethod}
                onValueChange={(v) =>
                  setMarkFullForm((f) => ({ ...f, paymentMethod: v }))
                }
              >
                <SelectTrigger id="mk-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mk-received">Received at</Label>
              <Input
                id="mk-received"
                type="datetime-local"
                value={markFullForm.receivedAt}
                onChange={(e) =>
                  setMarkFullForm((f) => ({ ...f, receivedAt: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mk-ref">Reference / check #</Label>
              <Input
                id="mk-ref"
                value={markFullForm.transactionId}
                onChange={(e) =>
                  setMarkFullForm((f) => ({
                    ...f,
                    transactionId: e.target.value,
                  }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mk-notes">Notes</Label>
              <Textarea
                id="mk-notes"
                rows={2}
                value={markFullForm.notes}
                onChange={(e) =>
                  setMarkFullForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkFullOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkPaidInFull}
              disabled={markFullMut.isPending}
            >
              Record full payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gateway action confirmation */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.action === "approve"
                ? "Approve payment?"
                : "Decline payment?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {confirmAction?.action === "approve" ? (
              <>
                {fmtMoney(confirmAction.amount)} will be captured from the
                customer&apos;s card. This cannot be undone.
              </>
            ) : (
              <>
                The gateway hold on {fmtMoney(confirmAction?.amount ?? 0)} will
                be released and the order will show an outstanding balance.
              </>
            )}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={approveMut.isPending || declineMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmAction?.action === "approve" ? "default" : "destructive"
              }
              onClick={handleGatewayAction}
              disabled={approveMut.isPending || declineMut.isPending}
            >
              {confirmAction?.action === "approve"
                ? "Approve"
                : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will remove the {fmtMoney(confirmDelete?.amount ?? 0)}{" "}
            {confirmDelete ? methodLabel(confirmDelete.paymentMethod) : ""}{" "}
            payment and recompute the balance due.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown error";
}
