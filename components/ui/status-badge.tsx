/**
 * Exact port of the prototype's overallStatusPill()/genericStatusPill()
 * logic (app.js) — same four-tier severity mapping (pri-low / pri-medium
 * / pri-high / pri-critical), same colors, same pill shape.
 */

const OVERALL_STATUS_TIER: Record<string, "low" | "medium" | "high" | "critical"> = {
  Completed: "low",
  "Ready for Collection": "low",
  Received: "low",
  Draft: "low",
  Rejected: "critical",
  Cancelled: "critical",
  "Resubmission Required": "critical",
  "On Hold": "high",
  "Clearance Pending": "high",
  "Customs Processing": "medium",
  Submitted: "medium",
  "Ready for Submission": "medium",
  "Documents Pending": "medium",
};

const DEFAULT_CRITICAL = ["Rejected", "Overdue", "Exception"];
const DEFAULT_WARN = [
  "Pending", "Payment Due", "Draft", "Under Review", "Originals Pending", "Requested", "Ready for Dispatch",
];

const TIER_CLASS: Record<string, string> = {
  low: "bg-primary-light text-primary-dark",
  medium: "bg-info-light text-info",
  high: "bg-warning-light text-warning",
  critical: "bg-danger-light text-danger",
};

const PRIORITY_TIER: Record<string, "low" | "medium" | "high" | "critical"> = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
};

export function StatusBadge({
  status,
  criticalList,
  warnList,
  priority,
}: {
  status: string;
  /** Pass these for non-"overall status" pills (customs/municipality/etc.) to
   * match the prototype's genericStatusPill() per-column severity lists. */
  criticalList?: string[];
  warnList?: string[];
  /** Pass true for the Priority field specifically — uses all 4 tiers
   * directly (Critical/High/Medium/Low), unlike the 3-tier critical/warn
   * system every other status column uses. */
  priority?: boolean;
}) {
  let tier: "low" | "medium" | "high" | "critical";
  if (priority) {
    tier = PRIORITY_TIER[status] ?? "medium";
  } else if (criticalList || warnList) {
    const critical = criticalList ?? DEFAULT_CRITICAL;
    const warn = warnList ?? DEFAULT_WARN;
    tier = critical.includes(status) ? "critical" : warn.includes(status) ? "medium" : "low";
  } else {
    tier = OVERALL_STATUS_TIER[status] ?? "medium";
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-xl px-2.5 py-0.5 text-[10.5px] font-bold ${TIER_CLASS[tier]}`}
    >
      {status}
    </span>
  );
}
