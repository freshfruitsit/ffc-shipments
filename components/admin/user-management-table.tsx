"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateProfileAction, reactivateProfileAction, changeUserRoleAction } from "@/lib/actions/admin";
import type { AppRole } from "@/lib/types/database";

const ROLE_LABELS: Record<AppRole, string> = {
  shipment_data_entry: "Shipment Data Entry",
  documentation_user: "Documentation User",
  customs_clearance_user: "Customs Clearance User",
  shipment_coordinator: "Shipment Coordinator",
  shipment_supervisor: "Shipment Supervisor",
  finance_user: "Finance User",
  management_read_only: "Management (Read Only)",
  system_administrator: "System Administrator",
};
const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

type ProfileRow = { id: string; full_name: string; email: string; role: AppRole; branch_id: string | null; is_active: boolean };
type Branch = { id: string; name: string };

export function UserManagementTable({
  profiles, branches, currentUserId,
}: {
  profiles: ProfileRow[]; branches: Branch[]; currentUserId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRoleSave(id: string, role: AppRole, branchId: string) {
    setPending(true);
    setError(null);
    const result = await changeUserRoleAction(id, role, branchId || null);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleDeactivate(id: string) {
    setPending(true);
    setError(null);
    const result = await deactivateProfileAction(id);
    setPending(false);
    if (result.error) setError(result.error);
    router.refresh();
  }

  async function handleReactivate(id: string) {
    setPending(true);
    setError(null);
    const result = await reactivateProfileAction(id);
    setPending(false);
    if (result.error) setError(result.error);
    router.refresh();
  }

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) =>
                editingId === p.id ? (
                  <EditRow key={p.id} profile={p} branches={branches} onCancel={() => setEditingId(null)} onSave={handleRoleSave} pending={pending} />
                ) : (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-ink">
                      {p.full_name} {p.id === currentUserId && <span className="text-xs text-ink-muted">(you)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{p.email}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{ROLE_LABELS[p.role]}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{branchName(p.branch_id)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-xl px-2 py-0.5 text-[10.5px] font-bold ${p.is_active ? "bg-primary-light text-primary-dark" : "bg-surface-muted text-ink-muted"}`}>
                        {p.is_active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-3">
                        <button onClick={() => setEditingId(p.id)} className="text-xs font-medium text-primary-dark hover:underline">
                          Edit role
                        </button>
                        {p.id !== currentUserId && (
                          p.is_active ? (
                            <button onClick={() => handleDeactivate(p.id)} disabled={pending} className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
                              Deactivate
                            </button>
                          ) : (
                            <button onClick={() => handleReactivate(p.id)} disabled={pending} className="text-xs font-medium text-primary-dark hover:underline disabled:opacity-60">
                              Reactivate
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        Creating brand-new users isn&apos;t available here yet — that needs Supabase&apos;s Admin API with a
        service-role key, a distinct security surface from everything else on this page. For now, create the
        account directly in the Supabase dashboard (Authentication → Users), then manage their role/branch here.
      </p>
    </div>
  );
}

function EditRow({
  profile, branches, onCancel, onSave, pending,
}: {
  profile: ProfileRow; branches: Branch[]; onCancel: () => void;
  onSave: (id: string, role: AppRole, branchId: string) => void; pending: boolean;
}) {
  const [role, setRole] = useState<AppRole>(profile.role);
  const [branchId, setBranchId] = useState(profile.branch_id ?? "");

  return (
    <tr className="border-b border-border bg-primary-light/20 last:border-0">
      <td className="px-4 py-2.5 text-ink">{profile.full_name}</td>
      <td className="px-4 py-2.5 text-ink-muted">{profile.email}</td>
      <td className="px-4 py-2.5">
        <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
          {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
          <option value="">—</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </td>
      <td className="px-4 py-2.5 text-ink-muted">
        {profile.is_active ? "Active" : "Deactivated"}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-2">
          <button onClick={() => onSave(profile.id, role, branchId)} disabled={pending}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60">
            Save
          </button>
          <button onClick={onCancel} className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
