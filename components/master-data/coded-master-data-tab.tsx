"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { upsertCodedItemAction, type CodedMasterTable } from "@/lib/actions/master-data";

type Row = { id: string; code: string | null; name: string; is_active: boolean; display_order: number };

export function CodedMasterDataTab({
  table, rows, canEdit, codeRequired,
}: {
  table: CodedMasterTable; rows: Row[]; canEdit: boolean; codeRequired: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave(id: string | null, code: string, name: string, isActive: boolean, displayOrder: number) {
    setPending(true);
    setError(null);
    const result = await upsertCodedItemAction(table, id, code, name, isActive, displayOrder);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {adding && canEdit && (
              <InlineEditRow row={null} codeRequired={codeRequired} onCancel={() => setAdding(false)} onSave={handleSave} pending={pending} />
            )}
            {rows.map((r) =>
              editingId === r.id ? (
                <InlineEditRow key={r.id} row={r} codeRequired={codeRequired} onCancel={() => setEditingId(null)} onSave={handleSave} pending={pending} />
              ) : (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">{r.code ?? "—"}</td>
                  <td className="px-4 py-2 text-ink">{r.name}</td>
                  <td className="px-4 py-2 tabular-nums text-ink-muted">{r.display_order}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-xl px-2 py-0.5 text-[10.5px] font-bold ${r.is_active ? "bg-primary-light text-primary-dark" : "bg-surface-muted text-ink-muted"}`}>
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2">
                      <button onClick={() => setEditingId(r.id)} className="text-xs font-medium text-primary-dark hover:underline">
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              )
            )}
            {rows.length === 0 && !adding && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InlineEditRow({
  row, codeRequired, onCancel, onSave, pending,
}: {
  row: Row | null;
  codeRequired: boolean;
  onCancel: () => void;
  onSave: (id: string | null, code: string, name: string, isActive: boolean, displayOrder: number) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [displayOrder, setDisplayOrder] = useState(row?.display_order ?? 0);

  return (
    <tr className="border-b border-border bg-primary-light/20 last:border-0">
      <td className="px-4 py-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={codeRequired ? "Code (required)" : "Code"}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => onSave(row?.id ?? null, code, name, isActive, displayOrder)}
            disabled={pending}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60"
          >
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
