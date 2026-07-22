/**
 * Exact port of the per-column severity lists from the prototype's
 * genericStatusPill() call sites (app.js lines 469-474, 652-681). Each
 * sub-process status column has its own critical/warn list — don't reuse
 * the overall-status tiering for these.
 */
export const STATUS_SEVERITY = {
  document: {
    critical: ["Rejected"],
    warn: ["Documents Pending", "Partially Complete", "Under Verification", "Pending"],
  },
  customs: {
    critical: [],
    warn: ["Draft", "Submitted", "Pending"],
  },
  municipality: {
    critical: [],
    warn: ["Draft", "Submitted", "Pending"],
  },
  deliveryOrder: {
    critical: [] as string[],
    warn: ["Pending", "Requested", "Not Required"],
  },
  mofaic: {
    critical: ["Overdue", "Exception"],
    warn: ["Pending", "Payment Due", "Applicability Review"],
  },
  physicalDoc: {
    critical: [] as string[],
    warn: ["Pending", "Ready for Dispatch", "In Transit"],
  },
} as const;

/** The 8-stage overall lifecycle flow used by the shipment detail progress stepper. */
export const OVERALL_STAGE_FLOW = [
  "Created", "Dubai Customs", "Delivery Order Received", "Dubai Municipality",
  "Documents at FFC HO", "MOFAIC Completed", "Physical Documents Dispatched", "Completed",
] as const;

/**
 * Maps overall_status to its stepper stage index (0-7). Much simpler
 * than before this project's automatic-status-progression redesign —
 * overall_status is now itself always exactly one of these 8 stage
 * names (see fn_recalculate_shipment_progress in
 * 20260101000025_auto_status_progression.sql), so this is a direct
 * lookup rather than an indirect mapping from a much larger, separately-
 * named enum.
 */
export function overallStageIndex(overallStatus: string): number {
  const idx = OVERALL_STAGE_FLOW.indexOf(overallStatus as (typeof OVERALL_STAGE_FLOW)[number]);
  return idx === -1 ? 0 : idx;
}

/** The 12-tab order from the prototype's DETAIL_TABS array — exact order matters. */
export const DETAIL_TABS = [
  { segment: "overview", label: "Overview" },
  { segment: "invoices", label: "Invoices" },
  { segment: "transport", label: "Transport" },
  { segment: "customs", label: "Dubai Customs" },
  { segment: "municipality", label: "Dubai Municipality" },
  { segment: "delivery-order", label: "Delivery Order" },
  { segment: "mofaic", label: "MOFAIC" },
  { segment: "physical-documents", label: "Physical Documents" },
  { segment: "documents", label: "Documents" },
  { segment: "exceptions", label: "Exceptions" },
  { segment: "comments", label: "Comments" },
  { segment: "activity", label: "Activity History" },
] as const;

/** The 13 saved-view quick filters from the prototype's SAVED_VIEWS object. */
export const SAVED_VIEWS = [
  { key: "all", label: "All Active Shipments" },
  { key: "mine", label: "My Assigned Shipments" },
  { key: "today", label: "Arriving Today" },
  { key: "week", label: "Arriving This Week" },
  { key: "missingdocs", label: "Missing Documents" },
  { key: "custpending", label: "Customs Pending" },
  { key: "munipending", label: "Municipality Pending" },
  { key: "dopending", label: "Delivery Orders Pending" },
  { key: "mofaicpending", label: "MOFAIC Pending" },
  { key: "physpending", label: "Physical Documents Pending" },
  { key: "exceptions", label: "Open Exceptions" },
  { key: "resub", label: "Resubmission Required" },
  { key: "collection", label: "Ready for Collection" },
  { key: "completed", label: "Completed This Month" },
] as const;

/** Full 15-item sidebar nav from the prototype's #sidebarNav markup. */
export const NAV_SECTIONS = [
  { segment: "dashboard", label: "Dashboard", built: true },
  { segment: "shipments", label: "Shipments", built: true },
  { segment: "shipments/new", label: "Create Shipment", built: true },
  { segment: "documents", label: "Documents", built: true },
  { segment: "customs", label: "Customs & Compliance", built: true },
  { segment: "delivery-orders", label: "Delivery Orders", built: true },
  { segment: "mofaic", label: "MOFAIC Follow-up", built: true },
  { segment: "physical-documents", label: "Physical Documents", built: true },
  { segment: "exceptions", label: "Exceptions", built: true },
  { segment: "reports", label: "Reports", built: true },
  { segment: "import", label: "Historical Data Import", built: true },
  { segment: "master-data", label: "Master Data", built: true },
  { segment: "audit", label: "Audit Log", built: true },
  { segment: "discovery", label: "Discovery & Sign-off", built: true },
  { segment: "admin", label: "Administration", built: true },
] as const;
