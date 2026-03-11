export type OrganizationMemberRole = "admin" | "member";

export type OrganizationInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type ProjectStage = "Planning" | "Estimating" | "In Delivery";
export type ScopeRunStatus = "queued" | "running" | "complete" | "failed";
export type ChangeDetectionRunStatus = "running" | "complete" | "failed";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationMemberRole;
          display_name: string;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrganizationMemberRole;
          display_name: string;
          avatar_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationMemberRole;
          display_name?: string;
          avatar_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          invited_email: string;
          invited_by: string;
          role: OrganizationMemberRole;
          token: string;
          status: OrganizationInviteStatus;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invited_email: string;
          invited_by: string;
          role?: OrganizationMemberRole;
          token?: string;
          status?: OrganizationInviteStatus;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          invited_email?: string;
          invited_by?: string;
          role?: OrganizationMemberRole;
          token?: string;
          status?: OrganizationInviteStatus;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_plan_settings: {
        Row: {
          organization_id: string;
          plan_tier: string;
          monthly_trade_pack_limit: number;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          plan_tier?: string;
          monthly_trade_pack_limit?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          plan_tier?: string;
          monthly_trade_pack_limit?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_projects: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          name: string;
          slug: string;
          stage: ProjectStage;
          location: string;
          cover_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by: string;
          name: string;
          slug: string;
          stage?: ProjectStage;
          location?: string;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string;
          name?: string;
          slug?: string;
          stage?: ProjectStage;
          location?: string;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trade_pack_workspaces: {
        Row: {
          id: string;
          legacy_project_id: string;
          organization_id: string;
          created_by: string;
          name: string;
          slug: string;
          stage: ProjectStage;
          location: string;
          cover_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legacy_project_id: string;
          organization_id: string;
          created_by: string;
          name: string;
          slug: string;
          stage?: ProjectStage;
          location?: string;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          legacy_project_id?: string;
          organization_id?: string;
          created_by?: string;
          name?: string;
          slug?: string;
          stage?: ProjectStage;
          location?: string;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_drawing_sets: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          uploaded_by: string;
          file_name: string;
          storage_path: string;
          file_size_bytes: number;
          mime_type: string | null;
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          uploaded_by: string;
          file_name: string;
          storage_path: string;
          file_size_bytes: number;
          mime_type?: string | null;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          uploaded_by?: string;
          file_name?: string;
          storage_path?: string;
          file_size_bytes?: number;
          mime_type?: string | null;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_trade_pack_reason_snapshots: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          generated_drawing_set_id: string;
          created_by: string;
          source_document_name: string;
          trade_id: string;
          trade_label: string;
          matched_pages: number;
          total_pages: number;
          support_pages: number;
          average_confidence: number;
          reasons: Record<string, unknown>[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          generated_drawing_set_id: string;
          created_by: string;
          source_document_name: string;
          trade_id: string;
          trade_label: string;
          matched_pages?: number;
          total_pages?: number;
          support_pages?: number;
          average_confidence?: number;
          reasons?: Record<string, unknown>[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          generated_drawing_set_id?: string;
          created_by?: string;
          source_document_name?: string;
          trade_id?: string;
          trade_label?: string;
          matched_pages?: number;
          total_pages?: number;
          support_pages?: number;
          average_confidence?: number;
          reasons?: Record<string, unknown>[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_trade_pack_page_index: {
        Row: {
          id: string;
          run_id: string;
          organization_id: string;
          project_id: string;
          source_drawing_set_id: string | null;
          generated_drawing_set_id: string | null;
          created_by: string;
          source_document_name: string;
          trade_id: string;
          trade_label: string;
          page_number: number;
          include_in_pack: boolean;
          confidence: number;
          classifier: string;
          prefilter_pass: boolean;
          is_support_sheet: boolean;
          reason: string;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          organization_id: string;
          project_id: string;
          source_drawing_set_id?: string | null;
          generated_drawing_set_id?: string | null;
          created_by: string;
          source_document_name: string;
          trade_id: string;
          trade_label: string;
          page_number: number;
          include_in_pack?: boolean;
          confidence?: number;
          classifier: string;
          prefilter_pass?: boolean;
          is_support_sheet?: boolean;
          reason?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          organization_id?: string;
          project_id?: string;
          source_drawing_set_id?: string | null;
          generated_drawing_set_id?: string | null;
          created_by?: string;
          source_document_name?: string;
          trade_id?: string;
          trade_label?: string;
          page_number?: number;
          include_in_pack?: boolean;
          confidence?: number;
          classifier?: string;
          prefilter_pass?: boolean;
          is_support_sheet?: boolean;
          reason?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trade_packs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          trade_id: string;
          trade_label: string;
          pdf_url: string;
          page_index_json: Record<string, unknown>[];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          project_id: string;
          trade_id: string;
          trade_label: string;
          pdf_url: string;
          page_index_json?: Record<string, unknown>[];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          trade_id?: string;
          trade_label?: string;
          pdf_url?: string;
          page_index_json?: Record<string, unknown>[];
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scope_runs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          trade_pack_id: string;
          created_by: string;
          status: ScopeRunStatus;
          result_json: Record<string, unknown>;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          trade_pack_id: string;
          created_by: string;
          status?: ScopeRunStatus;
          result_json?: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          trade_pack_id?: string;
          created_by?: string;
          status?: ScopeRunStatus;
          result_json?: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      change_detection_runs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          trade_pack_id: string;
          created_by: string;
          baseline_revision: string;
          revised_revision: string;
          revised_file_name: string;
          status: ChangeDetectionRunStatus;
          validation_json: Record<string, unknown>;
          result_json: Record<string, unknown>;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          trade_pack_id: string;
          created_by: string;
          baseline_revision?: string;
          revised_revision?: string;
          revised_file_name: string;
          status?: ChangeDetectionRunStatus;
          validation_json?: Record<string, unknown>;
          result_json?: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          trade_pack_id?: string;
          created_by?: string;
          baseline_revision?: string;
          revised_revision?: string;
          revised_file_name?: string;
          status?: ChangeDetectionRunStatus;
          validation_json?: Record<string, unknown>;
          result_json?: Record<string, unknown>;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_organization_invite: {
        Args: {
          invite_token: string;
        };
        Returns: string;
      };
      ensure_organization_membership: {
        Args: Record<string, never>;
        Returns: string;
      };
      can_access_project_drawing_storage_object: {
        Args: {
          object_path: string;
        };
        Returns: boolean;
      };
      is_generated_trade_pack_file: {
        Args: {
          p_file_name: string;
          p_storage_path: string;
        };
        Returns: boolean;
      };
      default_trade_pack_monthly_limit: {
        Args: {
          plan_tier: string;
        };
        Returns: number;
      };
      get_trade_pack_monthly_limit_for_organization: {
        Args: {
          p_organization_id: string;
        };
        Returns: number;
      };
      count_trade_pack_workspaces_created_in_month: {
        Args: {
          p_organization_id: string;
          p_reference_at?: string;
        };
        Returns: number;
      };
      can_create_trade_pack_workspace: {
        Args: {
          p_organization_id: string;
          p_reference_at?: string;
        };
        Returns: boolean;
      };
      can_run_trade_pack_builder_once: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: boolean;
      };
      can_run_scope_builder_once: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: boolean;
      };
      can_run_change_detection_once: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: boolean;
      };
      get_trade_pack_workspace_quota: {
        Args: {
          p_organization_id: string;
          p_reference_at?: string;
        };
        Returns: {
          plan_tier: string;
          monthly_limit: number;
          created_count: number;
          remaining: number;
          month_start: string;
          month_end: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
