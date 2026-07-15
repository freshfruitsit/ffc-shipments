const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-surface-muted text-ink-muted border-border",
  "Documents Pending": "bg-warning-light text-warning border-warning/30",
  "Ready for Submission": "bg-primary-light text-primary-dark border-primary/30",
  Submitted: "bg-primary-light text-primary-dark border-primary/30",
  "Customs Processing": "bg-warning-light text-warning border-warning/30",
  "Clearance Pending": "bg-warning-light text-warning border-warning/30",
  "Ready for Collection": "bg-primary-light text-primary-dark border-primary/30",
  Received: "bg-primary-light text-primary-dark border-primary/30",
  Completed: "bg-success-light text-success border-success/30",
  "On Hold": "bg-warning-light text-warning border-warning/30",
  Rejected: "bg-danger-light text-danger border-danger/30",
  "Resubmission Required": "bg-danger-light text-danger border-danger/30",
  Cancelled: "bg-surface-muted text-ink-muted border-border",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-surface-muted text-ink-muted border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      {status}
    </span>
  );
}
