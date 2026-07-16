const KNOWN_PREFIXES = [
  "BRANCH_ACCESS_DENIED", "PERMISSION_DENIED", "PROFILE_INACTIVE", "PROFILE_NOT_FOUND", "AUTH_REQUIRED",
  "SHIPMENT_LOCKED", "NOT_FOUND", "INVALID_MODE", "INVALID_PRIORITY", "INVALID_BRANCH", "INVALID_CATEGORY",
  "INVALID_COUNTRY", "INVALID_CURRENCY", "INVALID_DATE", "INVALID_DATE_ORDER", "INVALID_WEIGHTS", "INVALID_PACKAGES",
  "INVALID_VALUE", "INVALID_STORAGE_PATH", "SUPPLIER_NOT_FOUND", "SUPPLIER_INACTIVE", "SUPPLIER_NAME_REQUIRED",
  "ASSIGNEE_NOT_FOUND", "ASSIGNEE_INACTIVE", "ASSIGNEE_WRONG_BRANCH", "ASSIGNEE_ROLE_NOT_ALLOWED",
  "DECLARATION_NUMBER_REQUIRED", "MUNICIPALITY_SEQUENCE", "DELIVERY_ORDER_DOC_MISSING", "MOFAIC_PAYMENT_INCOMPLETE",
  "POD_REQUIRES_DELIVERY_DATE", "EMPTY_COMMENT", "INVOICE_MISMATCH", "DOCUMENT_ALREADY_EXISTS",
  "STORAGE_OBJECT_MISSING", "UPLOAD_INTENT_MISSING", "UPLOAD_INTENT_OWNER_MISMATCH",
  "UPLOAD_INTENT_ALREADY_FULFILLED", "UPLOAD_INTENT_EXPIRED", "NOT_CURRENT_VERSION", "DOCUMENT_ARCHIVED",
  // Found missing (pre-existing, from Module 2) while auditing every RAISE
  // EXCEPTION across the whole schema for Module 4 — these would previously
  // have shown the generic fallback message instead of their real, already
  // human-readable text.
  "CUSTOMS_NOT_STARTED", "DELIVERY_ORDER_NOT_READY", "DOCUMENTS_NOT_READY", "INACTIVE_OR_MISSING_PROFILE",
  "INVALID_RESULT", "INVALID_TRANSITION", "NOT_COMPLETED", "NOT_ELIGIBLE", "NOT_RESOLVED", "NO_CURRENT_VERSION",
  "QUERY_TOO_LONG", "REASON_REQUIRED", "RESOLUTION_REQUIRED", "RESUBMISSION_PENDING", "ROOT_CAUSE_REQUIRED",
  "EXCEPTION_CLOSED", "ALREADY_RESOLVED",
  // Module 3/4 additions.
  "INVALID_STATUS", "INVALID_SEVERITY", "INVALID_REPORT_KEY", "DUPLICATE_FILE", "BATCH_NOT_STAGEABLE",
  "INVALID_RATE", "CURRENCY_NOT_FOUND",
];

/**
 * Every RPC in this schema raises errors as "CODE: human-readable detail".
 * Strip the code for display when it's one we recognize; never show a raw/
 * unrecognized database error message to the user (item 7's requirement).
 */
export function friendlyRpcError(message: string): string {
  const [prefix, ...rest] = message.split(":");
  if (KNOWN_PREFIXES.includes(prefix.trim())) {
    return rest.join(":").trim() || "That request couldn't be completed.";
  }
  return "Something went wrong. Please try again, or contact FFC IT if it persists.";
}
