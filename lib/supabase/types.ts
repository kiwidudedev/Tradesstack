export type OrganizationMemberRole = "owner" | "admin" | "qs" | "project_manager" | "worker";

export type OrganizationInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type ProjectStage = "Pricing" | "Construction" | "Completion";
export type OpportunityStage = "New" | "Reviewing" | "Pricing" | "Quoted" | "Won" | "Lost";
export type QuoteStatus = "Draft" | "Ready to Send" | "Sent" | "Viewed" | "Accepted" | "Rejected" | "Expired";
export type QuoteLineItemSection = "Preliminaries" | "Labour" | "Materials" | "Plant" | "Subcontractors" | "Item";
export type ScopeRunStatus = "queued" | "running" | "complete" | "failed";
export type ChangeDetectionRunStatus = "running" | "complete" | "failed";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          logo_path: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          logo_path?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo_path?: string | null;
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
          invited_name: string | null;
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
          invited_name?: string | null;
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
          invited_name?: string | null;
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
      app_permissions: {
        Row: {
          permission_key: string;
          description: string;
          created_at: string;
        };
        Insert: {
          permission_key: string;
          description?: string;
          created_at?: string;
        };
        Update: {
          permission_key?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role: OrganizationMemberRole;
          permission_key: string;
          is_allowed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          role: OrganizationMemberRole;
          permission_key: string;
          is_allowed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: OrganizationMemberRole;
          permission_key?: string;
          is_allowed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      member_permission_overrides: {
        Row: {
          id: string;
          organization_member_id: string;
          permission_key: string;
          is_allowed: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_member_id: string;
          permission_key: string;
          is_allowed: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_member_id?: string;
          permission_key?: string;
          is_allowed?: boolean;
          created_by?: string;
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
      organization_clients: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          name: string;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by: string;
          name: string;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string;
          name?: string;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      client_notes: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          created_by: string;
          author_name: string;
          body: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          created_by: string;
          author_name?: string;
          body: string;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          created_by?: string;
          author_name?: string;
          body?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_opportunities: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          owner_user_id: string | null;
          client_id: string | null;
          workspace_project_id: string | null;
          converted_project_id: string | null;
          name: string;
          slug: string;
          opportunity_code: string;
          stage: OpportunityStage;
          location: string;
          due_date: string | null;
          quoted_at: string | null;
          estimated_value: number;
          notes: string;
          converted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by: string;
          owner_user_id?: string | null;
          client_id?: string | null;
          workspace_project_id?: string | null;
          converted_project_id?: string | null;
          name: string;
          slug: string;
          opportunity_code?: string;
          stage?: OpportunityStage;
          location?: string;
          due_date?: string | null;
          quoted_at?: string | null;
          estimated_value?: number;
          notes?: string;
          converted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string;
          owner_user_id?: string | null;
          client_id?: string | null;
          workspace_project_id?: string | null;
          converted_project_id?: string | null;
          name?: string;
          slug?: string;
          opportunity_code?: string;
          stage?: OpportunityStage;
          location?: string;
          due_date?: string | null;
          quoted_at?: string | null;
          estimated_value?: number;
          notes?: string;
          converted_at?: string | null;
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
          client_id: string | null;
          source_opportunity_id: string | null;
          name: string;
          slug: string;
          project_code: string;
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
          client_id?: string | null;
          source_opportunity_id?: string | null;
          name: string;
          slug: string;
          project_code?: string;
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
          client_id?: string | null;
          source_opportunity_id?: string | null;
          name?: string;
          slug?: string;
          project_code?: string;
          stage?: ProjectStage;
          location?: string;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          organization_member_id: string;
          created_by: string;
          is_active: boolean;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          organization_member_id: string;
          created_by: string;
          is_active?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          organization_member_id?: string;
          created_by?: string;
          is_active?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_purchase_order_assignments: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          purchase_order_id: string;
          organization_member_id: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          purchase_order_id: string;
          organization_member_id: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          purchase_order_id?: string;
          organization_member_id?: string;
          is_active?: boolean;
          created_by?: string | null;
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
      project_quotes: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          created_by: string;
          quote_title: string;
          quote_number: string;
          client_name: string;
          company_name: string;
          contact_person: string;
          client_email: string;
          client_phone: string;
          site_address: string;
          project_name: string;
          quote_date: string | null;
          expiry_date: string | null;
          status: QuoteStatus;
          optional_items_notes: string;
          scope_exclusions: string;
          assumptions: string;
          scope_notes: string;
          subtotal: number;
          optional_subtotal: number;
          margin_percent: number;
          margin_amount: number;
          discount_amount: number;
          contingency_amount: number;
          gst_percent: number;
          gst_amount: number;
          total_quote_price: number;
          validity_period: string;
          payment_terms: string;
          retention_percent_default: number;
          lead_time: string;
          terms_inclusions: string;
          terms_exclusions: string;
          clarifications: string;
          acceptance_notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          created_by: string;
          quote_title: string;
          quote_number: string;
          client_name?: string;
          company_name?: string;
          contact_person?: string;
          client_email?: string;
          client_phone?: string;
          site_address?: string;
          project_name?: string;
          quote_date?: string | null;
          expiry_date?: string | null;
          status?: QuoteStatus;
          optional_items_notes?: string;
          scope_exclusions?: string;
          assumptions?: string;
          scope_notes?: string;
          subtotal?: number;
          optional_subtotal?: number;
          margin_percent?: number;
          margin_amount?: number;
          discount_amount?: number;
          contingency_amount?: number;
          gst_percent?: number;
          gst_amount?: number;
          total_quote_price?: number;
          validity_period?: string;
          payment_terms?: string;
          retention_percent_default?: number;
          lead_time?: string;
          terms_inclusions?: string;
          terms_exclusions?: string;
          clarifications?: string;
          acceptance_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          created_by?: string;
          quote_title?: string;
          quote_number?: string;
          client_name?: string;
          company_name?: string;
          contact_person?: string;
          client_email?: string;
          client_phone?: string;
          site_address?: string;
          project_name?: string;
          quote_date?: string | null;
          expiry_date?: string | null;
          status?: QuoteStatus;
          optional_items_notes?: string;
          scope_exclusions?: string;
          assumptions?: string;
          scope_notes?: string;
          subtotal?: number;
          optional_subtotal?: number;
          margin_percent?: number;
          margin_amount?: number;
          discount_amount?: number;
          contingency_amount?: number;
          gst_percent?: number;
          gst_amount?: number;
          total_quote_price?: number;
          validity_period?: string;
          payment_terms?: string;
          retention_percent_default?: number;
          lead_time?: string;
          terms_inclusions?: string;
          terms_exclusions?: string;
          clarifications?: string;
          acceptance_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_quote_line_items: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          quote_id: string;
          section: QuoteLineItemSection;
          description: string;
          quantity: number;
          unit: string;
          rate: number;
          total: number;
          is_optional: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          quote_id: string;
          section?: QuoteLineItemSection;
          description?: string;
          quantity?: number;
          unit?: string;
          rate?: number;
          total?: number;
          is_optional?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          quote_id?: string;
          section?: QuoteLineItemSection;
          description?: string;
          quantity?: number;
          unit?: string;
          rate?: number;
          total?: number;
          is_optional?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_quotes: {
        Row: {
          id: string;
          organization_id: string;
          opportunity_id: string;
          created_by: string;
          quote_title: string;
          quote_number: string;
          client_name: string;
          company_name: string;
          contact_person: string;
          client_email: string;
          client_phone: string;
          site_address: string;
          project_name: string;
          quote_date: string | null;
          expiry_date: string | null;
          status: QuoteStatus;
          optional_items_notes: string;
          scope_exclusions: string;
          assumptions: string;
          scope_notes: string;
          subtotal: number;
          optional_subtotal: number;
          margin_percent: number;
          margin_amount: number;
          discount_amount: number;
          contingency_amount: number;
          gst_percent: number;
          gst_amount: number;
          total_quote_price: number;
          validity_period: string;
          payment_terms: string;
          lead_time: string;
          terms_inclusions: string;
          terms_exclusions: string;
          clarifications: string;
          acceptance_notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          opportunity_id: string;
          created_by: string;
          quote_title: string;
          quote_number: string;
          client_name?: string;
          company_name?: string;
          contact_person?: string;
          client_email?: string;
          client_phone?: string;
          site_address?: string;
          project_name?: string;
          quote_date?: string | null;
          expiry_date?: string | null;
          status?: QuoteStatus;
          optional_items_notes?: string;
          scope_exclusions?: string;
          assumptions?: string;
          scope_notes?: string;
          subtotal?: number;
          optional_subtotal?: number;
          margin_percent?: number;
          margin_amount?: number;
          discount_amount?: number;
          contingency_amount?: number;
          gst_percent?: number;
          gst_amount?: number;
          total_quote_price?: number;
          validity_period?: string;
          payment_terms?: string;
          lead_time?: string;
          terms_inclusions?: string;
          terms_exclusions?: string;
          clarifications?: string;
          acceptance_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          opportunity_id?: string;
          created_by?: string;
          quote_title?: string;
          quote_number?: string;
          client_name?: string;
          company_name?: string;
          contact_person?: string;
          client_email?: string;
          client_phone?: string;
          site_address?: string;
          project_name?: string;
          quote_date?: string | null;
          expiry_date?: string | null;
          status?: QuoteStatus;
          optional_items_notes?: string;
          scope_exclusions?: string;
          assumptions?: string;
          scope_notes?: string;
          subtotal?: number;
          optional_subtotal?: number;
          margin_percent?: number;
          margin_amount?: number;
          discount_amount?: number;
          contingency_amount?: number;
          gst_percent?: number;
          gst_amount?: number;
          total_quote_price?: number;
          validity_period?: string;
          payment_terms?: string;
          lead_time?: string;
          terms_inclusions?: string;
          terms_exclusions?: string;
          clarifications?: string;
          acceptance_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_quote_line_items: {
        Row: {
          id: string;
          organization_id: string;
          quote_id: string;
          section: QuoteLineItemSection;
          description: string;
          quantity: number;
          unit: string;
          rate: number;
          total: number;
          is_optional: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          quote_id: string;
          section?: QuoteLineItemSection;
          description?: string;
          quantity?: number;
          unit?: string;
          rate?: number;
          total?: number;
          is_optional?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          quote_id?: string;
          section?: QuoteLineItemSection;
          description?: string;
          quantity?: number;
          unit?: string;
          rate?: number;
          total?: number;
          is_optional?: boolean;
          sort_order?: number;
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
      add_project_member: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_organization_member_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          project_id: string;
          organization_member_id: string;
          created_by: string;
          is_active: boolean;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      remove_project_member: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_organization_member_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          project_id: string;
          organization_member_id: string;
          created_by: string;
          is_active: boolean;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      list_project_members: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          project_id: string;
          organization_member_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          role: string;
          user_id: string;
          display_name: string;
          avatar_path: string | null;
        }[];
      };
      add_purchase_order_assignment: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_purchase_order_id: string;
          p_organization_member_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          project_id: string;
          purchase_order_id: string;
          organization_member_id: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      remove_purchase_order_assignment: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_purchase_order_id: string;
          p_organization_member_id: string;
        };
        Returns: undefined;
      };
      list_purchase_order_assignments: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_purchase_order_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          project_id: string;
          purchase_order_id: string;
          organization_member_id: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      list_worker_assigned_purchase_orders: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_organization_member_id: string;
        };
        Returns: {
          id: string;
          purchase_order_number: string;
          title: string;
          status: string;
          created_at: string;
        }[];
      };
      has_permission: {
        Args: {
          p_permission_key: string;
        };
        Returns: boolean;
      };
      reorder_client_notes: {
        Args: {
          p_client_id: string;
          p_ordered_ids: string[];
        };
        Returns: undefined;
      };
      get_organization_member_emails: {
        Args: {
          p_organization_id: string;
        };
        Returns: {
          user_id: string;
          email: string;
        }[];
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
