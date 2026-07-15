"use client";

import { useActionState, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  createShipmentAction,
  addSupplierAction,
  type CreateShipmentState,
  type AddSupplierState,
} from "@/lib/actions/shipments";
import { dubaiTodayISODate } from "@/lib/dates";

const initialState: CreateShipmentState = {};
const initialSupplierState: AddSupplierState = {};

type Option = { id: string; name: string };

export function NewShipmentForm({
  branches,
  categories,
  countries,
  suppliers,
  fixedBranchId,
  canAdministerSuppliers,
}: {
  branches: Option[];
  categories: Option[];
  countries: Option[];
  suppliers: Option[];
  fixedBranchId: string | null;
  canAdministerSuppliers: boolean;
}) {
  const [state, formAction, pending] = useActionState(createShipmentAction, initialState);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [selectedSupplier, setSelectedSupplier] = useState<Option | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [showNotListed, setShowNotListed] = useState(false);

  const filteredSuppliers = useMemo(() => {
    if (!supplierQuery.trim()) return supplierList;
    const q = supplierQuery.toLowerCase();
    return supplierList.filter((s) => s.name.toLowerCase().includes(q));
  }, [supplierList, supplierQuery]);

  const fixedBranch = fixedBranchId ? branches.find((b) => b.id === fixedBranchId) : null;

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
      {state.error && (
        <div className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Branch" error={state.fieldErrors?.branch_id}>
          {fixedBranchId ? (
            <>
              <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                {fixedBranch?.name ?? "Your branch"}
              </div>
              <input type="hidden" name="branch_id" value={fixedBranchId} />
            </>
          ) : (
            <select name="branch_id" required className={selectClass}>
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Category" error={state.fieldErrors?.category_id}>
          <select name="category_id" className={selectClass}>
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Item 4: searchable supplier combobox from master data — supplier_id
          is what actually gets submitted; the RPC resolves the canonical
          name server-side and ignores any client-supplied label. */}
      <Field label="Supplier" error={state.fieldErrors?.supplier_id}>
        <div className="relative">
          <input
            type="text"
            value={selectedSupplier ? selectedSupplier.name : supplierQuery}
            onChange={(e) => {
              setSelectedSupplier(null);
              setSupplierQuery(e.target.value);
              setShowSupplierList(true);
            }}
            onFocus={() => setShowSupplierList(true)}
            onBlur={() => setTimeout(() => setShowSupplierList(false), 150)}
            placeholder="Search suppliers…"
            className={inputClass}
            autoComplete="off"
          />
          <input type="hidden" name="supplier_id" value={selectedSupplier?.id ?? ""} />
          {showSupplierList && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-md">
              {filteredSuppliers.length === 0 && (
                <li className="px-3 py-2 text-sm text-ink-muted">No matching suppliers</li>
              )}
              {filteredSuppliers.map((s) => (
                <li
                  key={s.id}
                  className="cursor-pointer px-3 py-2 text-sm text-ink hover:bg-primary-light"
                  onMouseDown={() => {
                    setSelectedSupplier(s);
                    setSupplierQuery("");
                    setShowSupplierList(false);
                  }}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNotListed((v) => !v)}
          className="text-xs font-medium text-primary-dark hover:underline"
        >
          Supplier not listed?
        </button>

        {showNotListed && (
          <SupplierNotListed
            canAdminister={canAdministerSuppliers}
            onCreated={(s) => {
              setSupplierList((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
              setSelectedSupplier(s);
              setShowNotListed(false);
            }}
          />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Origin country" error={state.fieldErrors?.origin_country_id}>
          <select name="origin_country_id" className={selectClass}>
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Shipment date" error={state.fieldErrors?.shipment_date}>
          <input
            type="date"
            name="shipment_date"
            required
            defaultValue={dubaiTodayISODate()}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Priority" error={state.fieldErrors?.priority}>
        <select name="priority" defaultValue="Medium" className={selectClass}>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>
      </Field>

      <Field label="Internal reference (optional)" error={state.fieldErrors?.internal_ref}>
        <input name="internal_ref" className={inputClass} />
      </Field>

      <Field label="Notes (optional)" error={state.fieldErrors?.notes}>
        <textarea name="notes" rows={3} className={inputClass} />
      </Field>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Link href="/shipments" className="rounded-md px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create shipment"}
        </button>
      </div>
    </form>
  );
}

function SupplierNotListed({
  canAdminister,
  onCreated,
}: {
  canAdminister: boolean;
  onCreated: (s: Option) => void;
}) {
  const [state, formAction, pending] = useActionState(addSupplierAction, initialSupplierState);

  // Side effects (updating the parent's supplier list) belong in an effect,
  // never directly in the render body — calling onCreated() while rendering
  // would trigger a parent state update mid-render.
  useEffect(() => {
    if (state.supplier) {
      onCreated(state.supplier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.supplier]);

  if (!canAdminister) {
    return (
      <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
        This supplier isn&apos;t in FFC&apos;s system yet. Contact your administrator to add it before
        creating this shipment — ordinary accounts can&apos;t add new suppliers.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border bg-surface-muted/50 p-3">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-ink-muted">New supplier name</label>
          <input name="name" required className={inputClass} placeholder="e.g. Nile Delta Produce Ltd." />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary-dark px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add supplier"}
        </button>
      </form>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.supplier && (
        <p className="text-xs text-success">Added &quot;{state.supplier.name}&quot; and selected it.</p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const selectClass = inputClass;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
