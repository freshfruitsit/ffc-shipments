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
  | "Pending"
  | "Documents Pending"
  | "Partially Complete"
  | "Complete"
  | "Under Verification"
  | "Verified"
  | "Rejected";

export type CustomsStatus =
  | "Pending"
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
  | "Pending"
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
  | "Received from Carrier"
  | "Uploaded"
  | "Verified";

export type FlightStatus =
  | "Booked"
  | "Manifested"
  | "Departed"
  | "Delayed"
  | "In Transit"
  | "Cancelled";

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
  | "Pending"
  | "Ready for Dispatch"
  | "Dispatched"
  | "In Transit"
  | "Delivered"
  | "Proof of Delivery Received"
  | "Closed";

export type DocVersionStatus = "Uploaded" | "Verified" | "Rejected" | "Archived";

export type DiscoveryStatus =
  | "Not Discussed" | "Under Review" | "Pending Confirmation" | "Approved" | "Rejected" | "Deferred";

export type ImportBatchStatus = "Uploaded" | "Parsing" | "Validated" | "Committing" | "Committed" | "Failed";

type MasterRow = { id: string; name: string; is_active: boolean; display_order: number };

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
      suppliers: { Row: { id: string; code: string | null; name: string; is_active: boolean; display_order: number }; Insert: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>; Update: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>; Relationships: [] };
      countries: { Row: { id: string; iso_code: string | null; name: string; is_active: boolean; display_order: number }; Insert: Partial<Database["public"]["Tables"]["countries"]["Row"]>; Update: Partial<Database["public"]["Tables"]["countries"]["Row"]>; Relationships: [] };
      shipment_categories: { Row: MasterRow; Insert: Partial<MasterRow>; Update: Partial<MasterRow>; Relationships: [] };
      airlines: { Row: { id: string; code: string | null; name: string; is_active: boolean; display_order: number }; Insert: Partial<Database["public"]["Tables"]["airlines"]["Row"]>; Update: Partial<Database["public"]["Tables"]["airlines"]["Row"]>; Relationships: [] };
      ports: { Row: { id: string; code: string; name: string; is_active: boolean; display_order: number }; Insert: Partial<Database["public"]["Tables"]["ports"]["Row"]>; Update: Partial<Database["public"]["Tables"]["ports"]["Row"]>; Relationships: [] };
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
          awb: string | null; airline_id: string | null; flight: string | null; flight_status: FlightStatus; transit_airport: string | null; eta: string | null; port_id: string | null;
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
        Row: { id: string; name: string; is_active: boolean; display_order: number };
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
      discovery_items: {
        Row: {
          id: string; code: string; topic: string; description: string; proposed_rule: string;
          owner: string | null; due_date: string | null; status: DiscoveryStatus; notes: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["discovery_items"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["discovery_items"]["Row"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string; file_name: string; file_sha256: string; uploaded_by: string | null; uploaded_at: string;
          status: ImportBatchStatus; chunk_size: number; total_rows: number | null; valid_rows: number | null;
          warning_rows: number | null; invalid_rows: number | null; last_processed_row: number;
          reconciliation_passed: boolean | null; committed_at: string | null; committed_by: string | null;
          failure_reason: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["import_batches"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string; occurred_at: string; actor: string | null; actor_role: string | null;
          action: string; module: string; shipment_ref: string | null; related: string | null;
          old_value: string | null; new_value: string | null; details: unknown;
          comment: string | null; correlation_id: string | null; source: string; result: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
      fx_rates: {
        Row: { id: string; currency_code: string; effective_date: string; rate_to_aed: number; source: string; created_at: string };
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
      upload_intents: {
        Row: {
          id: string; shipment_id: string; document_id: string; storage_path: string;
          requested_by: string | null; expected_mime_type: string | null; expected_file_size: number | null;
          expected_sha256_hash: string | null; requested_at: string; expires_at: string;
          fulfilled: boolean; fulfilled_at: string | null; cleanup_status: string;
          cleanup_attempts: number; cleanup_last_attempted_at: string | null; cleanup_error: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["upload_intents"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["upload_intents"]["Row"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role: AppRole; permission: string; allowed: boolean };
        Insert: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Relationships: [];
      };
      permissions: {
        Row: { code: string; description: string };
        Insert: Partial<Database["public"]["Tables"]["permissions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["permissions"]["Row"]>;
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
          p_supplier_id: string; p_supplier_name: string | null; p_origin_country_id: string | null; p_priority: string | null;
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
        Args: { p_query?: string | null; p_status?: OverallStatus | null; p_view?: string | null; p_page?: number; p_page_size?: number };
        Returns: {
          id: string; ref: string; supplier_name_snapshot: string; origin_country: string | null;
          awb: string | null; eta: string | null; port: string | null;
          shipment_date: string; overall_status: OverallStatus; document_status: DocumentStatus;
          customs_status: CustomsStatus; municipality_status: MunicipalityStatus; delivery_order_status: DeliveryOrderStatus;
          mofaic_status: MofaicStatus; physical_doc_status: PhysicalDocStatus; total_count: number;
        }[];
      };
      search_exceptions: {
        Args: { p_status?: string | null; p_severity?: string | null; p_page?: number; p_page_size?: number };
        Returns: {
          id: string; shipment_id: string; shipment_ref: string; type_name: string; severity: string;
          description: string; status: string; assigned_to_name: string | null; due_date: string | null;
          created_at: string; resubmission_count: number; total_count: number;
        }[];
      };
      get_report_shipments: {
        Args: { p_report_key: string; p_page?: number; p_page_size?: number };
        Returns: {
          id: string; ref: string; supplier_name_snapshot: string; origin_country: string | null;
          awb: string | null; eta: string | null; overall_status: OverallStatus; document_status: DocumentStatus;
          customs_status: CustomsStatus; municipality_status: MunicipalityStatus; delivery_order_status: DeliveryOrderStatus;
          mofaic_status: MofaicStatus; invoice_value: number | null; currency_code: string | null;
          net_weight: number | null; gross_weight: number | null; mofaic_due_date: string | null;
          mofaic_days_left: number | null; total_count: number;
        }[];
      };
      get_report_supplier_performance: {
        Args: { p_page?: number; p_page_size?: number };
        Returns: {
          supplier_name: string; total_shipments: number; completed_shipments: number;
          open_exceptions: number; avg_days_to_complete: number | null; total_count: number;
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
          p_flight_status?: FlightStatus; p_transit_airport?: string | null;
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
      confirm_shipment_completion: {
        Args: { p_shipment_id: string; p_notes?: string | null };
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

      // ---------- Module 4: profile/discovery administration ----------
      deactivate_profile: { Args: { p_profile_id: string }; Returns: Database["public"]["Tables"]["profiles"]["Row"] };
      reactivate_profile: { Args: { p_profile_id: string }; Returns: Database["public"]["Tables"]["profiles"]["Row"] };
      change_user_role: {
        Args: { p_profile_id: string; p_new_role: AppRole; p_new_branch_id?: string | null };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      update_discovery_item: {
        Args: { p_discovery_id: string; p_status: DiscoveryStatus; p_notes?: string | null };
        Returns: Database["public"]["Tables"]["discovery_items"]["Row"];
      };

      // ---------- Module 4: master data upserts ----------
      upsert_branch: {
        Args: { p_id: string | null; p_code: string; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["branches"]["Row"];
      };
      upsert_country: {
        Args: { p_id: string | null; p_iso_code: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["countries"]["Row"];
      };
      upsert_port: {
        Args: { p_id: string | null; p_code: string; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["ports"]["Row"];
      };
      upsert_airline: {
        Args: { p_id: string | null; p_code: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["airlines"]["Row"];
      };
      upsert_freight_agent: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["freight_agents"]["Row"];
      };
      upsert_clearing_agent: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["clearing_agents"]["Row"];
      };
      upsert_carrier: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["carriers"]["Row"];
      };
      upsert_courier_company: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["courier_companies"]["Row"];
      };
      upsert_shipment_category: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["shipment_categories"]["Row"];
      };
      upsert_document_type: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["document_types"]["Row"];
      };
      upsert_exception_type: {
        Args: { p_id: string | null; p_name: string; p_is_active?: boolean; p_display_order?: number };
        Returns: Database["public"]["Tables"]["exception_types"]["Row"];
      };
      upsert_currency: {
        Args: { p_code: string; p_name: string; p_is_active?: boolean };
        Returns: Database["public"]["Tables"]["currencies"]["Row"];
      };
      upsert_fx_rate: {
        Args: { p_currency_code: string; p_effective_date: string; p_rate_to_aed: number; p_source?: string };
        Returns: Database["public"]["Tables"]["fx_rates"]["Row"];
      };

      // ---------- Module 4: historical import ----------
      create_import_batch: {
        Args: { p_file_name: string; p_file_sha256: string; p_chunk_size?: number };
        Returns: Database["public"]["Tables"]["import_batches"]["Row"];
      };
      stage_import_rows: {
        Args: { p_batch_id: string; p_rows: unknown };
        Returns: { staged_count: number; skipped_count: number }[];
      };
      set_import_reconciliation_expected: {
        Args: { p_batch_id: string; p_month_label: string; p_expected_count: number };
        Returns: { batch_id: string; month_label: string; expected_count: number; committed_count: number };
      };
      fn_validate_import_batch: { Args: { p_batch_id: string }; Returns: void };
      fn_commit_import_batch_chunk: {
        Args: { p_batch_id: string; p_default_branch_id: string; p_default_category_id: string };
        Returns: { committed_this_chunk: number; remaining: number; batch_status: ImportBatchStatus }[];
      };
      get_import_batch_status: { Args: { p_batch_id: string }; Returns: unknown };
      list_import_batches: {
        Args: { p_page?: number; p_page_size?: number };
        Returns: {
          id: string; file_name: string; status: ImportBatchStatus; total_rows: number | null;
          valid_rows: number | null; warning_rows: number | null; invalid_rows: number | null;
          uploaded_at: string; committed_at: string | null; reconciliation_passed: boolean | null;
          failure_reason: string | null; total_count: number;
        }[];
      };
      fn_can_access_document_by_path: { Args: { p_storage_path: string }; Returns: boolean };
    };
    Enums: { app_role: AppRole; overall_status: OverallStatus };
  };
}
