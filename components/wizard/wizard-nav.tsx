export function WizardNav({
  onBack,
  onSaveAsDraft,
  showBack = true,
  nextLabel = "Next",
  nextDisabled = false,
  nextFormId,
}: {
  onBack?: () => void;
  onSaveAsDraft: () => void;
  showBack?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextFormId?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
      <button
        type="button"
        onClick={onSaveAsDraft}
        className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted"
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
          disabled={nextDisabled}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
