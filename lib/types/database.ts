/**
 * Hand-maintained subset of the database types, covering Module 1 + 2
 * (auth, register, quick-create, full shipment detail with sub-process
 * tabs, invoices, documents/Storage, comments). Once a real Supabase
 * project exists and CLI access is available, replace this file with the
 * CLI-generated one:
 *
 *   npx supabase gen types typescript --project-id <ref> > lib/types/database.ts
 */

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
          p_supplier_id: string | null; p_supplier_name: string; p_origin_country_id: string | null; p_priority: string;
          p_responsible: string | null; p_internal_ref?: string | null; p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["shipments"]["Row"];
      };
      has_permission: { Args: { p_permission: string }; Returns: boolean };
      search_shipments: {
        Args: { p_query: string | null; p_status: OverallStatus | null; p_page: number; p_page_size: number };
        Returns: {
          id: string; ref: string; supplier_name_snapshot: string; awb: string | null; eta: string | null;
          shipment_date: string; overall_status: OverallStatus; customs_status: CustomsStatus;
          municipality_status: MunicipalityStatus; delivery_order_status: DeliveryOrderStatus;
          mofaic_status: MofaicStatus; total_count: number;
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
      add_comment: {
        Args: { p_shipment_id: string; p_body: string };
        Returns: Database["public"]["Tables"]["shipment_comments"]["Row"];
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
