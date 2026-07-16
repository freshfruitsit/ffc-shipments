/**
 * The reports this module actually implements, with real distinct filter
 * logic behind each one (ported from the prototype's previewReport()
 * function, which only gave these specific names real behavior — every
 * other name in the prototype's REPORTS array fell through to a generic,
 * undifferentiated preview). See CHANGELOG_MODULE_3.md for the full
 * decision on which prototype report names were and weren't carried over.
 */
export const SHIPMENT_REPORTS = [
  {
    key: "daily_arrivals",
    title: "Daily Arrival Report",
    description: "Shipments with an ETA today.",
  },
  {
    key: "pending",
    title: "Pending Shipment Report",
    description: "Every shipment not yet Completed or Cancelled.",
  },
  {
    key: "delayed",
    title: "Delayed Shipment Report",
    description: "ETA has passed, the delivery order hasn't been received, and the shipment isn't Draft/Cancelled/Completed.",
  },
  {
    key: "missing_documents",
    title: "Missing Document Report",
    description: "Shipments whose document set isn't yet Complete or Verified.",
  },
  {
    key: "customs_clearance",
    title: "Customs Clearance Report",
    description: "Dubai Customs declaration created, but Dubai Municipality isn't Finished yet.",
  },
  {
    key: "municipality_pending",
    title: "Municipality (ZDLM) Pending Report",
    description: "Shipments still moving through Dubai Municipality.",
  },
  {
    key: "mofaic_pending",
    title: "MOFAIC Pending Report",
    description: "Payment Pending, Payment Due, or Overdue — with the aging calculation. See the dedicated MOFAIC Follow-up workspace for the full aging view.",
  },
  {
    key: "weight_variance",
    title: "Net and Gross Weight Report",
    description: "All shipments with recorded weights, largest net/gross variance first — a data-quality lens more than a status filter.",
  },
] as const;

export type ShipmentReportKey = (typeof SHIPMENT_REPORTS)[number]["key"];
