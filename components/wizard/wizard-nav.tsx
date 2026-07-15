/**
 * "Save as Draft" was previously a plain button that only navigated away
 * — it never submitted the current step's form, so anything typed on the
 * step you clicked it from was silently discarded instead of saved. Both
 * buttons now submit the SAME form (same data, same validation, same
 * server action); an `intent` value distinguishes which one was clicked
 * so the caller can decide what to do once the save actually completes
 * (advance to the next step, vs. exit to the shipment's overview page).
 */
export function WizardNav({
  onBack,
  onIntentClick,
  showBack = true,
  nextLabel = "Next",
  nextDisabled = false,
  nextFormId,
}: {
  onBack?: () => void;
  onIntentClick: (intent: "next" | "draft") => void;
  showBack?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextFormId?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
      <button
        type="submit"
        form={nextFormId}
        onClick={() => onIntentClick("draft")}
        disabled={nextDisabled}
        className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
      >
        Save as Draft
      </button>
      <div className="flex gap-2">
        {showBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          form={nextFormId}
          onClick={() => onIntentClick("next")}
          disabled={nextDisabled}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
