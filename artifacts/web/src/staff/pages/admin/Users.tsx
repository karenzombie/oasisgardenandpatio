import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Search, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  useAdminListUsers,
  useAdminGetUser,
  useAdminCreateStaffUser,
  useAdminUpdateUser,
  useAdminResetUserPassword,
  useAdminUpdateAgentPrivileges,
  useAdminListAuditLog,
  getAdminListAuditLogQueryKey,
  getAdminListUsersQueryKey,
  getAdminGetUserQueryKey,
  type AdminUserSummary,
  type AdminAgentPrivileges,
  type AuditLogEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import { useAuth } from "@/lib/auth";

type Group = "customers" | "staff";

function fullName(u: AdminUserSummary): string {
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function formatDateTime(s: string | null): string {
  return s ? new Date(s).toLocaleString() : "Never";
}

export default function Users() {
  return (
    <>
      <PageHeader title="Users" />
      <PageBody>
        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>
          <TabsContent value="staff" className="mt-4">
            <UsersPanel group="staff" />
          </TabsContent>
          <TabsContent value="customers" className="mt-4">
            <UsersPanel group="customers" />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

function UsersPanel({ group }: { group: Group }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const params = { group, q: debouncedQ || undefined } as const;
  const list = useAdminListUsers(params);
  const createMut = useAdminCreateStaffUser();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserSummary | null>(null);

  async function refetchList() {
    await qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  }

  const users = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email or name…"
            className="pl-8"
          />
        </div>
        {group === "staff" && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1.5" />
            New staff user
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load users.</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {debouncedQ
              ? "No users match your search."
              : group === "staff"
                ? "No staff users yet."
                : "No customer accounts yet."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Last login</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {fullName(u)}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-2">
                    {u.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-slate-500">
                        Disabled
                      </Badge>
                    )}
                    {u.mustChangePassword && (
                      <Badge
                        variant="outline"
                        className="ml-1 font-normal text-amber-700 border-amber-200"
                      >
                        Pwd reset
                      </Badge>
                    )}
                    {u.twoFactorEnabled && (
                      <Badge
                        variant="outline"
                        className="ml-1 font-normal text-sky-700 border-sky-200"
                      >
                        2FA
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {formatDateTime(u.lastLoginAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(u)}
                    >
                      <Pencil className="size-3.5 mr-1.5" />
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {group === "staff" && (
        <CreateStaffDialog
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            await refetchList();
            toast.toast({ title: "Staff user created" });
          }}
          save={(data) => createMut.mutateAsync({ data })}
        />
      )}
      <UserManageDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={refetchList}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: "customer" | "agent" | "admin" }) {
  if (role === "admin")
    return (
      <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-normal">
        <ShieldCheck className="size-3 mr-1" /> Admin
      </Badge>
    );
  if (role === "agent")
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
        Agent
      </Badge>
    );
  return (
    <Badge variant="outline" className="font-normal text-slate-600">
      <UserIcon className="size-3 mr-1" /> Customer
    </Badge>
  );
}

function CreateStaffDialog({
  open,
  onClose,
  onSaved,
  save,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  save: (data: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: "agent" | "admin";
    password: string;
  }) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("agent");
      setPassword("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    setPending(true);
    try {
      await save({
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        role,
        password,
      });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New staff user</DialogTitle>
          <DialogDescription>
            They'll be required to change this password on first sign-in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="su-email">Email</Label>
            <Input
              id="su-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="su-fn">First name</Label>
              <Input
                id="su-fn"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="su-ln">Last name</Label>
              <Input
                id="su-ln"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="su-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "agent" | "admin")}
              >
                <SelectTrigger id="su-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Sales agent</SelectItem>
                  <SelectItem value="admin">Super admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="su-pw">Initial password</Label>
              <Input
                id="su-pw"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
              />
            </div>
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserManageDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const isSelf = auth.user?.id === user?.id;

  const detailQ = useAdminGetUser(user?.id ?? 0, {
    query: {
      queryKey: getAdminGetUserQueryKey(user?.id ?? 0),
      enabled: user !== null,
    },
  });
  const updateMut = useAdminUpdateUser();
  const resetMut = useAdminResetUserPassword();
  const privMut = useAdminUpdateAgentPrivileges();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"customer" | "agent" | "admin">("customer");
  const [isActive, setIsActive] = useState(true);

  const [priv, setPriv] = useState<AdminAgentPrivileges>({
    canViewAllOrders: false,
    canViewAllCustomers: false,
    canViewCost: false,
    canAdjustInventory: false,
    canApproveCancellations: false,
    canSendVendorOrders: true,
    maxDiscountPercentage: null,
  });
  const [maxDiscountStr, setMaxDiscountStr] = useState("");

  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPriv, setSavingPriv] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setRole(user.role);
      setIsActive(user.isActive);
      setError(null);
      setTempPassword(null);
    }
  }, [user]);

  useEffect(() => {
    const detail = detailQ.data;
    if (detail?.agentPrivileges) {
      setPriv(detail.agentPrivileges);
      setMaxDiscountStr(
        detail.agentPrivileges.maxDiscountPercentage === null
          ? ""
          : String(detail.agentPrivileges.maxDiscountPercentage),
      );
    }
  }, [detailQ.data]);

  async function refetchDetail() {
    if (user) {
      await qc.invalidateQueries({
        queryKey: getAdminGetUserQueryKey(user.id),
      });
      await qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    }
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSavingDetails(true);
    try {
      await updateMut.mutateAsync({
        id: user.id,
        data: {
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          role,
          isActive,
        },
      });
      await refetchDetail();
      await onSaved();
      toast.toast({ title: "User updated" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleResetPw() {
    if (!user) return;
    setError(null);
    try {
      const r = await resetMut.mutateAsync({ id: user.id });
      setTempPassword(r.temporaryPassword);
      await onSaved();
      toast.toast({
        title: "Password reset",
        description: "Share the temporary password with the user.",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  async function handleSavePriv() {
    if (!user) return;
    setError(null);
    const num = maxDiscountStr.trim() === "" ? null : Number(maxDiscountStr);
    if (num !== null && (!Number.isFinite(num) || num < 0 || num > 100)) {
      setError("Max discount must be between 0 and 100, or empty.");
      return;
    }
    setSavingPriv(true);
    try {
      await privMut.mutateAsync({
        id: user.id,
        data: { ...priv, maxDiscountPercentage: num },
      });
      await refetchDetail();
      toast.toast({ title: "Agent privileges updated" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPriv(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user.email}</DialogTitle>
          <DialogDescription>
            User #{user.id} · created{" "}
            {new Date(user.createdAt).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSaveDetails} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mu-fn">First name</Label>
              <Input
                id="mu-fn"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mu-ln">Last name</Label>
              <Input
                id="mu-ln"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mu-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) =>
                  setRole(v as "customer" | "agent" | "admin")
                }
                disabled={isSelf}
              >
                <SelectTrigger id="mu-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="agent">Sales agent</SelectItem>
                  <SelectItem value="admin">Super admin</SelectItem>
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-slate-500 mt-1">
                  You cannot change your own role.
                </p>
              )}
            </div>
            <div className="flex items-end">
              <div className="flex items-center justify-between rounded border px-3 py-2 w-full">
                <div>
                  <div className="text-sm font-medium">Account active</div>
                  <div className="text-xs text-slate-500">
                    Disabled accounts cannot sign in
                  </div>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={isSelf}
                />
              </div>
            </div>
          </div>
          <Button type="submit" disabled={savingDetails}>
            {savingDetails ? "Saving…" : "Save details"}
          </Button>
        </form>

        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Password</div>
              <div className="text-xs text-slate-500">
                Generates a temporary password and forces change on next login.
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleResetPw}
              disabled={resetMut.isPending}
            >
              <KeyRound className="size-4 mr-1.5" />
              Reset password
            </Button>
          </div>
          {tempPassword && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="font-medium text-amber-900">
                Temporary password (shown once):
              </div>
              <div className="mt-1 font-mono text-base text-amber-950 select-all">
                {tempPassword}
              </div>
              <div className="text-xs text-amber-800 mt-1">
                Share this securely. The user must set a new password on first
                login.
              </div>
            </div>
          )}
        </div>

        {(user.role === "admin" || user.role === "agent") && (
          <SecurityActivity userId={user.id} />
        )}

        {role === "agent" && (
          <div className="border-t pt-3 space-y-3">
            <div>
              <div className="text-sm font-semibold">Agent privileges</div>
              <div className="text-xs text-slate-500">
                Controls what this agent can see and do in the staff portal.
              </div>
            </div>
            {detailQ.isLoading ? (
              <Spinner />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <PrivToggle
                    label="View all orders"
                    sub="Otherwise: only their own orders"
                    value={priv.canViewAllOrders}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canViewAllOrders: v }))
                    }
                  />
                  <PrivToggle
                    label="View all customers"
                    sub="Otherwise: only their own customers"
                    value={priv.canViewAllCustomers}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canViewAllCustomers: v }))
                    }
                  />
                  <PrivToggle
                    label="See product cost"
                    sub="Wholesale cost from vendor"
                    value={priv.canViewCost}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canViewCost: v }))
                    }
                  />
                  <PrivToggle
                    label="Adjust inventory"
                    sub="Manual stock adjustments"
                    value={priv.canAdjustInventory}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canAdjustInventory: v }))
                    }
                  />
                  <PrivToggle
                    label="Approve cancellations"
                    sub="Process customer cancel requests"
                    value={priv.canApproveCancellations}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canApproveCancellations: v }))
                    }
                  />
                  <PrivToggle
                    label="Send vendor orders"
                    sub="Email vendor PDFs"
                    value={priv.canSendVendorOrders}
                    onChange={(v) =>
                      setPriv((p) => ({ ...p, canSendVendorOrders: v }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="mu-disc">
                    Max discount percentage (blank = no cap)
                  </Label>
                  <Input
                    id="mu-disc"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={maxDiscountStr}
                    onChange={(e) => setMaxDiscountStr(e.target.value)}
                    placeholder="e.g. 15"
                    className="max-w-[12rem]"
                  />
                </div>
                <Button onClick={handleSavePriv} disabled={savingPriv}>
                  {savingPriv ? "Saving…" : "Save privileges"}
                </Button>
              </>
            )}
          </div>
        )}

        {error && <div className="text-sm text-rose-600">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SECURITY_ACTIONS = new Set([
  "staff_recovery.requested",
  "staff_recovery.completed",
  "staff_recovery.complete_rejected",
  "user.reset_password",
]);

function describeSecurityAction(action: string): string {
  switch (action) {
    case "staff_recovery.requested":
      return "Requested self-service account recovery (password + authenticator reset)";
    case "staff_recovery.completed":
      return "Completed account recovery — password and authenticator were reset";
    case "staff_recovery.complete_rejected":
      return "Account recovery attempt rejected";
    case "user.reset_password":
      return "Password reset by an administrator";
    default:
      return action;
  }
}

function SecurityActivity({ userId }: { userId: number }) {
  const params = { entityType: "user", entityId: userId, limit: 50 };
  const auditQ = useAdminListAuditLog(params, {
    query: {
      queryKey: getAdminListAuditLogQueryKey(params),
      enabled: userId > 0,
    },
  });

  const events: AuditLogEntry[] = (auditQ.data?.rows ?? []).filter((row) =>
    SECURITY_ACTIONS.has(row.action),
  );

  return (
    <div className="border-t pt-3 space-y-2">
      <div>
        <div className="text-sm font-semibold">Security activity</div>
        <div className="text-xs text-slate-500">
          Password and authenticator (MFA) resets for this user.
        </div>
      </div>
      {auditQ.isLoading ? (
        <Spinner className="size-4" />
      ) : events.length === 0 ? (
        <div className="text-xs text-slate-500">No reset activity recorded.</div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded border px-3 py-2 text-xs"
            >
              <span className="text-slate-700">
                {describeSecurityAction(e.action)}
              </span>
              <span className="shrink-0 text-slate-400">
                {formatDateTime(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrivToggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-slate-500">{sub}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
