"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";

type Option = { id: string; name: string };

export function Step4Documents({
  shipmentId,
  documentTypes,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  documentTypes: Option[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);

  // DocumentUploadForm reloads the page on a successful upload, so a fresh
  // count is always available whenever this step mounts.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("shipment_id", shipmentId)
      .then(({ count }) => setUploadedCount(count ?? 0));
  }, [shipmentId]);

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-ink-muted">
        Upload documents for this shipment — pick a type, then add the file. Add as many as needed before
        continuing.
      </p>

      {uploadedCount !== null && <p className="mb-3 text-xs text-ink-muted">{uploadedCount} document(s) uploaded so far.</p>}

      <DocumentUploadForm shipmentId={shipmentId} documentTypes={documentTypes} />

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button type="button" onClick={onSaveAsDraft} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
          Save as Draft
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={onNext} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
