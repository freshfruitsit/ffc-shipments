/**
 * Hand-maintained subset of the database types, covering Module 1 + 2
 * (auth, register, quick-create, full shipment detail with sub-process
 * tabs, invoices, documents/Storage, comments). Once a real Supabase
 * project exists and CLI access is available, replace this file with the
 * CLI-generated one:
 *
 *   npx supabase gen types typescript --project-id <ref> > lib/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole =
  | "shipment_data_entry"
  | "documentation_user"
  | "customs_clearance_user"
  | "shipment_coordinator"
  | "shipment_supervisor"
  | "finance_user"
  | "management_read_only"
  | "system_administrator";

export type OverallStatus =
  | "Draft"
  | "Documents Pending"
  | "Ready for Submission"
  | "Submitted"
  | "Customs Processing"
  | "Clearance Pending"
  | "Ready for Collection"
  | "Received"
  | "Completed"
  | "On Hold"
  | "Rejected"
  | "Resubmission Required"
  | "Cancelled";

export type DocumentStatus =
  | "Not Started"
  | "Documents Pending"
  | "Partially Complete"
  | "Complete"
  | "Under Verification"
  | "Verified"
  | "Rejected";

export type CustomsStatus =
  | "Not Started"
  | "Draft"
  | "Request Created"
  | "Submitted"
  | "Declaration Created"
  | "Under Review"
  | "Approved"
  | "Rejected"
  | "Resubmission Required"
  | "Closed";

export type MunicipalityStatus =
  | "Not Required"
  | "Not Started"
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Finished"
  | "Rejected"
  | "Resubmission Required";

export type DeliveryOrderStatus =
  | "Not Required"
  | "Pending"
  | "Requested"
  | "Received"
  | "Uploaded"
  | "Verified";

export type MofaicStatus =
  | "Not Applicable"
  | "Applicability Review"
  | "Pending"
  | "Payment Due"
  | "Paid"
  | "Overdue"
  | "Completed"
  | "Exception";

export type PhysicalDocStatus =
  | "Not Required"
  | "Originals Pending"
  | "Ready for Dispatch"
  | "Dispatched"
  | "In Transit"
  | "Delivered"
  | "Proof of Delivery Received"
  | "Closed";

export type DocVersionStatus = "Uploaded" | "Verified" | "Rejected" | "Archived";

type MasterRow = { id: string; name: string; is_active: boolean; display_order?: number };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; full_name: string; email: string; role: AppRole;
          branch_id: string | null; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      branches: { Row: MasterRow & { code: string }; Insert: Partial<MasterRow & { code: string }>; Update: Partial<MasterRow & { code: string }>; Relationships: [] };
      suppliers: { Row: { id: string; code: string | null; name: string; is_active: boolean }; Insert: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>; Update: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>; Relationships: [] };
      countries: { Row: { id: string; iso_code: string | null; name: string; is_active: boolean }; Insert: Partial<Database["public"]["Tables"]["countries"]["Row"]>; Update: Partial<Database["public"]["Tables"]["countries"]["Row"]>; Relationships: [] };
      shipment_categories: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      airlines: { Row: { id: string; code: string | null; name: string; is_active: boolean }; Insert: Partial<Database["public"]["Tables"]["airlines"]["Row"]>; Update: Partial<Database["public"]["Tables"]["airlines"]["Row"]>; Relationships: [] };
      ports: { Row: { id: string; code: string; name: string; is_active: boolean }; Insert: Partial<Database["public"]["Tables"]["ports"]["Row"]>; Update: Partial<Database["public"]["Tables"]["ports"]["Row"]>; Relationships: [] };
      freight_agents: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      clearing_agents: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      carriers: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      courier_companies: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      document_types: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      currencies: { Row: { code: string; name: string; is_active: boolean }; Insert: Partial<Database["public"]["Tables"]["currencies"]["Row"]>; Update: Partial<Database["public"]["Tables"]["currencies"]["Row"]>; Relationships: [] };
      shipments: {
        Row: {
          id: string; ref: string; internal_ref: string | null; mode: string; shipment_date: string;
          category_id: string | null; branch_id: string; supplier_id: string | null; supplier_name_snapshot: string;
          origin_country_id: string | null; priority: string; responsible: string | null; coordinator: string | null;
          awb: string | null; airline_id: string | null; flight: string | null; eta: string | null; port_id: string | null;
          freight_agent_id: string | null; clearing_agent_id: string | null;
          packages: number | null; net_weight: number | null; gross_weight: number | null; transport_remarks: string | null;
          overall_status: OverallStatus; document_status: DocumentStatus; customs_status: CustomsStatus;
          municipality_status: MunicipalityStatus; delivery_order_status: DeliveryOrderStatus;
          mofaic_status: MofaicStatus; physical_doc_status: PhysicalDocStatus; completion_eligible: boolean;
          declaration_no: string | null; customs_submission_date: string | null; customs_result: string | null; customs_remarks: string | null;
          municipality_draft_ref: string | null; municipality_submitted_ref: string | null;
          municipality_submission_date: string | null; municipality_completion_date: string | null; municipality_remarks: string | null;
          carrier_id: string | null; delivery_order_requested_date: string | null; delivery_order_received_date: string | null;
          delivery_order_doc_uploaded: boolean; delivery_order_responsible: string | null; delivery_order_remarks: string | null;
          mofaic_ref: string | null; mofaic_payment_amount: number | null; mofaic_currency: string | null;
          mofaic_payment_date: string | null; mofaic_responsible: string | null; mofaic_remarks: string | null;
          originals_required: boolean; originals_received: boolean; ready_for_dispatch: boolean;
          courier_company_id: string | null; tracking_number: string | null; dispatch_date: string | null;
          delivered_date: string | null; pod_received: boolean; physical_docs_responsible: string | null; physical_docs_remarks: string | null;
          notes: string | null; created_at: string; updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["shipments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["shipments"]["Row"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string; shipment_id: string; invoice_no: string; invoice_date: string;
          supplier_id: string | null; supplier_name_snapshot: string; invoice_value: number; currency_code: string;
          purchase_order_no: string | null; supplier_reference: string | null; payment_terms: string | null; remarks: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["invoices"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["invoices"]["Row"]>;
        Relationships: [];
      };
      documents: {
        Row: { id: string; shipment_id: string; invoice_id: string | null; document_type_id: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["documents"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["documents"]["Row"]>;
        Relationships: [];
      };
      document_versions: {
        Row: {
          id: string; document_id: string; version_number: number; storage_path: string; original_filename: string;
          mime_type: string | null; file_size: number | null; sha256_hash: string; is_current: boolean;
          replaces_version_id: string | null; status: DocVersionStatus; uploaded_by: string | null; uploaded_at: string;
          verified_by: string | null; verified_at: string | null; expiry_date: string | null; remarks: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["document_versions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["document_versions"]["Row"]>;
        Relationships: [];
      };
      shipment_comments: {
        Row: { id: string; shipment_id: string; author: string | null; body: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["shipment_comments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["shipment_comments"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string; recipient: string; shipment_id: string | null; event_type: string;
          title: string; message: string; priority: string; is_read: boolean;
          created_at: string; read_at: string | null; link_target: string | null; dedup_key: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      exceptions: {
        Row: {
          id: string; shipment_id: string; exception_type_id: string; severity: string; description: string;
          status: string; raised_by: string | null; assigned_to: string | null; due_date: string | null;
          root_cause: string | null; resolution: string | null; created_at: string; updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["exceptions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["exceptions"]["Row"]>;
        Relationships: [];
      };
      exception_types: {
        Row: { id: string; name: string; is_active: boolean };
        Insert: Partial<Database["public"]["Tables"]["exception_types"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["exception_types"]["Row"]>;
        Relationships: [];
      };
      resubmission_attempts: {
        Row: {
          id: string; exception_id: string; attempt_no: number; submitted_by: string | null;
          reason: string; corrective_action: string; authority_result: string;
          completion_date: string | null; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["resubmission_attempts"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["resubmission_attempts"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string; occurred_at: string; actor: string | null; actor_role: string | null;
          action: string; module: string; shipment_ref: string | null; details: unknown;
          comment: string | null; correlation_id: string | null; source: string; result: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
      fx_rates: {
        Row: { id: string; currency_code: string; effective_date: string; rate_to_aed: number };
        Insert: Partial<Database["public"]["Tables"]["fx_rates"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["fx_rates"]["Row"]>;
        Relationships: [];
      };
      mofaic_rules: {
        Row: { id: number; applicability_threshold_aed: number; payment_window_days: number; is_confirmed: boolean };
        Insert: Partial<Database["public"]["Tables"]["mofaic_rules"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["mofaic_rules"]["Row"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role: AppRole; permission: string; allowed: boolean };
        Insert: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Relationships: [];
      };
      status_transitions: {
        Row: { from_status: OverallStatus; to_status: OverallStatus; required_permission: string; requires_reason: boolean };
        Insert: Partial<Database["public"]["Tables"]["status_transitions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["status_transitions"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      v_assignable_profiles: {
        Row: { id: string; full_name: string; role: AppRole; branch_id: string | null };
        Relationships: [];
      };
    };
    Functions: {
      create_shipment: {
        Args: {
          p_mode: string; p_shipment_date: string; p_category_id: string | null; p_branch_id: string;
          p_supplier_id: string | null; p_supplier_name: string; p_origin_country_id: string | null; p_priority: string | null;
          p_responsible: string | null; p_internal_ref?: string | null; p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      has_permission: { Args: { p_permission: string }; Returns: boolean };
      get_app_shell_context: { Args: Record<string, never>; Returns: Json };
      get_dashboard_metrics: { Args: { p_branch_id?: string | null }; Returns: Json };
      get_shipment_header_context: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_overview_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_invoices_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_transport_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_documents_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_customs_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_municipality_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_delivery_order_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_mofaic_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_physical_documents_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_exceptions_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_comments_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_shipment_activity_tab: { Args: { p_shipment_id: string }; Returns: Json };
      get_assignable_profiles: {
        Args: { p_branch_id?: string | null; p_required_permission?: string | null };
        Returns: { id: string; full_name: string; role: AppRole; branch_id: string | null }[];
      };
      get_new_shipment_form_context: { Args: Record<string, never>; Returns: Json };
      search_active_suppliers: {
        Args: { p_query?: string | null; p_limit?: number; p_offset?: number };
        Returns: { id: string; code: string | null; name: string }[];
      };
      search_shipments: {
        Args: { p_query: string | null; p_status: OverallStatus | null; p_view: string | null; p_page: number; p_page_size: number };
        Returns: {
          id: string; ref: string; supplier_name_snapshot: string; origin_country: string | null;
          awb: string | null; eta: string | null; port: string | null;
          shipment_date: string; overall_status: OverallStatus; document_status: DocumentStatus;
          customs_status: CustomsStatus; municipality_status: MunicipalityStatus; delivery_order_status: DeliveryOrderStatus;
          mofaic_status: MofaicStatus; physical_doc_status: PhysicalDocStatus; total_count: number;
        }[];
      };

      upsert_supplier: {
        Args: { p_id: string | null; p_code: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: { id: string; code: string | null; name: string; is_active: boolean };
      };
      update_shipment_transport: {
        Args: {
          p_shipment_id: string; p_awb: string | null; p_airline_id: string | null; p_flight: string | null;
          p_eta: string | null; p_port_id: string | null; p_freight_agent_id: string | null; p_clearing_agent_id: string | null;
          p_packages: number | null; p_net_weight: number | null; p_gross_weight: number | null; p_transport_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      add_invoice: {
        Args: {
          p_shipment_id: string; p_invoice_no: string; p_invoice_date: string; p_supplier_id: string | null;
          p_supplier_name: string | null; p_invoice_value: number; p_currency_code: string;
          p_purchase_order_no?: string | null; p_supplier_reference?: string | null; p_payment_terms?: string | null; p_remarks?: string | null;
        };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      update_customs: {
        Args: {
          p_shipment_id: string; p_declaration_no: string | null; p_customs_status: CustomsStatus;
          p_customs_submission_date: string | null; p_customs_result: string | null; p_customs_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      update_municipality: {
        Args: {
          p_shipment_id: string; p_municipality_draft_ref: string | null; p_municipality_submitted_ref: string | null;
          p_municipality_status: MunicipalityStatus; p_municipality_submission_date: string | null;
          p_municipality_completion_date: string | null; p_municipality_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      update_delivery_order: {
        Args: {
          p_shipment_id: string; p_carrier_id: string | null; p_delivery_order_status: DeliveryOrderStatus;
          p_delivery_order_requested_date: string | null; p_delivery_order_received_date: string | null;
          p_delivery_order_doc_uploaded: boolean; p_delivery_order_responsible: string | null; p_delivery_order_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      update_mofaic: {
        Args: {
          p_shipment_id: string; p_mofaic_status: MofaicStatus; p_mofaic_ref: string | null;
          p_mofaic_payment_amount: number | null; p_mofaic_currency: string | null; p_mofaic_payment_date: string | null;
          p_mofaic_responsible: string | null; p_mofaic_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      update_physical_documents: {
        Args: {
          p_shipment_id: string; p_physical_doc_status: PhysicalDocStatus; p_originals_required: boolean;
          p_originals_received: boolean; p_ready_for_dispatch: boolean; p_courier_company_id: string | null;
          p_tracking_number: string | null; p_dispatch_date: string | null; p_delivered_date: string | null;
          p_pod_received: boolean; p_physical_docs_responsible: string | null; p_physical_docs_remarks: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      assign_shipment: {
        Args: { p_shipment_id: string; p_responsible: string | null; p_coordinator: string | null };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      change_shipment_status: {
        Args: { p_shipment_id: string; p_new_status: OverallStatus; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      add_comment: {
        Args: { p_shipment_id: string; p_body: string };
        Returns: Database["public"]["Tables"]["shipment_comments"]["Row"];
      };
      raise_exception: {
        Args: {
          p_shipment_id: string; p_exception_type_id: string; p_severity: string; p_description: string;
          p_assigned_to: string | null; p_due_date?: string | null;
        };
        Returns: Database["public"]["Tables"]["exceptions"]["Row"];
      };
      resolve_exception: {
        Args: { p_exception_id: string; p_root_cause: string; p_resolution: string };
        Returns: Database["public"]["Tables"]["exceptions"]["Row"];
      };
      close_exception: {
        Args: { p_exception_id: string };
        Returns: Database["public"]["Tables"]["exceptions"]["Row"];
      };
      replace_document: {
        Args: {
          p_document_id: string; p_storage_path: string; p_original_filename: string; p_mime_type: string | null;
          p_file_size: number; p_sha256_hash: string; p_expiry_date?: string | null;
        };
        Returns: Database["public"]["Tables"]["document_versions"]["Row"];
      };
      archive_document: {
        Args: { p_document_version_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["document_versions"]["Row"];
      };
      verify_document: {
        Args: { p_document_version_id: string; p_approve: boolean; p_remarks?: string | null };
        Returns: Database["public"]["Tables"]["document_versions"]["Row"];
      };
      fn_register_upload_intent: {
        Args: {
          p_shipment_id: string; p_document_id: string; p_storage_path: string;
          p_expected_mime_type?: string | null; p_expected_file_size?: number | null; p_expected_sha256_hash?: string | null;
        };
        Returns: { id: string; storage_path: string; expires_at: string };
      };
      upload_document_metadata: {
        Args: {
          p_shipment_id: string; p_document_id: string; p_invoice_id: string | null; p_document_type_id: string;
          p_storage_path: string; p_original_filename: string; p_mime_type: string | null; p_file_size: number | null;
          p_sha256_hash: string; p_expiry_date?: string | null;
        };
        Returns: Database["public"]["Tables"]["document_versions"]["Row"];
      };
    };
    Enums: { app_role: AppRole; overall_status: OverallStatus };
  };
}
