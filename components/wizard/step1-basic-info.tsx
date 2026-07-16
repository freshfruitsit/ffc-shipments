"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { createShipmentAction, addSupplierAction, type CreateShipmentState, type AddSupplierState } from "@/lib/actions/shipments";
import { WizardNav } from "@/components/wizard/wizard-nav";
import { dubaiTodayISODate } from "@/lib/dates";

type Option = { id: string; name: string };
const initialState: CreateShipmentState = {};
const initialSupplierState: AddSupplierState = {};

export function Step1BasicInfo({
  userId,
  branches,
  fixedBranchId,
  categories,
  countries,
  profiles,
  suppliers,
  canAdministerSuppliers,
  onCreatedAndAdvance,
  onCreatedAndExit,
}: {
  userId: string;
  branches: Option[];
  fixedBranchId: string | null;
  categories: Option[];
  countries: Option[];
  profiles: Option[];
  suppliers: Option[];
  canAdministerSuppliers: boolean;
  onCreatedAndAdvance: (shipmentId: string, shipmentRef: string) => void;
  onCreatedAndExit: (shipmentId: string) => void;
}) {
  const [state, formAction, pending] = useActionState(createShipmentAction, initialState);
  // Item (screenshot audit): Supplier is now a real dropdown against the
  // active supplier list, rather than a live search-as-you-type combobox —
  // a deliberate reversal of the earlier design (which intentionally kept
  // the full list off this page's initial load "in case there are
  // thousands"). newlyAddedSuppliers holds anything created via "Supplier
  // not listed?" during this session, appended to the base list so it's
  // selectable immediately without a full page reload.
  const [newlyAddedSuppliers, setNewlyAddedSuppliers] = useState<Option[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [showNotListed, setShowNotListed] = useState(false);
  // Tracks which button was actually clicked — "Save as Draft" now
  // submits the exact same form as "Next" (so whatever was typed here
  // actually gets saved instead of silently discarded), and this is what
  // tells the effect below which of the two follow-up actions to take
  // once the save completes.
  const intentRef = useRef<"next" | "draft">("next");

  useEffect(() => {
    if (state.createdShipment) {
      if (intentRef.current === "draft") {
        onCreatedAndExit(state.createdShipment.id);
      } else {
        onCreatedAndAdvance(state.createdShipment.id, state.createdShipment.ref);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdShipment]);

  const allSuppliers = [...suppliers, ...newlyAddedSuppliers];
  const fixedBranch = fixedBranchId ? branches.find((b) => b.id === fixedBranchId) : null;

  return (
    <form action={formAction}>
      {state.error && (
        <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Shipment Date" required error={state.fieldErrors?.shipment_date}>
          <input type="date" name="shipment_date" required defaultValue={dubaiTodayISODate()} className={inputClass} />
        </Field>
        <Field label="Shipment Mode" required>
          <select name="mode" defaultValue="Air" className={inputClass}>
            <option value="Air">Air</option>
            <option value="Sea" disabled>Sea (Future Phase)</option>
            <option value="Land" disabled>Land (Future Phase)</option>
          </select>
        </Field>
        <Field label="Internal Reference">
          <input name="internal_ref" className={inputClass} />
        </Field>

        <div>
          <Field label="Supplier" required error={state.fieldErrors?.supplier_id}>
            <select
              name="supplier_id"
              required
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select supplier…</option>
              {allSuppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <button type="button" onClick={() => setShowNotListed((v) => !v)} className="mt-1 text-xs font-medium text-primary-dark hover:underline">
            Supplier not listed?
          </button>
          {showNotListed && (
            <SupplierNotListed
              canAdminister={canAdministerSuppliers}
              onCreated={(s) => {
                setNewlyAddedSuppliers((prev) => [...prev, s]);
                setSelectedSupplierId(s.id);
                setShowNotListed(false);
              }}
            />
          )}
        </div>

        <Field label="Origin Country" required error={state.fieldErrors?.origin_country_id}>
          <select name="origin_country_id" required className={inputClass}>
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Shipment Category" required error={state.fieldErrors?.category_id}>
          <select
            name="category_id"
            required
            defaultValue={categories.find((c) => c.name === "Fresh Fruits and Vegetables")?.id ?? ""}
            className={inputClass}
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Business Unit" required error={state.fieldErrors?.branch_id}>
          {fixedBranchId ? (
            <>
              <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">{fixedBranch?.name ?? "Your branch"}</div>
              <input type="hidden" name="branch_id" value={fixedBranchId} />
            </>
          ) : (
            <select name="branch_id" required className={inputClass}>
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Responsible User" required error={state.fieldErrors?.responsible}>
          <select name="responsible" required defaultValue={userId} className={inputClass}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="General Remarks">
          <textarea name="notes" rows={2} className={inputClass} />
        </Field>
      </div>

      <WizardNav
        onIntentClick={(intent) => (intentRef.current = intent)}
        showBack={false}
        nextDisabled={pending}
        nextLabel={pending ? "Creating…" : "Next"}
      />
    </form>
  );
}

function SupplierNotListed({ canAdminister, onCreated }: { canAdminister: boolean; onCreated: (s: Option) => void }) {
  const [state, formAction, pending] = useActionState(addSupplierAction, initialSupplierState);

  useEffect(() => {
    if (state.supplier) onCreated(state.supplier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.supplier]);

  if (!canAdminister) {
    return (
      <p className="mt-2 rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
        This supplier isn&apos;t in FFC&apos;s system yet. Contact your administrator to add it.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed border-border bg-surface-muted/50 p-3">
      <form action={formAction} className="flex items-end gap-2">
        <input name="name" required className={inputClass} placeholder="New supplier name" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary-dark px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
