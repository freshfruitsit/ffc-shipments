import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-pwa-bg px-6 text-center">
      <WifiOff className="h-10 w-10 text-ink-muted" strokeWidth={1.5} />
      <h1 className="font-display text-lg font-semibold text-ink">No connection</h1>
      <p className="max-w-xs text-sm text-ink-muted">
        FFC Field needs a connection to show live shipment status — nothing here is safe to trust while stale.
        Reconnect and try again.
      </p>
    </div>
  );
}
