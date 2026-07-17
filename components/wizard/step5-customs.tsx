"use client";

import { useState, useTransition } from "react";
import { updateCustomsAction, updateMunicipalityAction } from "@/lib/actions/portal-updates";

const CUSTOMS_STATUSES = [
  "Pending", "Draft", "Request Created", "Submitted", "Declaration Created",
  "Under Review", "Approved", "Rejected", "Resubmission Required", "Closed",
];
const MUNICIPALITY_STATUSES = ["Not Required", "Pending", "Draft", "Submitted", "Under Review", "Finished", "Rejected", "Resubmission Required"];

export function Step5Customs({
  shipmentId,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [declarationNo, setDeclarationNo] = useState("");
  const [customsSubmissionDate, setCustomsSubmissionDate] = useState("");
  const [customsStatus, setCustomsStatus] = useState("Pending");
  const [customsRemarks, setCustomsRemarks] = useState("");
  const [municipalityDraftRef, setMunicipalityDraftRef] = useState("");
  const [municipalitySubmittedRef, setMunicipalitySubmittedRef] = useState("");
  const [municipalityStatus, setMunicipalityStatus] = useState("Pending");
  const [municipalitySubmissionDate, setMunicipalitySubmissionDate] = useState("");
  const [municipalityCompletionDate, setMunicipalityCompletionDate] = useState("");
  const [municipalityRemarks, setMunicipalityRemarks] = useState("");

  function handleSave(intent: "next" | "draft") {
    setError(null);
    startTransition(async () => {
      const customsForm = new FormData();
      customsForm.set("shipment_id", shipmentId);
      customsForm.set("declaration_no", declarationNo);
      customsForm.set("customs_status", customsStatus);
      customsForm.set("customs_submission_date", customsSubmissionDate);
      customsForm.set("customs_remarks", customsRemarks);
      const customsResult = await updateCustomsAction({}, customsForm);
      if (customsResult.error) {
        setError(customsResult.error);
        return;
      }

      const muniForm = new FormData();
      muniForm.set("shipment_id", shipmentId);
      muniForm.set("municipality_draft_ref", municipalityDraftRef);
      muniForm.set("municipality_submitted_ref", municipalitySubmittedRef);
      muniForm.set("municipality_status", municipalityStatus);
      muniForm.set("municipality_submission_date", municipalitySubmissionDate);
      muniForm.set("municipality_completion_date", municipalityCompletionDate);
      muniForm.set("municipality_remarks", municipalityRemarks);
      const muniResult = await updateMunicipalityAction({}, muniForm);
      if (muniResult.error) {
        setError(muniResult.error);
        return;
      }

      // Item: "Save as Draft" previously skipped this whole function and
      // just navigated away, silently discarding whatever was typed on
      // this step — it now runs the identical save as "Next" and only
      // differs in what happens once that save actually succeeds.
      if (intent === "draft") onSaveAsDraft();
      else onNext();
    });
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>}

      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Dubai Customs</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Dubai Customs Declaration Number" required>
          <input value={declarationNo} onChange={(e) => setDeclarationNo(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Submission Date">
          <input type="date" value={customsSubmissionDate} onChange={(e) => setCustomsSubmissionDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Customs Status">
          <select value={customsStatus} onChange={(e) => setCustomsStatus(e.target.value)} className={inputClass}>
            {CUSTOMS_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Customs Remarks">
            <textarea rows={2} value={customsRemarks} onChange={(e) => setCustomsRemarks(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>

      <h4 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Dubai Municipality</h4>
      <p className="mb-2.5 text-[11.5px] text-ink-muted">
        The Municipality record typically gets a Draft reference first, then a separate Submitted reference
        once the record is formally submitted (after the delivery order is received).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Municipality Draft Reference">
          <input value={municipalityDraftRef} onChange={(e) => setMunicipalityDraftRef(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Municipality Submitted Reference">
          <input value={municipalitySubmittedRef} onChange={(e) => setMunicipalitySubmittedRef(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Municipality Status">
          <select value={municipalityStatus} onChange={(e) => setMunicipalityStatus(e.target.value)} className={inputClass}>
            {MUNICIPALITY_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Submission Date">
          <input type="date" value={municipalitySubmissionDate} onChange={(e) => setMunicipalitySubmissionDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Completion Date">
          <input type="date" value={municipalityCompletionDate} onChange={(e) => setMunicipalityCompletionDate(e.target.value)} className={inputClass} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Authority Remarks">
            <textarea rows={2} value={municipalityRemarks} onChange={(e) => setMunicipalityRemarks(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button type="button" onClick={() => handleSave("draft")} disabled={pending} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-60">
          {pending ? "Saving…" : "Save as Draft"}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={() => handleSave("next")} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
            {pending ? "Saving…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
