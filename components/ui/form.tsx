export const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted disabled:text-ink-muted";
export const selectClass = inputClass;

export function Field({
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

export function FormCard({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">{children}</div>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger" role="alert">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-success-light px-3 py-2 text-sm text-success" role="status">
      {message}
    </div>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-3">{children}</div>;
}

export function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</div>
    </div>
  );
}

export function TabCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-5">{children}</div>;
}
