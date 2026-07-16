import { Check, X } from "lucide-react";
import type { AppRole } from "@/lib/types/database";

const ROLE_LABELS: Record<AppRole, string> = {
  shipment_data_entry: "Data Entry",
  documentation_user: "Documentation",
  customs_clearance_user: "Customs Clearance",
  shipment_coordinator: "Coordinator",
  shipment_supervisor: "Supervisor",
  finance_user: "Finance",
  management_read_only: "Mgmt (RO)",
  system_administrator: "Sys Admin",
};
const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export function PermissionMatrix({
  permissions, rolePermissions,
}: {
  permissions: { code: string; description: string }[];
  rolePermissions: { role: AppRole; permission: string; allowed: boolean }[];
}) {
  const allowedSet = new Set(rolePermissions.filter((rp) => rp.allowed).map((rp) => `${rp.role}:${rp.permission}`));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 bg-surface-muted px-4 py-2.5">Permission</th>
              {ALL_ROLES.map((r) => (
                <th key={r} className="px-3 py-2.5 text-center">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.code} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-surface px-4 py-2 text-ink" title={p.description}>{p.code}</td>
                {ALL_ROLES.map((r) => {
                  const allowed = allowedSet.has(`${r}:${p.code}`);
                  return (
                    <td key={r} className="px-3 py-2 text-center">
                      {allowed ? (
                        <Check className="mx-auto h-4 w-4 text-primary-dark" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-ink-muted/30" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border bg-surface-muted/60 px-4 py-2 text-xs text-ink-muted">
        Read-only — the permission matrix is fixed by design (a business-rule table, not user-editable here);
        changing it means editing <code>role_permissions</code> in a migration and re-deploying, the same way
        every other business rule in this schema is changed.
      </p>
    </div>
  );
}
