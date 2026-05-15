export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_chat_conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          last_message_at: string
          organization_id: string
          project_slug: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id: string
          project_slug: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string
          project_slug?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          organization_id: string | null
          project_slug: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          project_slug: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          project_slug?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_usage: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          plan_tier: string
          project_slug: string | null
          reservation_state: string
          response_chars: number
          tokens_used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          plan_tier?: string
          project_slug?: string | null
          reservation_state?: string
          response_chars?: number
          tokens_used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          plan_tier?: string
          project_slug?: string | null
          reservation_state?: string
          response_chars?: number
          tokens_used?: number
          user_id?: string
        }
        Relationships: []
      }
      app_permissions: {
        Row: {
          created_at: string
          description: string
          permission_key: string
        }
        Insert: {
          created_at?: string
          description?: string
          permission_key: string
        }
        Update: {
          created_at?: string
          description?: string
          permission_key?: string
        }
        Relationships: []
      }
      change_detection_runs: {
        Row: {
          baseline_revision: string
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          organization_id: string
          project_id: string
          result_json: Json
          revised_file_name: string
          revised_revision: string
          status: string
          trade_pack_id: string
          updated_at: string
          validation_json: Json
        }
        Insert: {
          baseline_revision?: string
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          organization_id: string
          project_id: string
          result_json?: Json
          revised_file_name: string
          revised_revision?: string
          status?: string
          trade_pack_id: string
          updated_at?: string
          validation_json?: Json
        }
        Update: {
          baseline_revision?: string
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          result_json?: Json
          revised_file_name?: string
          revised_revision?: string
          status?: string
          trade_pack_id?: string
          updated_at?: string
          validation_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "change_detection_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_detection_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_detection_runs_trade_pack_id_fkey"
            columns: ["trade_pack_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_name: string
          body: string
          client_id: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          author_name?: string
          body: string
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          body?: string
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          building_type: string | null
          category: string
          change_reason: string | null
          change_type: string | null
          classification_confidence: number | null
          classification_source: string | null
          confirmed_at: string | null
          confirmed_by_user_id: string | null
          cost_code: string | null
          cost_type: string | null
          created_at: string
          created_by: string | null
          description: string
          effective_from: string
          effective_to: string | null
          final_classification: Json | null
          id: string
          is_current: boolean
          is_optional: boolean
          item_code: string
          item_type: string
          job_size: string | null
          line_total: number
          linked_claim_line_item_id: string | null
          linked_opportunity_quote_line_item_id: string | null
          linked_purchase_order_line_item_id: string | null
          linked_quote_line_item_id: string | null
          linked_variation_line_item_id: string | null
          location_region: string | null
          needs_review: boolean | null
          normalized_description: string | null
          organization_id: string
          origin_kind: string
          original_classification: Json | null
          parent_cost_item_id: string | null
          price_source: string | null
          project_id: string
          project_type: string | null
          quantity: number
          raw_description: string | null
          section: string
          sector: string | null
          sort_order: number
          source_document_id: string
          source_document_kind: string
          source_fingerprint: string
          source_line_id: string | null
          source_line_table: string | null
          source_revision_key: string
          source_snapshot: Json
          status: string
          supplier_id: string | null
          supplier_name_snapshot: string | null
          title: string
          trade_id: string | null
          trade_label: string | null
          unit: string
          unit_rate: number
          updated_at: string
          work_type: string | null
        }
        Insert: {
          building_type?: string | null
          category?: string
          change_reason?: string | null
          change_type?: string | null
          classification_confidence?: number | null
          classification_source?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          cost_code?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          effective_from?: string
          effective_to?: string | null
          final_classification?: Json | null
          id?: string
          is_current?: boolean
          is_optional?: boolean
          item_code?: string
          item_type?: string
          job_size?: string | null
          line_total?: number
          linked_claim_line_item_id?: string | null
          linked_opportunity_quote_line_item_id?: string | null
          linked_purchase_order_line_item_id?: string | null
          linked_quote_line_item_id?: string | null
          linked_variation_line_item_id?: string | null
          location_region?: string | null
          needs_review?: boolean | null
          normalized_description?: string | null
          organization_id: string
          origin_kind?: string
          original_classification?: Json | null
          parent_cost_item_id?: string | null
          price_source?: string | null
          project_id: string
          project_type?: string | null
          quantity?: number
          raw_description?: string | null
          section?: string
          sector?: string | null
          sort_order?: number
          source_document_id: string
          source_document_kind: string
          source_fingerprint?: string
          source_line_id?: string | null
          source_line_table?: string | null
          source_revision_key?: string
          source_snapshot?: Json
          status?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          title?: string
          trade_id?: string | null
          trade_label?: string | null
          unit?: string
          unit_rate?: number
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          building_type?: string | null
          category?: string
          change_reason?: string | null
          change_type?: string | null
          classification_confidence?: number | null
          classification_source?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          cost_code?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          effective_from?: string
          effective_to?: string | null
          final_classification?: Json | null
          id?: string
          is_current?: boolean
          is_optional?: boolean
          item_code?: string
          item_type?: string
          job_size?: string | null
          line_total?: number
          linked_claim_line_item_id?: string | null
          linked_opportunity_quote_line_item_id?: string | null
          linked_purchase_order_line_item_id?: string | null
          linked_quote_line_item_id?: string | null
          linked_variation_line_item_id?: string | null
          location_region?: string | null
          needs_review?: boolean | null
          normalized_description?: string | null
          organization_id?: string
          origin_kind?: string
          original_classification?: Json | null
          parent_cost_item_id?: string | null
          price_source?: string | null
          project_id?: string
          project_type?: string | null
          quantity?: number
          raw_description?: string | null
          section?: string
          sector?: string | null
          sort_order?: number
          source_document_id?: string
          source_document_kind?: string
          source_fingerprint?: string
          source_line_id?: string | null
          source_line_table?: string | null
          source_revision_key?: string
          source_snapshot?: Json
          status?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          title?: string
          trade_id?: string | null
          trade_label?: string | null
          unit?: string
          unit_rate?: number
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_linked_claim_line_item_id_fkey"
            columns: ["linked_claim_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_claim_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_linked_opportunity_quote_line_item_id_fkey"
            columns: ["linked_opportunity_quote_line_item_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quote_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_linked_purchase_order_line_item_id_fkey"
            columns: ["linked_purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_linked_quote_line_item_id_fkey"
            columns: ["linked_quote_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_quote_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_linked_variation_line_item_id_fkey"
            columns: ["linked_variation_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_variation_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_parent_cost_item_id_fkey"
            columns: ["parent_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permission_overrides: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_allowed: boolean
          organization_member_id: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_allowed: boolean
          organization_member_id: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_allowed?: boolean
          organization_member_id?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permission_overrides_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      opportunity_quote_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          is_optional: boolean
          organization_id: string
          quantity: number
          quote_id: string
          rate: number
          section: string
          sort_order: number
          total: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_optional?: boolean
          organization_id: string
          quantity?: number
          quote_id: string
          rate?: number
          section: string
          sort_order?: number
          total?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_optional?: boolean
          organization_id?: string
          quantity?: number
          quote_id?: string
          rate?: number
          section?: string
          sort_order?: number
          total?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_quote_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_quotes: {
        Row: {
          acceptance_notes: string
          assumptions: string
          clarifications: string
          client_email: string
          client_name: string
          client_phone: string
          company_name: string
          contact_person: string
          contingency_amount: number
          created_at: string
          created_by: string
          discount_amount: number
          expiry_date: string | null
          gst_amount: number
          gst_percent: number
          id: string
          lead_time: string
          margin_amount: number
          margin_percent: number
          opportunity_id: string
          optional_items_notes: string
          optional_subtotal: number
          organization_id: string
          payment_terms: string
          project_name: string
          quote_date: string | null
          quote_number: string
          quote_title: string
          scope_exclusions: string
          scope_notes: string
          site_address: string
          status: string
          subtotal: number
          terms_exclusions: string
          terms_inclusions: string
          total_quote_price: number
          updated_at: string
          validity_period: string
        }
        Insert: {
          acceptance_notes?: string
          assumptions?: string
          clarifications?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          company_name?: string
          contact_person?: string
          contingency_amount?: number
          created_at?: string
          created_by: string
          discount_amount?: number
          expiry_date?: string | null
          gst_amount?: number
          gst_percent?: number
          id?: string
          lead_time?: string
          margin_amount?: number
          margin_percent?: number
          opportunity_id: string
          optional_items_notes?: string
          optional_subtotal?: number
          organization_id: string
          payment_terms?: string
          project_name?: string
          quote_date?: string | null
          quote_number: string
          quote_title?: string
          scope_exclusions?: string
          scope_notes?: string
          site_address?: string
          status?: string
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_quote_price?: number
          updated_at?: string
          validity_period?: string
        }
        Update: {
          acceptance_notes?: string
          assumptions?: string
          clarifications?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          company_name?: string
          contact_person?: string
          contingency_amount?: number
          created_at?: string
          created_by?: string
          discount_amount?: number
          expiry_date?: string | null
          gst_amount?: number
          gst_percent?: number
          id?: string
          lead_time?: string
          margin_amount?: number
          margin_percent?: number
          opportunity_id?: string
          optional_items_notes?: string
          optional_subtotal?: number
          organization_id?: string
          payment_terms?: string
          project_name?: string
          quote_date?: string | null
          quote_number?: string
          quote_title?: string
          scope_exclusions?: string
          scope_notes?: string
          site_address?: string
          status?: string
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_quote_price?: number
          updated_at?: string
          validity_period?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_client_contacts: {
        Row: {
          client_id: string
          contact_kind: string
          created_at: string
          id: string
          label: string
          organization_id: string
          receives_messages: boolean
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          client_id: string
          contact_kind: string
          created_at?: string
          id?: string
          label: string
          organization_id: string
          receives_messages?: boolean
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          client_id?: string
          contact_kind?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          receives_messages?: boolean
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_client_contacts_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_client_locations: {
        Row: {
          address_line_1: string
          city: string | null
          client_id: string
          country: string | null
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          postal_code: string | null
          region: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          address_line_1: string
          city?: string | null
          client_id: string
          country?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          postal_code?: string | null
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address_line_1?: string
          city?: string | null
          client_id?: string
          country?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          postal_code?: string | null
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_client_locations_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_client_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_clients: {
        Row: {
          client_status: string | null
          client_type: string | null
          company_name: string
          created_at: string
          created_by: string
          credit_risk: string | null
          default_margin_percent: number | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_source: string | null
          name: string
          notes: string | null
          organization_id: string
          payment_terms_days: number | null
          phone: string | null
          primary_name_source: string | null
          referred_by: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          client_status?: string | null
          client_type?: string | null
          company_name: string
          created_at?: string
          created_by: string
          credit_risk?: string | null
          default_margin_percent?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          name: string
          notes?: string | null
          organization_id: string
          payment_terms_days?: number | null
          phone?: string | null
          primary_name_source?: string | null
          referred_by?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          client_status?: string | null
          client_type?: string | null
          company_name?: string
          created_at?: string
          created_by?: string
          credit_risk?: string | null
          default_margin_percent?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          primary_name_source?: string | null
          referred_by?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_cost_code_mapping_rules: {
        Row: {
          cost_type: string | null
          created_at: string
          created_by: string | null
          id: string
          intelligence_cost_code: string | null
          is_active: boolean
          notes: string | null
          organization_id: string
          priority: number
          rule_type: string
          target_cost_code_id: string
          updated_at: string
          work_type: string | null
        }
        Insert: {
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intelligence_cost_code?: string | null
          is_active?: boolean
          notes?: string | null
          organization_id: string
          priority?: number
          rule_type: string
          target_cost_code_id: string
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intelligence_cost_code?: string | null
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          priority?: number
          rule_type?: string
          target_cost_code_id?: string
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_cost_code_mapping_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_cost_code_mapping_rules_target_cost_code_fkey"
            columns: ["organization_id", "target_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_cost_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          external_code: string | null
          external_provider: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_code?: string | null
          external_provider?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_code?: string | null
          external_provider?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_cost_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invite_audit_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          invite_id: string | null
          organization_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          invite_id?: string | null
          organization_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          invite_id?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invite_audit_logs_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "organization_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invite_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          invited_name: string | null
          organization_id: string
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          invited_name?: string | null
          organization_id: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          invited_name?: string | null
          organization_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          id?: string
          organization_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_opportunities: {
        Row: {
          client_id: string | null
          converted_at: string | null
          converted_project_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          estimated_value: number
          id: string
          location: string
          name: string
          notes: string
          opportunity_code: string
          organization_id: string
          owner_user_id: string | null
          quoted_at: string | null
          slug: string
          stage: string
          updated_at: string
          workspace_project_id: string | null
        }
        Insert: {
          client_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          estimated_value?: number
          id?: string
          location?: string
          name: string
          notes?: string
          opportunity_code: string
          organization_id: string
          owner_user_id?: string | null
          quoted_at?: string | null
          slug: string
          stage?: string
          updated_at?: string
          workspace_project_id?: string | null
        }
        Update: {
          client_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          estimated_value?: number
          id?: string
          location?: string
          name?: string
          notes?: string
          opportunity_code?: string
          organization_id?: string
          owner_user_id?: string | null
          quoted_at?: string | null
          slug?: string
          stage?: string
          updated_at?: string
          workspace_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_opportunities_converted_project_id_fkey"
            columns: ["converted_project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_opportunities_workspace_project_id_fkey"
            columns: ["workspace_project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_plan_settings: {
        Row: {
          created_at: string
          monthly_trade_pack_limit: number
          organization_id: string
          plan_tier: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          monthly_trade_pack_limit?: number
          organization_id: string
          plan_tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          monthly_trade_pack_limit?: number
          organization_id?: string
          plan_tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_plan_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_projects: {
        Row: {
          client_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          id: string
          location: string
          name: string
          organization_id: string
          project_code: string
          slug: string
          source_opportunity_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          location?: string
          name: string
          organization_id: string
          project_code: string
          slug: string
          source_opportunity_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          location?: string
          name?: string
          organization_id?: string
          project_code?: string
          slug?: string
          source_opportunity_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_projects_source_opportunity_id_fkey"
            columns: ["source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_suppliers: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          created_by: string
          default_payment_terms: string
          default_tax_rate_id: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          organization_id: string
          phone: string | null
          source: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string
          created_at?: string
          created_by: string
          default_payment_terms?: string
          default_tax_rate_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          organization_id: string
          phone?: string | null
          source?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          created_by?: string
          default_payment_terms?: string
          default_tax_rate_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          source?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          bank_account_details: string | null
          brand_accent_color: string | null
          brand_primary_color: string | null
          business_number: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          created_by: string
          default_currency: string
          default_tax_mode: string
          default_tax_rate: number
          gst_number: string | null
          id: string
          logo_path: string | null
          name: string
          postcode: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          bank_account_details?: string | null
          brand_accent_color?: string | null
          brand_primary_color?: string | null
          business_number?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          default_currency?: string
          default_tax_mode?: string
          default_tax_rate?: number
          gst_number?: string | null
          id?: string
          logo_path?: string | null
          name: string
          postcode?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          bank_account_details?: string | null
          brand_accent_color?: string | null
          brand_primary_color?: string | null
          business_number?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          default_currency?: string
          default_tax_mode?: string
          default_tax_rate?: number
          gst_number?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          postcode?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_claim_line_items: {
        Row: {
          claim_amount: number
          claim_id: string
          claim_percent: number
          cost_item_id: string | null
          created_at: string
          cumulative_claimed_amount: number
          cumulative_claimed_percent: number
          description: string
          id: string
          line_uid: string
          organization_id: string
          previously_claimed_amount: number
          previously_claimed_percent: number
          project_id: string
          quantity: number
          rate: number
          section: string
          sort_order: number
          source_cost_item_id: string | null
          source_document_id: string
          source_kind: string
          source_line_item_id: string
          source_number: string
          source_title: string
          source_total: number
          unit: string
          updated_at: string
        }
        Insert: {
          claim_amount?: number
          claim_id: string
          claim_percent?: number
          cost_item_id?: string | null
          created_at?: string
          cumulative_claimed_amount?: number
          cumulative_claimed_percent?: number
          description?: string
          id?: string
          line_uid: string
          organization_id: string
          previously_claimed_amount?: number
          previously_claimed_percent?: number
          project_id: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_cost_item_id?: string | null
          source_document_id: string
          source_kind: string
          source_line_item_id: string
          source_number?: string
          source_title?: string
          source_total?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          claim_amount?: number
          claim_id?: string
          claim_percent?: number
          cost_item_id?: string | null
          created_at?: string
          cumulative_claimed_amount?: number
          cumulative_claimed_percent?: number
          description?: string
          id?: string
          line_uid?: string
          organization_id?: string
          previously_claimed_amount?: number
          previously_claimed_percent?: number
          project_id?: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_cost_item_id?: string | null
          source_document_id?: string
          source_kind?: string
          source_line_item_id?: string
          source_number?: string
          source_title?: string
          source_total?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_claim_line_items_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claim_line_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claim_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claim_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claim_line_items_source_cost_item_id_fkey"
            columns: ["source_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_claims: {
        Row: {
          claim_amount: number
          claim_date: string | null
          claim_number: string
          claim_title: string
          claim_type: string
          created_at: string
          created_by: string
          due_date: string | null
          gst_amount: number
          id: string
          linked_approved_variations: number
          linked_quote_value: number
          net_claim_excl_gst: number
          notes: string
          organization_id: string
          paid_amount: number
          percent_complete: number
          period_end: string | null
          period_start: string | null
          previous_claims_total: number
          project_id: string
          retention_balance: number
          retention_held_to_date: number
          retention_method: string
          retention_percent: number
          retention_released_amount: number
          retention_released_to_date: number
          retention_scale_bands: Json | null
          retention_withheld_amount: number
          revised_contract_value: number
          status: string
          total_payable: number
          updated_at: string
        }
        Insert: {
          claim_amount?: number
          claim_date?: string | null
          claim_number: string
          claim_title: string
          claim_type?: string
          created_at?: string
          created_by: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          linked_approved_variations?: number
          linked_quote_value?: number
          net_claim_excl_gst?: number
          notes?: string
          organization_id: string
          paid_amount?: number
          percent_complete?: number
          period_end?: string | null
          period_start?: string | null
          previous_claims_total?: number
          project_id: string
          retention_balance?: number
          retention_held_to_date?: number
          retention_method?: string
          retention_percent?: number
          retention_released_amount?: number
          retention_released_to_date?: number
          retention_scale_bands?: Json | null
          retention_withheld_amount?: number
          revised_contract_value?: number
          status?: string
          total_payable?: number
          updated_at?: string
        }
        Update: {
          claim_amount?: number
          claim_date?: string | null
          claim_number?: string
          claim_title?: string
          claim_type?: string
          created_at?: string
          created_by?: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          linked_approved_variations?: number
          linked_quote_value?: number
          net_claim_excl_gst?: number
          notes?: string
          organization_id?: string
          paid_amount?: number
          percent_complete?: number
          period_end?: string | null
          period_start?: string | null
          previous_claims_total?: number
          project_id?: string
          retention_balance?: number
          retention_held_to_date?: number
          retention_method?: string
          retention_percent?: number
          retention_released_amount?: number
          retention_released_to_date?: number
          retention_scale_bands?: Json | null
          retention_withheld_amount?: number
          revised_contract_value?: number
          status?: string
          total_payable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_document_counters: {
        Row: {
          document_kind: string
          last_number: number
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          document_kind: string
          last_number?: number
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          document_kind?: string
          last_number?: number
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_document_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_drawing_sets: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number
          id: string
          mime_type: string | null
          organization_id: string
          project_id: string
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes: number
          id?: string
          mime_type?: string | null
          organization_id: string
          project_id: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string | null
          organization_id?: string
          project_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_drawing_sets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_drawing_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_job_todo_attachments: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string
          organization_id: string
          project_id: string
          todo_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type?: string
          organization_id: string
          project_id: string
          todo_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string
          organization_id?: string
          project_id?: string
          todo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_job_todo_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todo_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todo_attachments_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "project_job_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      project_job_todos: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          due_at: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          linked_client_id: string | null
          linked_inspection_id: string | null
          linked_inspection_item_id: string | null
          linked_issue_id: string | null
          linked_purchase_order_id: string | null
          linked_quote_id: string | null
          linked_variation_id: string | null
          metadata: Json
          opportunity_id: string | null
          organization_id: string
          priority: string
          project_id: string
          source_id: string | null
          source_type: string | null
          status: string
          task_type: string | null
          title: string
          trade: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          due_at?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          linked_client_id?: string | null
          linked_inspection_id?: string | null
          linked_inspection_item_id?: string | null
          linked_issue_id?: string | null
          linked_purchase_order_id?: string | null
          linked_quote_id?: string | null
          linked_variation_id?: string | null
          metadata?: Json
          opportunity_id?: string | null
          organization_id: string
          priority?: string
          project_id: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          task_type?: string | null
          title: string
          trade?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          due_at?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          linked_client_id?: string | null
          linked_inspection_id?: string | null
          linked_inspection_item_id?: string | null
          linked_issue_id?: string | null
          linked_purchase_order_id?: string | null
          linked_quote_id?: string | null
          linked_variation_id?: string | null
          metadata?: Json
          opportunity_id?: string | null
          organization_id?: string
          priority?: string
          project_id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          task_type?: string | null
          title?: string
          trade?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_job_todos_linked_client_id_fkey"
            columns: ["linked_client_id"]
            isOneToOne: false
            referencedRelation: "organization_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_inspection_id_fkey"
            columns: ["linked_inspection_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_inspection_item_id_fkey"
            columns: ["linked_inspection_item_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_issue_id_fkey"
            columns: ["linked_issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_purchase_order_id_fkey"
            columns: ["linked_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_quote_id_fkey"
            columns: ["linked_quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_linked_variation_id_fkey"
            columns: ["linked_variation_id"]
            isOneToOne: false
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_job_todos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_labour_budgets: {
        Row: {
          budgeted_cost: number
          budgeted_hours: number
          cost_code: string
          cost_code_label: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          project_id: string
          quoted_allowance_cost: number
          quoted_allowance_hours: number
          updated_at: string
        }
        Insert: {
          budgeted_cost?: number
          budgeted_hours?: number
          cost_code?: string
          cost_code_label?: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          project_id: string
          quoted_allowance_cost?: number
          quoted_allowance_hours?: number
          updated_at?: string
        }
        Update: {
          budgeted_cost?: number
          budgeted_hours?: number
          cost_code?: string
          cost_code_label?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          project_id?: string
          quoted_allowance_cost?: number
          quoted_allowance_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_labour_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_labour_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_labour_time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_clocked_out: boolean
          auto_clocked_out_at: string | null
          break_minutes: number
          clock_in_accuracy_meters: number | null
          clock_in_latitude: number | null
          clock_in_longitude: number | null
          clock_out_accuracy_meters: number | null
          clock_out_latitude: number | null
          clock_out_longitude: number | null
          cost_code: string | null
          cost_code_label: string | null
          created_at: string
          created_by: string
          end_at: string | null
          entry_date: string
          hourly_rate: number
          hours_worked: number | null
          id: string
          is_break_missed: boolean
          is_early_finish: boolean
          is_late_start: boolean
          is_no_show: boolean
          is_productive: boolean
          is_project_mismatch: boolean
          is_variation_work: boolean
          labour_cost: number | null
          manual_edit_required_approval: boolean
          notes: string
          organization_id: string
          project_id: string
          project_stage: string
          reminder_sent_at: string | null
          start_at: string | null
          status: string
          submitted: boolean
          supervisor_name: string
          task_area: string
          team_name: string
          time_category: string
          updated_at: string
          variation_reference: string
          worker_member_id: string | null
          worker_name: string
          worker_user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_clocked_out?: boolean
          auto_clocked_out_at?: string | null
          break_minutes?: number
          clock_in_accuracy_meters?: number | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out_accuracy_meters?: number | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          cost_code?: string | null
          cost_code_label?: string | null
          created_at?: string
          created_by: string
          end_at?: string | null
          entry_date?: string
          hourly_rate?: number
          hours_worked?: number | null
          id?: string
          is_break_missed?: boolean
          is_early_finish?: boolean
          is_late_start?: boolean
          is_no_show?: boolean
          is_productive?: boolean
          is_project_mismatch?: boolean
          is_variation_work?: boolean
          labour_cost?: number | null
          manual_edit_required_approval?: boolean
          notes?: string
          organization_id: string
          project_id: string
          project_stage?: string
          reminder_sent_at?: string | null
          start_at?: string | null
          status?: string
          submitted?: boolean
          supervisor_name?: string
          task_area?: string
          team_name?: string
          time_category?: string
          updated_at?: string
          variation_reference?: string
          worker_member_id?: string | null
          worker_name: string
          worker_user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_clocked_out?: boolean
          auto_clocked_out_at?: string | null
          break_minutes?: number
          clock_in_accuracy_meters?: number | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out_accuracy_meters?: number | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          cost_code?: string | null
          cost_code_label?: string | null
          created_at?: string
          created_by?: string
          end_at?: string | null
          entry_date?: string
          hourly_rate?: number
          hours_worked?: number | null
          id?: string
          is_break_missed?: boolean
          is_early_finish?: boolean
          is_late_start?: boolean
          is_no_show?: boolean
          is_productive?: boolean
          is_project_mismatch?: boolean
          is_variation_work?: boolean
          labour_cost?: number | null
          manual_edit_required_approval?: boolean
          notes?: string
          organization_id?: string
          project_id?: string
          project_stage?: string
          reminder_sent_at?: string | null
          start_at?: string | null
          status?: string
          submitted?: boolean
          supervisor_name?: string
          task_area?: string
          team_name?: string
          time_category?: string
          updated_at?: string
          variation_reference?: string
          worker_member_id?: string | null
          worker_name?: string
          worker_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_labour_time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_labour_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_labour_time_entries_worker_member_id_fkey"
            columns: ["worker_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          removed_at: string | null
          removed_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          removed_at?: string | null
          removed_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          organization_member_id?: string
          project_id?: string
          removed_at?: string | null
          removed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_order_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          purchase_order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          purchase_order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          organization_member_id?: string
          project_id?: string
          purchase_order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_order_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_assignments_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_assignments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_order_attachments: {
        Row: {
          created_at: string
          external_url: string | null
          file_kind: string
          file_name: string
          id: string
          notes: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_kind?: string
          file_name: string
          id?: string
          notes?: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_kind?: string
          file_name?: string
          id?: string
          notes?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_order_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_attachments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_order_invoice_items: {
        Row: {
          amount: number
          created_at: string
          exported_at: string | null
          id: string
          invoice_reference: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          ready_at: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_reference?: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          ready_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_reference?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          ready_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_order_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_invoice_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_invoice_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: true
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_order_line_items: {
        Row: {
          cost_item_id: string | null
          created_at: string
          description: string
          id: string
          line_uid: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          quantity: number
          rate: number
          section: string
          sort_order: number
          source_cost_item_id: string | null
          source_time_sheet_entry_id: string | null
          total: number
          unit: string
          updated_at: string
        }
        Insert: {
          cost_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          line_uid: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_cost_item_id?: string | null
          source_time_sheet_entry_id?: string | null
          total?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          cost_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          line_uid?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_cost_item_id?: string | null
          source_time_sheet_entry_id?: string | null
          total?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_order_line_ite_source_time_sheet_entry_id_fkey"
            columns: ["source_time_sheet_entry_id"]
            isOneToOne: false
            referencedRelation: "project_time_sheet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_line_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_line_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_line_items_source_cost_item_id_fkey"
            columns: ["source_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_order_status_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          note: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_order_status_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_status_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_order_status_events_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchase_orders: {
        Row: {
          approved_at: string | null
          contingency_amount: number
          created_at: string
          created_by: string
          discount_amount: number
          due_date: string | null
          gst_percent: number
          gst_total: number
          id: string
          include_contingency_in_export: boolean
          include_discount_in_export: boolean
          include_margin_in_export: boolean
          invoice_ready: boolean
          issued_to_label: string
          labour_total: number
          margin_percent: number
          margin_total: number
          materials_total: number
          notes: string
          organization_id: string
          origin: string
          plant_total: number
          project_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by: string
          requested_date: string | null
          sent_to_client_at: string | null
          status: string
          subcontractors_total: number
          subtotal: number
          supplier_contact: string
          supplier_email_snapshot: string
          supplier_id: string | null
          supplier_name_snapshot: string
          supplier_phone_snapshot: string
          total_purchase_order_price: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          contingency_amount?: number
          created_at?: string
          created_by: string
          discount_amount?: number
          due_date?: string | null
          gst_percent?: number
          gst_total?: number
          id?: string
          include_contingency_in_export?: boolean
          include_discount_in_export?: boolean
          include_margin_in_export?: boolean
          invoice_ready?: boolean
          issued_to_label?: string
          labour_total?: number
          margin_percent?: number
          margin_total?: number
          materials_total?: number
          notes?: string
          organization_id: string
          origin?: string
          plant_total?: number
          project_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by?: string
          requested_date?: string | null
          sent_to_client_at?: string | null
          status?: string
          subcontractors_total?: number
          subtotal?: number
          supplier_contact?: string
          supplier_email_snapshot?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string
          supplier_phone_snapshot?: string
          total_purchase_order_price?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          contingency_amount?: number
          created_at?: string
          created_by?: string
          discount_amount?: number
          due_date?: string | null
          gst_percent?: number
          gst_total?: number
          id?: string
          include_contingency_in_export?: boolean
          include_discount_in_export?: boolean
          include_margin_in_export?: boolean
          invoice_ready?: boolean
          issued_to_label?: string
          labour_total?: number
          margin_percent?: number
          margin_total?: number
          materials_total?: number
          notes?: string
          organization_id?: string
          origin?: string
          plant_total?: number
          project_id?: string
          purchase_order_number?: string
          purchase_order_title?: string
          requested_by?: string
          requested_date?: string | null
          sent_to_client_at?: string | null
          status?: string
          subcontractors_total?: number
          subtotal?: number
          supplier_contact?: string
          supplier_email_snapshot?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string
          supplier_phone_snapshot?: string
          total_purchase_order_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_inspection_activity: {
        Row: {
          action: string
          actor_name: string
          actor_user_id: string | null
          created_at: string
          detail: string
          id: string
          inspection_id: string
          inspection_item_id: string | null
          organization_id: string
          project_id: string
        }
        Insert: {
          action: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          inspection_id: string
          inspection_item_id?: string | null
          organization_id: string
          project_id: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          inspection_id?: string
          inspection_item_id?: string | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_inspection_activity_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspection_activity_inspection_item_id_fkey"
            columns: ["inspection_item_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspection_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspection_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_inspection_items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          inspection_id: string
          label: string
          notes: string
          organization_id: string
          photo_storage_path: string | null
          photo_url: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          inspection_id: string
          label: string
          notes?: string
          organization_id: string
          photo_storage_path?: string | null
          photo_url?: string
          project_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          inspection_id?: string
          label?: string
          notes?: string
          organization_id?: string
          photo_storage_path?: string | null
          photo_url?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspection_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspection_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_inspections: {
        Row: {
          assignee_name: string
          assignee_user_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          location: string
          organization_id: string
          project_id: string
          scheduled_at: string
          template_name: string
          title: string
          trade: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string
          assignee_user_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          location?: string
          organization_id: string
          project_id: string
          scheduled_at?: string
          template_name?: string
          title: string
          trade?: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          location?: string
          organization_id?: string
          project_id?: string
          scheduled_at?: string
          template_name?: string
          title?: string
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_inspections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_issue_activity: {
        Row: {
          action: string
          actor_name: string
          actor_user_id: string | null
          created_at: string
          detail: string
          id: string
          issue_id: string
          organization_id: string
          project_id: string
        }
        Insert: {
          action: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          issue_id: string
          organization_id: string
          project_id: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          issue_id?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_issue_activity_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_issue_comments: {
        Row: {
          author_name: string
          comment: string
          created_at: string
          created_by: string
          id: string
          issue_id: string
          organization_id: string
          project_id: string
        }
        Insert: {
          author_name?: string
          comment: string
          created_at?: string
          created_by: string
          id?: string
          issue_id: string
          organization_id: string
          project_id: string
        }
        Update: {
          author_name?: string
          comment?: string
          created_at?: string
          created_by?: string
          id?: string
          issue_id?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_issue_comments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_issue_photos: {
        Row: {
          created_at: string
          created_by: string
          id: string
          issue_id: string
          organization_id: string
          photo_url: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          issue_id: string
          organization_id: string
          photo_url: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          issue_id?: string
          organization_id?: string
          photo_url?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_issue_photos_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issue_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_issues: {
        Row: {
          area: string | null
          assignee_name: string
          assignee_user_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          id: string
          linked_work_proof_id: string | null
          location: string
          organization_id: string
          priority: string
          project_id: string
          status: string
          title: string
          trade: string
          trade_type: string | null
          updated_at: string
          work_category: string | null
        }
        Insert: {
          area?: string | null
          assignee_name?: string
          assignee_user_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          description?: string
          due_date?: string | null
          id?: string
          linked_work_proof_id?: string | null
          location?: string
          organization_id: string
          priority?: string
          project_id: string
          status?: string
          title: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          work_category?: string | null
        }
        Update: {
          area?: string | null
          assignee_name?: string
          assignee_user_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          id?: string
          linked_work_proof_id?: string | null
          location?: string
          organization_id?: string
          priority?: string
          project_id?: string
          status?: string
          title?: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          work_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_issues_linked_work_proof_id_fkey"
            columns: ["linked_work_proof_id"]
            isOneToOne: false
            referencedRelation: "project_quality_work_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_photos: {
        Row: {
          area: string | null
          assigned_user_id: string | null
          assigned_user_name: string
          captured_at: string
          category: string
          created_at: string
          created_by: string
          has_signoff_evidence: boolean
          id: string
          linked_inspection_id: string | null
          linked_inspection_item_id: string | null
          linked_issue_id: string | null
          linked_work_proof_id: string | null
          location: string
          notes: string
          organization_id: string
          phase_tag: string | null
          photo_type: string
          photo_url: string
          project_id: string
          status_tag: string
          storage_path: string | null
          title: string
          trade: string
          trade_type: string | null
          updated_at: string
          uploaded_by_name: string
          uploaded_by_user_id: string | null
          work_category: string | null
        }
        Insert: {
          area?: string | null
          assigned_user_id?: string | null
          assigned_user_name?: string
          captured_at?: string
          category?: string
          created_at?: string
          created_by: string
          has_signoff_evidence?: boolean
          id?: string
          linked_inspection_id?: string | null
          linked_inspection_item_id?: string | null
          linked_issue_id?: string | null
          linked_work_proof_id?: string | null
          location?: string
          notes?: string
          organization_id: string
          phase_tag?: string | null
          photo_type?: string
          photo_url: string
          project_id: string
          status_tag?: string
          storage_path?: string | null
          title?: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          uploaded_by_name?: string
          uploaded_by_user_id?: string | null
          work_category?: string | null
        }
        Update: {
          area?: string | null
          assigned_user_id?: string | null
          assigned_user_name?: string
          captured_at?: string
          category?: string
          created_at?: string
          created_by?: string
          has_signoff_evidence?: boolean
          id?: string
          linked_inspection_id?: string | null
          linked_inspection_item_id?: string | null
          linked_issue_id?: string | null
          linked_work_proof_id?: string | null
          location?: string
          notes?: string
          organization_id?: string
          phase_tag?: string | null
          photo_type?: string
          photo_url?: string
          project_id?: string
          status_tag?: string
          storage_path?: string | null
          title?: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          uploaded_by_name?: string
          uploaded_by_user_id?: string | null
          work_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_photos_linked_inspection_id_fkey"
            columns: ["linked_inspection_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_photos_linked_inspection_item_id_fkey"
            columns: ["linked_inspection_item_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_photos_linked_issue_id_fkey"
            columns: ["linked_issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_photos_linked_work_proof_id_fkey"
            columns: ["linked_work_proof_id"]
            isOneToOne: false
            referencedRelation: "project_quality_work_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_sign_off_work_proofs: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          project_id: string
          sign_off_id: string
          work_proof_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          project_id: string
          sign_off_id: string
          work_proof_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          project_id?: string
          sign_off_id?: string
          work_proof_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_sign_off_work_proofs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_off_work_proofs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_off_work_proofs_sign_off_id_fkey"
            columns: ["sign_off_id"]
            isOneToOne: false
            referencedRelation: "project_quality_sign_offs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_off_work_proofs_work_proof_id_fkey"
            columns: ["work_proof_id"]
            isOneToOne: false
            referencedRelation: "project_quality_work_proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_sign_offs: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          area: string | null
          assignee_name: string
          assignee_user_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          linked_inspection_id: string | null
          linked_issue_id: string | null
          linked_work_proof_id: string | null
          location: string
          note: string
          organization_id: string
          project_id: string
          requested_at: string | null
          signed_at: string | null
          signed_by_name: string | null
          signed_by_user_id: string | null
          signoff_type: string
          status: string
          title: string
          trade: string
          trade_type: string | null
          updated_at: string
          work_category: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          area?: string | null
          assignee_name?: string
          assignee_user_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          linked_inspection_id?: string | null
          linked_issue_id?: string | null
          linked_work_proof_id?: string | null
          location?: string
          note?: string
          organization_id: string
          project_id: string
          requested_at?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          signoff_type?: string
          status?: string
          title: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          work_category?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          area?: string | null
          assignee_name?: string
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          linked_inspection_id?: string | null
          linked_issue_id?: string | null
          linked_work_proof_id?: string | null
          location?: string
          note?: string
          organization_id?: string
          project_id?: string
          requested_at?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          signoff_type?: string
          status?: string
          title?: string
          trade?: string
          trade_type?: string | null
          updated_at?: string
          work_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_sign_offs_linked_inspection_id_fkey"
            columns: ["linked_inspection_id"]
            isOneToOne: false
            referencedRelation: "project_quality_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_offs_linked_issue_id_fkey"
            columns: ["linked_issue_id"]
            isOneToOne: false
            referencedRelation: "project_quality_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_offs_linked_work_proof_id_fkey"
            columns: ["linked_work_proof_id"]
            isOneToOne: false
            referencedRelation: "project_quality_work_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_offs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_sign_offs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_signoff_activity: {
        Row: {
          action: string
          actor_name: string
          actor_user_id: string | null
          created_at: string
          detail: string
          id: string
          organization_id: string
          project_id: string
          signoff_id: string
        }
        Insert: {
          action: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          organization_id: string
          project_id: string
          signoff_id: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          organization_id?: string
          project_id?: string
          signoff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_signoff_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_signoff_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_signoff_activity_signoff_id_fkey"
            columns: ["signoff_id"]
            isOneToOne: false
            referencedRelation: "project_quality_sign_offs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_work_proof_checklist_items: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          label: string
          organization_id: string
          project_id: string
          updated_at: string
          work_proof_id: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          label: string
          organization_id: string
          project_id: string
          updated_at?: string
          work_proof_id: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          project_id?: string
          updated_at?: string
          work_proof_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_work_proof_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_work_proof_checklist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_work_proof_checklist_items_work_proof_id_fkey"
            columns: ["work_proof_id"]
            isOneToOne: false
            referencedRelation: "project_quality_work_proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quality_work_proofs: {
        Row: {
          area: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          note: string
          organization_id: string
          project_id: string
          status: string
          trade_type: string
          updated_at: string
          work_category: string
        }
        Insert: {
          area?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          note?: string
          organization_id: string
          project_id: string
          status?: string
          trade_type?: string
          updated_at?: string
          work_category?: string
        }
        Update: {
          area?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          organization_id?: string
          project_id?: string
          status?: string
          trade_type?: string
          updated_at?: string
          work_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quality_work_proofs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quality_work_proofs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quote_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          is_optional: boolean
          organization_id: string
          project_id: string
          quantity: number
          quote_id: string
          rate: number
          section: string
          sort_order: number
          source_opportunity_quote_id: string | null
          source_opportunity_quote_line_item_id: string | null
          source_opportunity_quote_number: string | null
          total: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_optional?: boolean
          organization_id: string
          project_id: string
          quantity?: number
          quote_id: string
          rate?: number
          section?: string
          sort_order?: number
          source_opportunity_quote_id?: string | null
          source_opportunity_quote_line_item_id?: string | null
          source_opportunity_quote_number?: string | null
          total?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_optional?: boolean
          organization_id?: string
          project_id?: string
          quantity?: number
          quote_id?: string
          rate?: number
          section?: string
          sort_order?: number
          source_opportunity_quote_id?: string | null
          source_opportunity_quote_line_item_id?: string | null
          source_opportunity_quote_number?: string | null
          total?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quote_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quote_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quote_line_items_source_opportunity_quote_id_fkey"
            columns: ["source_opportunity_quote_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quote_line_items_source_opportunity_quote_line_ite_fkey"
            columns: ["source_opportunity_quote_line_item_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quote_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quotes: {
        Row: {
          acceptance_notes: string
          assumptions: string
          clarifications: string
          client_email: string
          client_name: string
          client_phone: string
          company_name: string
          contact_person: string
          contingency_amount: number
          created_at: string
          created_by: string
          discount_amount: number
          expiry_date: string | null
          gst_amount: number
          gst_percent: number
          id: string
          lead_time: string
          margin_amount: number
          margin_percent: number
          optional_items_notes: string
          optional_subtotal: number
          organization_id: string
          payment_terms: string
          project_id: string
          project_name: string
          quote_date: string | null
          quote_number: string
          quote_title: string
          scope_exclusions: string
          scope_notes: string
          site_address: string
          source_opportunity_id: string | null
          source_opportunity_quote_id: string | null
          source_opportunity_quote_number: string | null
          status: string
          subtotal: number
          terms_exclusions: string
          terms_inclusions: string
          total_quote_price: number
          updated_at: string
          validity_period: string
        }
        Insert: {
          acceptance_notes?: string
          assumptions?: string
          clarifications?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          company_name?: string
          contact_person?: string
          contingency_amount?: number
          created_at?: string
          created_by: string
          discount_amount?: number
          expiry_date?: string | null
          gst_amount?: number
          gst_percent?: number
          id?: string
          lead_time?: string
          margin_amount?: number
          margin_percent?: number
          optional_items_notes?: string
          optional_subtotal?: number
          organization_id: string
          payment_terms?: string
          project_id: string
          project_name?: string
          quote_date?: string | null
          quote_number: string
          quote_title: string
          scope_exclusions?: string
          scope_notes?: string
          site_address?: string
          source_opportunity_id?: string | null
          source_opportunity_quote_id?: string | null
          source_opportunity_quote_number?: string | null
          status?: string
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_quote_price?: number
          updated_at?: string
          validity_period?: string
        }
        Update: {
          acceptance_notes?: string
          assumptions?: string
          clarifications?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          company_name?: string
          contact_person?: string
          contingency_amount?: number
          created_at?: string
          created_by?: string
          discount_amount?: number
          expiry_date?: string | null
          gst_amount?: number
          gst_percent?: number
          id?: string
          lead_time?: string
          margin_amount?: number
          margin_percent?: number
          optional_items_notes?: string
          optional_subtotal?: number
          organization_id?: string
          payment_terms?: string
          project_id?: string
          project_name?: string
          quote_date?: string | null
          quote_number?: string
          quote_title?: string
          scope_exclusions?: string
          scope_notes?: string
          site_address?: string
          source_opportunity_id?: string | null
          source_opportunity_quote_id?: string | null
          source_opportunity_quote_number?: string | null
          status?: string
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_quote_price?: number
          updated_at?: string
          validity_period?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quotes_source_opportunity_id_fkey"
            columns: ["source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quotes_source_opportunity_quote_id_fkey"
            columns: ["source_opportunity_quote_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_time_sheet_entries: {
        Row: {
          auto_clocked_out: boolean
          auto_clocked_out_at: string | null
          client_entry_id: string | null
          clock_in_accuracy_meters: number | null
          clock_in_at: string
          clock_in_latitude: number | null
          clock_in_longitude: number | null
          clock_out_accuracy_meters: number | null
          clock_out_at: string | null
          clock_out_latitude: number | null
          clock_out_longitude: number | null
          company_name: string
          created_at: string
          created_by: string
          created_from_device_id: string | null
          id: string
          notes: string
          organization_id: string
          project_id: string
          purchase_order_id: string | null
          purchase_order_number: string
          purchase_order_title: string
          source: string
          synced_at: string | null
          total_hours: number | null
          trade_name: string
          updated_at: string
          warning_8h5_at: string | null
          worker_member_id: string | null
          worker_name: string
          worker_user_id: string
        }
        Insert: {
          auto_clocked_out?: boolean
          auto_clocked_out_at?: string | null
          client_entry_id?: string | null
          clock_in_accuracy_meters?: number | null
          clock_in_at?: string
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out_accuracy_meters?: number | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          company_name?: string
          created_at?: string
          created_by: string
          created_from_device_id?: string | null
          id?: string
          notes?: string
          organization_id: string
          project_id: string
          purchase_order_id?: string | null
          purchase_order_number?: string
          purchase_order_title?: string
          source?: string
          synced_at?: string | null
          total_hours?: number | null
          trade_name?: string
          updated_at?: string
          warning_8h5_at?: string | null
          worker_member_id?: string | null
          worker_name: string
          worker_user_id: string
        }
        Update: {
          auto_clocked_out?: boolean
          auto_clocked_out_at?: string | null
          client_entry_id?: string | null
          clock_in_accuracy_meters?: number | null
          clock_in_at?: string
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out_accuracy_meters?: number | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          company_name?: string
          created_at?: string
          created_by?: string
          created_from_device_id?: string | null
          id?: string
          notes?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string | null
          purchase_order_number?: string
          purchase_order_title?: string
          source?: string
          synced_at?: string | null
          total_hours?: number | null
          trade_name?: string
          updated_at?: string
          warning_8h5_at?: string | null
          worker_member_id?: string | null
          worker_name?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_time_sheet_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_sheet_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_sheet_entries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_sheet_entries_worker_member_id_fkey"
            columns: ["worker_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      project_time_sheet_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entry_id: string | null
          event_type: string
          id: string
          message: string
          organization_id: string
          project_id: string
          worker_name: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entry_id?: string | null
          event_type: string
          id?: string
          message: string
          organization_id: string
          project_id: string
          worker_name?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entry_id?: string | null
          event_type?: string
          id?: string
          message?: string
          organization_id?: string
          project_id?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_time_sheet_events_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "project_time_sheet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_sheet_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_sheet_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_trade_pack_page_index: {
        Row: {
          classifier: string
          confidence: number
          created_at: string
          created_by: string
          generated_drawing_set_id: string | null
          id: string
          include_in_pack: boolean
          is_support_sheet: boolean
          metadata: Json
          organization_id: string
          page_number: number
          prefilter_pass: boolean
          project_id: string
          reason: string
          run_id: string
          source_document_name: string
          source_drawing_set_id: string | null
          trade_id: string
          trade_label: string
          updated_at: string
        }
        Insert: {
          classifier: string
          confidence?: number
          created_at?: string
          created_by: string
          generated_drawing_set_id?: string | null
          id?: string
          include_in_pack?: boolean
          is_support_sheet?: boolean
          metadata?: Json
          organization_id: string
          page_number: number
          prefilter_pass?: boolean
          project_id: string
          reason?: string
          run_id: string
          source_document_name: string
          source_drawing_set_id?: string | null
          trade_id: string
          trade_label: string
          updated_at?: string
        }
        Update: {
          classifier?: string
          confidence?: number
          created_at?: string
          created_by?: string
          generated_drawing_set_id?: string | null
          id?: string
          include_in_pack?: boolean
          is_support_sheet?: boolean
          metadata?: Json
          organization_id?: string
          page_number?: number
          prefilter_pass?: boolean
          project_id?: string
          reason?: string
          run_id?: string
          source_document_name?: string
          source_drawing_set_id?: string | null
          trade_id?: string
          trade_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_trade_pack_page_index_generated_drawing_set_id_fkey"
            columns: ["generated_drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_trade_pack_page_index_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_trade_pack_page_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_trade_pack_page_index_source_drawing_set_id_fkey"
            columns: ["source_drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      project_trade_pack_reason_snapshots: {
        Row: {
          average_confidence: number
          created_at: string
          created_by: string
          generated_drawing_set_id: string
          id: string
          matched_pages: number
          organization_id: string
          project_id: string
          reasons: Json
          source_document_name: string
          support_pages: number
          total_pages: number
          trade_id: string
          trade_label: string
          updated_at: string
        }
        Insert: {
          average_confidence?: number
          created_at?: string
          created_by: string
          generated_drawing_set_id: string
          id?: string
          matched_pages?: number
          organization_id: string
          project_id: string
          reasons?: Json
          source_document_name: string
          support_pages?: number
          total_pages?: number
          trade_id: string
          trade_label: string
          updated_at?: string
        }
        Update: {
          average_confidence?: number
          created_at?: string
          created_by?: string
          generated_drawing_set_id?: string
          id?: string
          matched_pages?: number
          organization_id?: string
          project_id?: string
          reasons?: Json
          source_document_name?: string
          support_pages?: number
          total_pages?: number
          trade_id?: string
          trade_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_trade_pack_reason_snapsho_generated_drawing_set_id_fkey"
            columns: ["generated_drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_trade_pack_reason_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_trade_pack_reason_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_variation_attachments: {
        Row: {
          created_at: string
          external_url: string | null
          file_kind: string
          file_name: string
          id: string
          notes: string
          organization_id: string
          project_id: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          variation_id: string
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_kind?: string
          file_name: string
          id?: string
          notes?: string
          organization_id: string
          project_id: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          variation_id: string
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_kind?: string
          file_name?: string
          id?: string
          notes?: string
          organization_id?: string
          project_id?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_variation_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_attachments_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_variation_invoice_items: {
        Row: {
          amount: number
          created_at: string
          exported_at: string | null
          id: string
          invoice_reference: string
          organization_id: string
          project_id: string
          ready_at: string
          status: string
          updated_at: string
          variation_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_reference?: string
          organization_id: string
          project_id: string
          ready_at?: string
          status?: string
          updated_at?: string
          variation_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_reference?: string
          organization_id?: string
          project_id?: string
          ready_at?: string
          status?: string
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_variation_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_invoice_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_invoice_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: true
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_variation_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          organization_id: string
          project_id: string
          quantity: number
          rate: number
          section: string
          sort_order: number
          source_project_quote_id: string | null
          source_project_quote_line_item_id: string | null
          source_project_quote_number: string | null
          source_purchase_order_id: string | null
          source_purchase_order_line_item_id: string | null
          source_purchase_order_number: string | null
          total: number
          unit: string
          updated_at: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          organization_id: string
          project_id: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_project_quote_id?: string | null
          source_project_quote_line_item_id?: string | null
          source_project_quote_number?: string | null
          source_purchase_order_id?: string | null
          source_purchase_order_line_item_id?: string | null
          source_purchase_order_number?: string | null
          total?: number
          unit?: string
          updated_at?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          project_id?: string
          quantity?: number
          rate?: number
          section?: string
          sort_order?: number
          source_project_quote_id?: string | null
          source_project_quote_line_item_id?: string | null
          source_project_quote_number?: string | null
          source_purchase_order_id?: string | null
          source_purchase_order_line_item_id?: string | null
          source_purchase_order_number?: string | null
          total?: number
          unit?: string
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_variation_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_source_project_quote_id_fkey"
            columns: ["source_project_quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_source_project_quote_line_ite_fkey"
            columns: ["source_project_quote_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_quote_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_source_purchase_order_id_fkey"
            columns: ["source_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_source_purchase_order_line_it_fkey"
            columns: ["source_purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_line_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_variation_status_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_by: string | null
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          note: string
          occurred_at: string
          organization_id: string
          project_id: string
          to_status: string | null
          variation_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_by?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          note?: string
          occurred_at?: string
          organization_id: string
          project_id: string
          to_status?: string | null
          variation_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_by?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          note?: string
          occurred_at?: string
          organization_id?: string
          project_id?: string
          to_status?: string | null
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_variation_status_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_status_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variation_status_events_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_variations: {
        Row: {
          approved_at: string | null
          assumptions: string
          clarifications: string
          client_viewed_at: string | null
          contingency_amount: number
          created_at: string
          created_by: string
          discount_amount: number
          due_date: string | null
          gst_percent: number
          gst_total: number
          id: string
          include_contingency_in_export: boolean
          include_discount_in_export: boolean
          include_margin_in_export: boolean
          invoice_ready: boolean
          invoice_reference: string
          labour_total: number
          lead_time: string
          margin_percent: number
          margin_total: number
          materials_total: number
          notes: string
          organization_id: string
          origin: string
          payment_terms: string
          plant_total: number
          project_id: string
          rejected_at: string | null
          requested_by: string
          requested_date: string | null
          sent_to_client_at: string | null
          source_reference: string
          status: string
          subcontractors_total: number
          subtotal: number
          terms_exclusions: string
          terms_inclusions: string
          total_variation_price: number
          updated_at: string
          validity_period: string
          variation_number: string
          variation_title: string
        }
        Insert: {
          approved_at?: string | null
          assumptions?: string
          clarifications?: string
          client_viewed_at?: string | null
          contingency_amount?: number
          created_at?: string
          created_by: string
          discount_amount?: number
          due_date?: string | null
          gst_percent?: number
          gst_total?: number
          id?: string
          include_contingency_in_export?: boolean
          include_discount_in_export?: boolean
          include_margin_in_export?: boolean
          invoice_ready?: boolean
          invoice_reference?: string
          labour_total?: number
          lead_time?: string
          margin_percent?: number
          margin_total?: number
          materials_total?: number
          notes?: string
          organization_id: string
          origin?: string
          payment_terms?: string
          plant_total?: number
          project_id: string
          rejected_at?: string | null
          requested_by?: string
          requested_date?: string | null
          sent_to_client_at?: string | null
          source_reference?: string
          status?: string
          subcontractors_total?: number
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_variation_price?: number
          updated_at?: string
          validity_period?: string
          variation_number: string
          variation_title: string
        }
        Update: {
          approved_at?: string | null
          assumptions?: string
          clarifications?: string
          client_viewed_at?: string | null
          contingency_amount?: number
          created_at?: string
          created_by?: string
          discount_amount?: number
          due_date?: string | null
          gst_percent?: number
          gst_total?: number
          id?: string
          include_contingency_in_export?: boolean
          include_discount_in_export?: boolean
          include_margin_in_export?: boolean
          invoice_ready?: boolean
          invoice_reference?: string
          labour_total?: number
          lead_time?: string
          margin_percent?: number
          margin_total?: number
          materials_total?: number
          notes?: string
          organization_id?: string
          origin?: string
          payment_terms?: string
          plant_total?: number
          project_id?: string
          rejected_at?: string | null
          requested_by?: string
          requested_date?: string | null
          sent_to_client_at?: string | null
          source_reference?: string
          status?: string
          subcontractors_total?: number
          subtotal?: number
          terms_exclusions?: string
          terms_inclusions?: string
          total_variation_price?: number
          updated_at?: string
          validity_period?: string
          variation_number?: string
          variation_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_variations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_variations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      request_concurrency_limits: {
        Row: {
          active_count: number
          route_key: string
          subject_key: string
          updated_at: string
        }
        Insert: {
          active_count?: number
          route_key: string
          subject_key: string
          updated_at?: string
        }
        Update: {
          active_count?: number
          route_key?: string
          subject_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      request_rate_limits: {
        Row: {
          hit_count: number
          route_key: string
          subject_key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          hit_count?: number
          route_key: string
          subject_key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          hit_count?: number
          route_key?: string
          subject_key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          is_allowed: boolean
          permission_key: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_allowed?: boolean
          permission_key: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_allowed?: boolean
          permission_key?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      scope_runs: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          organization_id: string
          project_id: string
          result_json: Json
          status: string
          trade_pack_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          organization_id: string
          project_id: string
          result_json?: Json
          status?: string
          trade_pack_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          result_json?: Json
          status?: string
          trade_pack_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_runs_trade_pack_id_fkey"
            columns: ["trade_pack_id"]
            isOneToOne: false
            referencedRelation: "trade_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      spec_finishes_runs: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          extracted_page_count: number
          id: string
          organization_id: string
          project_id: string
          result_json: Json
          source_document_name: string
          status: string
          trade_id: string
          trade_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          extracted_page_count?: number
          id?: string
          organization_id: string
          project_id: string
          result_json?: Json
          source_document_name?: string
          status?: string
          trade_id?: string
          trade_label?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          extracted_page_count?: number
          id?: string
          organization_id?: string
          project_id?: string
          result_json?: Json
          source_document_name?: string
          status?: string
          trade_id?: string
          trade_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spec_finishes_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_finishes_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_activity_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          message: string
          metadata: Json
          organization_id: string
          supplier_invoice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          message: string
          metadata?: Json
          organization_id: string
          supplier_invoice_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          message?: string
          metadata?: Json
          organization_id?: string
          supplier_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_activity_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_activity_events_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_approval_steps: {
        Row: {
          approver_role: string | null
          approver_user_id: string | null
          checks_json: Json
          created_at: string
          decided_at: string | null
          decision_notes: string
          id: string
          organization_id: string
          status: string
          supplier_invoice_id: string
          updated_at: string
        }
        Insert: {
          approver_role?: string | null
          approver_user_id?: string | null
          checks_json?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string
          id?: string
          organization_id: string
          status?: string
          supplier_invoice_id: string
          updated_at?: string
        }
        Update: {
          approver_role?: string | null
          approver_user_id?: string | null
          checks_json?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string
          id?: string
          organization_id?: string
          status?: string
          supplier_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_approval_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_approval_steps_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          supplier_invoice_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          supplier_invoice_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          supplier_invoice_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_documents_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_lines: {
        Row: {
          cost_code_id: string | null
          created_at: string
          description: string
          id: string
          line_total: number
          organization_id: string
          project_id: string | null
          quantity: number
          sort_order: number
          supplier_invoice_id: string
          tax_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          line_total?: number
          organization_id: string
          project_id?: string | null
          quantity?: number
          sort_order?: number
          supplier_invoice_id: string
          tax_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          line_total?: number
          organization_id?: string
          project_id?: string | null
          quantity?: number
          sort_order?: number
          supplier_invoice_id?: string
          tax_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_lines_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_match_approval_steps: {
        Row: {
          approver_role: string | null
          approver_user_id: string | null
          checks_json: Json
          created_at: string
          decided_at: string | null
          decision_notes: string
          id: string
          organization_id: string
          purchase_order_id: string
          status: string
          supplier_invoice_id: string
          supplier_invoice_purchase_order_match_id: string
          updated_at: string
        }
        Insert: {
          approver_role?: string | null
          approver_user_id?: string | null
          checks_json?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string
          id?: string
          organization_id: string
          purchase_order_id: string
          status: string
          supplier_invoice_id: string
          supplier_invoice_purchase_order_match_id: string
          updated_at?: string
        }
        Update: {
          approver_role?: string | null
          approver_user_id?: string | null
          checks_json?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string
          id?: string
          organization_id?: string
          purchase_order_id?: string
          status?: string
          supplier_invoice_id?: string
          supplier_invoice_purchase_order_match_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_match_approv_supplier_invoice_purchase_or_fkey"
            columns: ["supplier_invoice_purchase_order_match_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_purchase_order_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_match_approval_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_match_approval_steps_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_match_approval_steps_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_purchase_order_matches: {
        Row: {
          approval_checks_json: Json
          approval_notes: string
          approval_status: string
          approved_at: string | null
          approved_by_user_id: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          id: string
          match_basis: string
          match_status: string
          matched_amount: number
          organization_id: string
          purchase_order_id: string
          supplier_invoice_id: string
          updated_at: string
        }
        Insert: {
          approval_checks_json?: Json
          approval_notes?: string
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          match_basis?: string
          match_status?: string
          matched_amount?: number
          organization_id: string
          purchase_order_id: string
          supplier_invoice_id: string
          updated_at?: string
        }
        Update: {
          approval_checks_json?: Json
          approval_notes?: string
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          match_basis?: string
          match_status?: string
          matched_amount?: number
          organization_id?: string
          purchase_order_id?: string
          supplier_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_purchase_order_matche_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_purchase_order_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_purchase_order_matches_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          document_file_name: string | null
          document_file_path: string | null
          document_mime_type: string | null
          document_size_bytes: number | null
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string
          notes: string
          organization_id: string
          source: string
          status: string
          subtotal: number
          supplier_id: string | null
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          document_file_name?: string | null
          document_file_path?: string | null
          document_mime_type?: string | null
          document_size_bytes?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string
          organization_id: string
          source?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          document_file_name?: string | null
          document_file_path?: string | null
          document_mime_type?: string | null
          document_size_bytes?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string
          organization_id?: string
          source?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_calibrations: {
        Row: {
          base_unit: string
          created_at: string
          created_by: string
          display_unit: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          notes: string
          opportunity_id: string | null
          organization_id: string
          page_id: string
          point_a_x: number
          point_a_y: number
          point_b_x: number
          point_b_y: number
          project_id: string
          reference_length_base: number
          reference_length_input: number
          scale_ratio: number
          superseded_by: string | null
          unit_system: string
          updated_at: string
        }
        Insert: {
          base_unit: string
          created_at?: string
          created_by: string
          display_unit: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          notes?: string
          opportunity_id?: string | null
          organization_id: string
          page_id: string
          point_a_x: number
          point_a_y: number
          point_b_x: number
          point_b_y: number
          project_id: string
          reference_length_base: number
          reference_length_input: number
          scale_ratio: number
          superseded_by?: string | null
          unit_system?: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          created_at?: string
          created_by?: string
          display_unit?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          notes?: string
          opportunity_id?: string | null
          organization_id?: string
          page_id?: string
          point_a_x?: number
          point_a_y?: number
          point_b_x?: number
          point_b_y?: number
          project_id?: string
          reference_length_base?: number
          reference_length_input?: number
          scale_ratio?: number
          superseded_by?: string | null
          unit_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_calibrations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_calibrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_calibrations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "takeoff_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_calibrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_calibrations_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "takeoff_calibrations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_area_shape_points: {
        Row: {
          area_shape_id: string
          created_at: string
          id: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Insert: {
          area_shape_id: string
          created_at?: string
          id?: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Update: {
          area_shape_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          point_order?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_area_shape_points_area_shape_id_fkey"
            columns: ["area_shape_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurement_area_shapes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_area_shape_points_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_area_shapes: {
        Row: {
          created_at: string
          id: string
          measured_area_base: number
          measured_perimeter_base: number
          measurement_id: string
          organization_id: string
          page_bbox_max_x: number | null
          page_bbox_max_y: number | null
          page_bbox_min_x: number | null
          page_bbox_min_y: number | null
          shape_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          measured_area_base: number
          measured_perimeter_base?: number
          measurement_id: string
          organization_id: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          shape_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          measured_area_base?: number
          measured_perimeter_base?: number
          measurement_id?: string
          organization_id?: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          shape_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_area_shapes_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_area_shapes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_events: {
        Row: {
          actor_user_id: string | null
          change_reason: string | null
          created_at: string
          diff: Json
          event_type: Database["public"]["Enums"]["takeoff_event_type"]
          id: string
          measurement_id: string
          metadata: Json
          opportunity_id: string | null
          organization_id: string
          project_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          actor_user_id?: string | null
          change_reason?: string | null
          created_at?: string
          diff?: Json
          event_type: Database["public"]["Enums"]["takeoff_event_type"]
          id?: string
          measurement_id: string
          metadata?: Json
          opportunity_id?: string | null
          organization_id: string
          project_id: string
          snapshot: Json
          version: number
        }
        Update: {
          actor_user_id?: string | null
          change_reason?: string | null
          created_at?: string
          diff?: Json
          event_type?: Database["public"]["Enums"]["takeoff_event_type"]
          id?: string
          measurement_id?: string
          metadata?: Json
          opportunity_id?: string | null
          organization_id?: string
          project_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_events_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_groups: {
        Row: {
          code: string | null
          color_hex: string | null
          created_at: string
          created_by: string
          id: string
          metadata: Json
          name: string
          opportunity_id: string | null
          organization_id: string
          parent_group_id: string | null
          project_id: string
          sort_order: number
          status: Database["public"]["Enums"]["takeoff_group_status"]
          trade_id: string | null
          trade_label: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          color_hex?: string | null
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json
          name: string
          opportunity_id?: string | null
          organization_id: string
          parent_group_id?: string | null
          project_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["takeoff_group_status"]
          trade_id?: string | null
          trade_label?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          color_hex?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          name?: string
          opportunity_id?: string | null
          organization_id?: string
          parent_group_id?: string | null
          project_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["takeoff_group_status"]
          trade_id?: string | null
          trade_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_groups_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_line_path_points: {
        Row: {
          created_at: string
          id: string
          line_path_id: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_path_id: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Update: {
          created_at?: string
          id?: string
          line_path_id?: string
          organization_id?: string
          point_order?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_line_path_points_line_path_id_fkey"
            columns: ["line_path_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurement_line_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_line_path_points_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_line_paths: {
        Row: {
          created_at: string
          id: string
          measured_length_base: number
          measurement_id: string
          organization_id: string
          page_bbox_max_x: number | null
          page_bbox_max_y: number | null
          page_bbox_min_x: number | null
          page_bbox_min_y: number | null
          path_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          measured_length_base: number
          measurement_id: string
          organization_id: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          path_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          measured_length_base?: number
          measurement_id?: string
          organization_id?: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          path_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_line_paths_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_line_paths_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurement_points: {
        Row: {
          created_at: string
          id: string
          measurement_id: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_id: string
          organization_id: string
          point_order: number
          x: number
          y: number
        }
        Update: {
          created_at?: string
          id?: string
          measurement_id?: string
          organization_id?: string
          point_order?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurement_points_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurement_points_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_measurements: {
        Row: {
          ai_confidence: number | null
          ai_model: string | null
          ai_run_id: string | null
          archived_at: string | null
          archived_by: string | null
          calibration_id: string | null
          color_hex: string | null
          count_value: number | null
          created_at: string
          created_by: string
          description: string
          display_unit: string | null
          display_value: number | null
          drawing_set_id: string
          external_ref: string | null
          group_id: string | null
          id: string
          measured_area_base: number | null
          measured_length_base: number | null
          measured_perimeter_base: number | null
          measurement_kind: Database["public"]["Enums"]["takeoff_measurement_kind"]
          metadata: Json
          name: string
          opportunity_id: string | null
          organization_id: string
          page_bbox_max_x: number | null
          page_bbox_max_y: number | null
          page_bbox_min_x: number | null
          page_bbox_min_y: number | null
          page_id: string
          project_id: string
          quantity: number
          source: Database["public"]["Enums"]["takeoff_measurement_source"]
          status: Database["public"]["Enums"]["takeoff_measurement_status"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_run_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calibration_id?: string | null
          color_hex?: string | null
          count_value?: number | null
          created_at?: string
          created_by: string
          description?: string
          display_unit?: string | null
          display_value?: number | null
          drawing_set_id: string
          external_ref?: string | null
          group_id?: string | null
          id?: string
          measured_area_base?: number | null
          measured_length_base?: number | null
          measured_perimeter_base?: number | null
          measurement_kind: Database["public"]["Enums"]["takeoff_measurement_kind"]
          metadata?: Json
          name?: string
          opportunity_id?: string | null
          organization_id: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          page_id: string
          project_id: string
          quantity?: number
          source?: Database["public"]["Enums"]["takeoff_measurement_source"]
          status?: Database["public"]["Enums"]["takeoff_measurement_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_run_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calibration_id?: string | null
          color_hex?: string | null
          count_value?: number | null
          created_at?: string
          created_by?: string
          description?: string
          display_unit?: string | null
          display_value?: number | null
          drawing_set_id?: string
          external_ref?: string | null
          group_id?: string | null
          id?: string
          measured_area_base?: number | null
          measured_length_base?: number | null
          measured_perimeter_base?: number | null
          measurement_kind?: Database["public"]["Enums"]["takeoff_measurement_kind"]
          metadata?: Json
          name?: string
          opportunity_id?: string | null
          organization_id?: string
          page_bbox_max_x?: number | null
          page_bbox_max_y?: number | null
          page_bbox_min_x?: number | null
          page_bbox_min_y?: number | null
          page_id?: string
          project_id?: string
          quantity?: number
          source?: Database["public"]["Enums"]["takeoff_measurement_source"]
          status?: Database["public"]["Enums"]["takeoff_measurement_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_measurements_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "takeoff_calibrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "takeoff_measurement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "takeoff_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_pages: {
        Row: {
          created_at: string
          created_by: string
          drawing_set_id: string
          id: string
          metadata: Json
          opportunity_id: string | null
          organization_id: string
          page_height_pts: number
          page_label: string | null
          page_number: number
          page_width_pts: number
          preview_bytes: number | null
          preview_error: string | null
          preview_generated_at: string | null
          preview_height_px: number | null
          preview_mime_type: string | null
          preview_render_version: string | null
          preview_status: Database["public"]["Enums"]["takeoff_preview_status"]
          preview_storage_path: string | null
          preview_width_px: number | null
          project_id: string
          rotation_degrees: number
          source_revision: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          drawing_set_id: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          organization_id: string
          page_height_pts: number
          page_label?: string | null
          page_number: number
          page_width_pts: number
          preview_bytes?: number | null
          preview_error?: string | null
          preview_generated_at?: string | null
          preview_height_px?: number | null
          preview_mime_type?: string | null
          preview_render_version?: string | null
          preview_status?: Database["public"]["Enums"]["takeoff_preview_status"]
          preview_storage_path?: string | null
          preview_width_px?: number | null
          project_id: string
          rotation_degrees?: number
          source_revision?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          drawing_set_id?: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          organization_id?: string
          page_height_pts?: number
          page_label?: string | null
          page_number?: number
          page_width_pts?: number
          preview_bytes?: number | null
          preview_error?: string | null
          preview_generated_at?: string | null
          preview_height_px?: number | null
          preview_mime_type?: string | null
          preview_render_version?: string | null
          preview_status?: Database["public"]["Enums"]["takeoff_preview_status"]
          preview_storage_path?: string | null
          preview_width_px?: number | null
          project_id?: string
          rotation_degrees?: number
          source_revision?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_pages_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_pages_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_render_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          drawing_set_id: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          opportunity_id: string | null
          organization_id: string
          payload: Json
          project_id: string
          render_version: string
          requested_by: string | null
          source_revision: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["takeoff_render_job_status"]
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          drawing_set_id: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          opportunity_id?: string | null
          organization_id: string
          payload?: Json
          project_id: string
          render_version: string
          requested_by?: string | null
          source_revision?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["takeoff_render_job_status"]
        }
        Update: {
          attempt_count?: number
          created_at?: string
          drawing_set_id?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          opportunity_id?: string | null
          organization_id?: string
          payload?: Json
          project_id?: string
          render_version?: string
          requested_by?: string | null
          source_revision?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["takeoff_render_job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_render_jobs_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_render_jobs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_render_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          field_name: string | null
          id: string
          metadata: Json
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          project_id: string | null
          task_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          project_id?: string | null
          task_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          project_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_job_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          attachment_type: string
          comment_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          original_file_name: string | null
          project_id: string | null
          storage_bucket: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          attachment_type?: string
          comment_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json
          mime_type: string
          organization_id: string
          original_file_name?: string | null
          project_id?: string | null
          storage_bucket?: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          attachment_type?: string
          comment_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          metadata?: Json
          mime_type?: string
          organization_id?: string
          original_file_name?: string | null
          project_id?: string | null
          storage_bucket?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_job_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          comment: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          metadata: Json
          organization_id: string
          project_id: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          project_id?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          project_id?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_job_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      task_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          linked_id: string
          linked_type: string
          metadata: Json
          organization_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id: string
          linked_type: string
          metadata?: Json
          organization_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id?: string
          linked_type?: string
          metadata?: Json
          organization_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_job_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_pack_workspaces: {
        Row: {
          cover_image_url: string | null
          created_at: string
          created_by: string
          id: string
          legacy_project_id: string
          location: string
          name: string
          organization_id: string
          slug: string
          stage: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          legacy_project_id: string
          location?: string
          name: string
          organization_id: string
          slug: string
          stage?: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          legacy_project_id?: string
          location?: string
          name?: string
          organization_id?: string
          slug?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_pack_workspaces_legacy_project_id_fkey"
            columns: ["legacy_project_id"]
            isOneToOne: true
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_pack_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_packs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          organization_id: string
          page_index_json: Json
          pdf_url: string
          project_id: string
          trade_id: string
          trade_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          organization_id: string
          page_index_json?: Json
          pdf_url: string
          project_id: string
          trade_id: string
          trade_label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          page_index_json?: Json
          pdf_url?: string
          project_id?: string
          trade_id?: string
          trade_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_packs_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "project_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_project_assignments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          project_id: string
          updated_at: string
          worker_member_id: string | null
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          project_id: string
          updated_at?: string
          worker_member_id?: string | null
          worker_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          project_id?: string
          updated_at?: string
          worker_member_id?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_project_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_project_assignments_worker_member_id_fkey"
            columns: ["worker_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_purchase_order_assignments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          project_id: string
          purchase_order_id: string
          updated_at: string
          worker_member_id: string | null
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          project_id: string
          purchase_order_id: string
          updated_at?: string
          worker_member_id?: string | null
          worker_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          updated_at?: string
          worker_member_id?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_purchase_order_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_purchase_order_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_purchase_order_assignments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_purchase_order_assignments_worker_member_id_fkey"
            columns: ["worker_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _task_assert_project_access: {
        Args: { p_organization_id?: string; p_project_id: string }
        Returns: {
          client_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          id: string
          location: string
          name: string
          organization_id: string
          project_code: string
          slug: string
          source_opportunity_id: string | null
          stage: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _task_assert_task_access: {
        Args: { p_task_id: string }
        Returns: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          due_at: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          linked_client_id: string | null
          linked_inspection_id: string | null
          linked_inspection_item_id: string | null
          linked_issue_id: string | null
          linked_purchase_order_id: string | null
          linked_quote_id: string | null
          linked_variation_id: string | null
          metadata: Json
          opportunity_id: string | null
          organization_id: string
          priority: string
          project_id: string
          source_id: string | null
          source_type: string | null
          status: string
          task_type: string | null
          title: string
          trade: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_job_todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _task_attachment_to_json: {
        Args: {
          p_attachment: Database["public"]["Tables"]["task_attachments"]["Row"]
        }
        Returns: Json
      }
      _task_current_organization_id: { Args: never; Returns: string }
      _task_normalize_priority: {
        Args: { p_priority: string }
        Returns: string
      }
      _task_normalize_status: { Args: { p_status: string }; Returns: string }
      _task_to_json: {
        Args: {
          p_task: Database["public"]["Tables"]["project_job_todos"]["Row"]
        }
        Returns: Json
      }
      _task_validate_assignee: {
        Args: { p_assigned_user_id: string; p_organization_id: string }
        Returns: undefined
      }
      _write_task_activity: {
        Args: {
          p_actor_user_id: string
          p_event_type: string
          p_field_name?: string
          p_metadata?: Json
          p_new_value?: Json
          p_old_value?: Json
          p_organization_id: string
          p_project_id: string
          p_task_id: string
        }
        Returns: string
      }
      accept_organization_invite: {
        Args: { invite_token: string }
        Returns: string
      }
      acquire_shared_concurrency_slot: {
        Args: { p_limit: number; p_route_key: string; p_subject_key: string }
        Returns: boolean
      }
      add_project_member: {
        Args: {
          p_organization_id: string
          p_organization_member_id: string
          p_project_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          removed_at: string
          removed_by: string
          updated_at: string
        }[]
      }
      add_purchase_order_assignment: {
        Args: {
          p_organization_id: string
          p_organization_member_id: string
          p_project_id: string
          p_purchase_order_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          purchase_order_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_purchase_order_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_task_link: {
        Args: {
          p_linked_id: string
          p_linked_type: string
          p_metadata?: Json
          p_task_id: string
        }
        Returns: Json
      }
      archive_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: Json
      }
      assign_task: {
        Args: { p_assigned_user_id: string; p_task_id: string }
        Returns: Json
      }
      begin_cost_item_revision: {
        Args: { p_document_id: string; p_document_kind: string }
        Returns: string
      }
      calculate_project_quote_pre_gst_total: {
        Args: {
          p_contingency_amount: number
          p_discount_amount: number
          p_margin_percent: number
          p_subtotal: number
        }
        Returns: number
      }
      calculate_project_variation_pre_gst_total: {
        Args: {
          p_contingency_amount: number
          p_discount_amount: number
          p_margin_percent: number
          p_subtotal: number
        }
        Returns: number
      }
      can_access_organization_logo_storage_object: {
        Args: { object_path: string }
        Returns: boolean
      }
      can_access_project_drawing_storage_object: {
        Args: { object_path: string }
        Returns: boolean
      }
      can_access_project_quality_photo_storage_object: {
        Args: { object_path: string }
        Returns: boolean
      }
      can_access_project_variation_attachment_storage_object: {
        Args: { object_path: string }
        Returns: boolean
      }
      can_access_supplier_invoice_document_storage_object: {
        Args: { object_path: string; p_permission_key: string }
        Returns: boolean
      }
      can_access_task_attachment_storage_object: {
        Args: { object_path: string }
        Returns: boolean
      }
      can_create_trade_pack_workspace: {
        Args: { p_organization_id: string; p_reference_at?: string }
        Returns: boolean
      }
      can_run_change_detection_once: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: boolean
      }
      can_run_scope_builder_once: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: boolean
      }
      can_run_spec_finishes_once:
        | {
            Args: { p_organization_id: string; p_project_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_organization_id: string
              p_project_id: string
              p_trade_id: string
            }
            Returns: boolean
          }
      can_run_trade_pack_builder_once: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: boolean
      }
      clone_workspace_metadata_to_project: {
        Args: {
          p_drawing_sets: Json
          p_organization_id: string
          p_scope_runs: Json
          p_target_project_id: string
          p_trade_packs: Json
        }
        Returns: undefined
      }
      commit_ai_chat_quota_reservation: {
        Args: {
          p_response_chars: number
          p_tokens_used: number
          p_usage_id: string
        }
        Returns: boolean
      }
      complete_task: { Args: { p_task_id: string }; Returns: Json }
      compute_cost_item_source_fingerprint: {
        Args: {
          p_description: string
          p_identity_a?: string
          p_identity_b?: string
          p_is_optional: boolean
          p_line_total: number
          p_quantity: number
          p_section: string
          p_sort_order: number
          p_source_document_kind: string
          p_source_line_table: string
          p_unit: string
          p_unit_rate: number
        }
        Returns: string
      }
      convert_opportunity_quote_to_project_quote: {
        Args: {
          p_fallback_created_by: string
          p_opportunity_id: string
          p_opportunity_quote_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: {
          project_quote_id: string
          project_quote_number: string
          quote_date: string
          source_opportunity_quote_id: string
        }[]
      }
      count_trade_pack_workspaces_created_in_month: {
        Args: { p_organization_id: string; p_reference_at?: string }
        Returns: number
      }
      create_project_claim_draft: {
        Args: {
          p_organization_id: string
          p_project_id: string
          p_title?: string
        }
        Returns: {
          claim_date: string
          claim_number: string
          claim_title: string
          claim_type: string
          due_date: string
          gst_amount: number
          id: string
          net_claim_excl_gst: number
          notes: string
          paid_amount: number
          percent_complete: number
          period_end: string
          period_start: string
          retention_balance: number
          retention_held_to_date: number
          retention_method: string
          retention_percent: number
          retention_released_amount: number
          retention_released_to_date: number
          retention_scale_bands: Json
          retention_withheld_amount: number
          status: string
          total_payable: number
          updated_at: string
        }[]
      }
      create_project_purchase_order_draft: {
        Args: {
          p_organization_id: string
          p_origin?: string
          p_project_id: string
          p_title?: string
        }
        Returns: {
          id: string
          origin: string
          purchase_order_number: string
          purchase_order_title: string
          status: string
          updated_at: string
        }[]
      }
      create_project_variation_draft: {
        Args: {
          p_organization_id: string
          p_project_id: string
          p_title?: string
        }
        Returns: {
          id: string
          origin: string
          status: string
          updated_at: string
          variation_number: string
          variation_title: string
        }[]
      }
      create_task: { Args: { p_input: Json }; Returns: Json }
      create_task_attachment: {
        Args: { p_input: Json; p_task_id: string }
        Returns: Json
      }
      create_task_comment: {
        Args: { p_comment: string; p_metadata?: Json; p_task_id: string }
        Returns: Json
      }
      default_trade_pack_monthly_limit: {
        Args: { plan_tier: string }
        Returns: number
      }
      delete_project_claim_safe: {
        Args: {
          p_claim_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: undefined
      }
      delete_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      delete_task_comment: { Args: { p_comment_id: string }; Returns: Json }
      enforce_shared_rate_limit: {
        Args: {
          p_limit: number
          p_route_key: string
          p_subject_key: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      ensure_organization_membership: { Args: never; Returns: string }
      generate_opportunity_code: {
        Args: { p_created_at?: string; p_organization_id: string }
        Returns: string
      }
      generate_opportunity_quote_number: {
        Args: { p_opportunity_id: string; p_organization_id: string }
        Returns: string
      }
      generate_project_claim_number: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: string
      }
      generate_project_code: {
        Args: { p_created_at?: string; p_organization_id: string }
        Returns: string
      }
      generate_project_purchase_order_number: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: string
      }
      generate_project_quote_number: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: string
      }
      generate_project_variation_number: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: string
      }
      get_organization_member_emails: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_project_claim_approved_variations_total: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: number
      }
      get_project_claim_base_quote_total: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: number
      }
      get_project_claim_source_line_items: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: {
          description: string
          quantity: number
          rate: number
          section: string
          sort_order: number
          source_document_id: string
          source_kind: string
          source_line_item_id: string
          source_number: string
          source_title: string
          source_total: number
          unit: string
        }[]
      }
      get_project_dashboard_aggregate: {
        Args: {
          p_end_of_day: string
          p_month_end: string
          p_month_start: string
          p_now: string
          p_organization_id: string
          p_project_slug: string
          p_start_of_day: string
          p_today: string
        }
        Returns: Json
      }
      get_project_purchase_order_summary: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: {
          approved_count: number
          awaiting_client_count: number
          draft_count: number
          invoice_ready_count: number
          total_value: number
        }[]
      }
      get_mobile_worker_project_purchase_order_detail: {
        Args: { p_project_id: string; p_purchase_order_id: string }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string | null
          gst_total: number
          issued_to_label: string
          line_items: Json
          notes: string
          origin: string
          project_id: string
          purchase_order_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by: string
          requested_date: string | null
          status: string
          subtotal: number
          total_purchase_order_price: number
          updated_at: string
        }[]
      }
      get_mobile_worker_purchase_order_attachment_url: {
        Args: { p_attachment_id: string; p_project_id: string }
        Returns: {
          attachment_id: string
          expires_at: string | null
          file_kind: string
          file_name: string
          purchase_order_id: string
          source: string
          url: string
        }[]
      }
      get_task: { Args: { p_task_id: string }; Returns: Json }
      get_trade_pack_monthly_limit_for_organization: {
        Args: { p_organization_id: string }
        Returns: number
      }
      get_trade_pack_workspace_quota: {
        Args: { p_organization_id: string; p_reference_at?: string }
        Returns: {
          created_count: number
          month_end: string
          month_start: string
          monthly_limit: number
          plan_tier: string
          remaining: number
        }[]
      }
      has_org_permission: {
        Args: { p_organization_id: string; p_permission_key: string }
        Returns: boolean
      }
      has_permission: { Args: { p_permission_key: string }; Returns: boolean }
      is_admin_of_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_generated_trade_pack_file: {
        Args: { p_file_name: string; p_storage_path: string }
        Returns: boolean
      }
      is_member_of_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_owner_of_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      list_project_members: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: {
          avatar_path: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          role: string
          updated_at: string
          user_id: string
        }[]
      }
      list_purchase_order_assignments: {
        Args: {
          p_organization_id: string
          p_project_id: string
          p_purchase_order_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          purchase_order_id: string
          updated_at: string
        }[]
      }
      list_task_activity: { Args: { p_task_id: string }; Returns: Json }
      list_task_attachments: {
        Args: { p_include_deleted?: boolean; p_task_id: string }
        Returns: Json
      }
      list_task_comments: {
        Args: { p_include_deleted?: boolean; p_task_id: string }
        Returns: Json
      }
      list_tasks: {
        Args: {
          p_include_archived?: boolean
          p_include_deleted?: boolean
          p_opportunity_id?: string
          p_project_id?: string
          p_statuses?: string[]
        }
        Returns: Json
      }
      list_mobile_worker_project_purchase_orders: {
        Args: { p_project_id: string }
        Returns: {
          created_at: string
          due_date: string | null
          issued_to_label: string
          notes: string
          origin: string
          project_id: string
          purchase_order_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by: string
          requested_date: string | null
          status: string
          updated_at: string
        }[]
      }
      list_worker_assigned_purchase_orders: {
        Args: {
          p_organization_id: string
          p_organization_member_id: string
          p_project_id: string
        }
        Returns: {
          created_at: string
          id: string
          purchase_order_number: string
          status: string
          title: string
        }[]
      }
      next_project_document_number: {
        Args: {
          p_document_kind: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: number
      }
      process_project_time_sheet_rules: {
        Args: { p_max_rows?: number; p_now?: string; p_project_id?: string }
        Returns: {
          processed_auto_clock_outs: number
          processed_warnings: number
        }[]
      }
      recalculate_project_claim_snapshots: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: undefined
      }
      recalculate_project_purchase_order_totals: {
        Args: { p_purchase_order_id: string }
        Returns: undefined
      }
      record_supplier_invoice_activity_event: {
        Args: {
          p_created_by?: string
          p_event_type: string
          p_message: string
          p_metadata?: Json
          p_organization_id: string
          p_supplier_invoice_id: string
        }
        Returns: undefined
      }
      release_ai_chat_quota_reservation: {
        Args: { p_usage_id: string }
        Returns: boolean
      }
      release_shared_concurrency_slot: {
        Args: { p_route_key: string; p_subject_key: string }
        Returns: boolean
      }
      remove_project_member: {
        Args: {
          p_organization_id: string
          p_organization_member_id: string
          p_project_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          organization_id: string
          organization_member_id: string
          project_id: string
          removed_at: string
          removed_by: string
          updated_at: string
        }[]
      }
      remove_purchase_order_assignment: {
        Args: {
          p_organization_id: string
          p_organization_member_id: string
          p_project_id: string
          p_purchase_order_id: string
        }
        Returns: undefined
      }
      remove_task_link: { Args: { p_task_link_id: string }; Returns: Json }
      reopen_task: { Args: { p_task_id: string }; Returns: Json }
      reorder_client_notes: {
        Args: { p_client_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      repair_project_quote_opportunity_lineage: {
        Args: { p_project_quote_id: string }
        Returns: {
          mirrored_cost_item_count: number
          repaired_line_count: number
        }[]
      }
      reserve_ai_chat_usage_quota: {
        Args: {
          p_month_start: string
          p_monthly_limit: number
          p_organization_id: string
          p_plan_tier: string
          p_project_slug: string
          p_user_id: string
        }
        Returns: string
      }
      reset_supplier_invoice_match_approvals_for_purchase_order_chang: {
        Args: {
          p_changed_fields?: string[]
          p_organization_id: string
          p_purchase_order_id: string
        }
        Returns: undefined
      }
      resolve_cost_item_document_context: {
        Args: { p_document_id: string; p_document_kind: string }
        Returns: {
          organization_id: string
          project_id: string
        }[]
      }
      restore_task: { Args: { p_task_id: string }; Returns: Json }
      retire_purchase_order_line_cost_item: {
        Args: { p_cost_item_id: string }
        Returns: undefined
      }
      rollup_supplier_invoice_status_from_matches: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: undefined
      }
      save_opportunity_quote_draft: {
        Args: {
          p_acceptance_notes: string
          p_assumptions: string
          p_clarifications: string
          p_client_email: string
          p_client_name: string
          p_client_phone: string
          p_company_name: string
          p_contact_person: string
          p_contingency_amount: number
          p_discount_amount: number
          p_expected_updated_at: string
          p_expiry_date: string
          p_gst_percent: number
          p_lead_time: string
          p_line_items: Json
          p_margin_percent: number
          p_opportunity_id: string
          p_optional_items_notes: string
          p_organization_id: string
          p_payment_terms: string
          p_project_name: string
          p_quote_date: string
          p_quote_id: string
          p_quote_number: string
          p_quote_title: string
          p_scope_exclusions: string
          p_scope_notes: string
          p_site_address: string
          p_status: string
          p_terms_exclusions: string
          p_terms_inclusions: string
          p_validity_period: string
        }
        Returns: {
          gst_amount: number
          id: string
          optional_subtotal: number
          status: string
          subtotal: number
          total_quote_price: number
          updated_at: string
        }[]
      }
      save_project_claim_draft:
        | {
            Args: {
              p_claim_date: string
              p_claim_id: string
              p_claim_title: string
              p_claim_type: string
              p_due_date: string
              p_expected_updated_at: string
              p_line_items: Json
              p_notes: string
              p_organization_id: string
              p_paid_amount: number
              p_percent_complete: number
              p_period_end: string
              p_period_start: string
              p_project_id: string
              p_status: string
            }
            Returns: {
              claim_amount: number
              linked_approved_variations: number
              linked_quote_value: number
              paid_amount: number
              percent_complete: number
              previous_claims_total: number
              revised_contract_value: number
              status: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              p_claim_date: string
              p_claim_id: string
              p_claim_title: string
              p_claim_type: string
              p_due_date: string
              p_expected_updated_at: string
              p_line_items: Json
              p_notes: string
              p_organization_id: string
              p_paid_amount: number
              p_percent_complete: number
              p_period_end: string
              p_period_start: string
              p_project_id: string
              p_retention_method: string
              p_retention_percent: number
              p_retention_released_amount: number
              p_retention_scale_bands: Json
              p_status: string
            }
            Returns: {
              claim_amount: number
              gst_amount: number
              id: string
              linked_approved_variations: number
              linked_quote_value: number
              net_claim_excl_gst: number
              paid_amount: number
              percent_complete: number
              previous_claims_total: number
              retention_balance: number
              retention_held_to_date: number
              retention_percent: number
              retention_released_amount: number
              retention_released_to_date: number
              retention_withheld_amount: number
              revised_contract_value: number
              status: string
              total_payable: number
              updated_at: string
            }[]
          }
      save_project_purchase_order_draft: {
        Args: {
          p_approved_at: string
          p_attachments: Json
          p_contingency_amount: number
          p_discount_amount: number
          p_due_date: string
          p_expected_updated_at: string
          p_gst_percent: number
          p_include_contingency_in_export: boolean
          p_include_discount_in_export: boolean
          p_include_margin_in_export: boolean
          p_invoice_ready: boolean
          p_issued_to_label: string
          p_line_items: Json
          p_margin_percent: number
          p_notes: string
          p_organization_id: string
          p_origin: string
          p_project_id: string
          p_purchase_order_id: string
          p_purchase_order_number: string
          p_purchase_order_title: string
          p_requested_by: string
          p_requested_date: string
          p_sent_to_client_at: string
          p_status: string
          p_supplier_contact: string
          p_supplier_email_snapshot: string
          p_supplier_id: string
          p_supplier_name_snapshot: string
          p_supplier_phone_snapshot: string
        }
        Returns: {
          gst_total: number
          id: string
          status: string
          subtotal: number
          total_purchase_order_price: number
          updated_at: string
        }[]
      }
      save_project_quote_draft:
        | {
            Args: {
              p_acceptance_notes: string
              p_assumptions: string
              p_clarifications: string
              p_client_email: string
              p_client_name: string
              p_client_phone: string
              p_company_name: string
              p_contact_person: string
              p_contingency_amount: number
              p_discount_amount: number
              p_expected_updated_at: string
              p_expiry_date: string
              p_gst_percent: number
              p_lead_time: string
              p_line_items: Json
              p_margin_percent: number
              p_optional_items_notes: string
              p_organization_id: string
              p_payment_terms: string
              p_project_id: string
              p_project_name: string
              p_quote_date: string
              p_quote_id: string
              p_quote_number: string
              p_quote_title: string
              p_scope_exclusions: string
              p_scope_notes: string
              p_site_address: string
              p_status: string
              p_terms_exclusions: string
              p_terms_inclusions: string
              p_validity_period: string
            }
            Returns: {
              gst_amount: number
              id: string
              optional_subtotal: number
              status: string
              subtotal: number
              total_quote_price: number
              updated_at: string
            }[]
          }
        | {
            Args: {
              p_acceptance_notes: string
              p_assumptions: string
              p_clarifications: string
              p_client_email: string
              p_client_name: string
              p_client_phone: string
              p_company_name: string
              p_contact_person: string
              p_contingency_amount: number
              p_discount_amount: number
              p_expected_updated_at: string
              p_expiry_date: string
              p_gst_percent: number
              p_lead_time: string
              p_line_items: Json
              p_margin_percent: number
              p_optional_items_notes: string
              p_organization_id: string
              p_payment_terms: string
              p_project_id: string
              p_project_name: string
              p_quote_date: string
              p_quote_id: string
              p_quote_number: string
              p_quote_title: string
              p_retention_percent_default: number
              p_scope_exclusions: string
              p_scope_notes: string
              p_site_address: string
              p_status: string
              p_terms_exclusions: string
              p_terms_inclusions: string
              p_validity_period: string
            }
            Returns: {
              gst_amount: number
              id: string
              optional_subtotal: number
              status: string
              subtotal: number
              total_quote_price: number
              updated_at: string
            }[]
          }
      save_project_variation_draft: {
        Args: {
          p_approved_at: string
          p_assumptions: string
          p_attachments: Json
          p_clarifications: string
          p_contingency_amount: number
          p_discount_amount: number
          p_due_date: string
          p_expected_updated_at: string
          p_gst_percent: number
          p_include_contingency_in_export: boolean
          p_include_discount_in_export: boolean
          p_include_margin_in_export: boolean
          p_invoice_ready: boolean
          p_lead_time: string
          p_line_items: Json
          p_margin_percent: number
          p_notes: string
          p_organization_id: string
          p_origin: string
          p_payment_terms: string
          p_project_id: string
          p_requested_by: string
          p_requested_date: string
          p_sent_to_client_at: string
          p_status: string
          p_terms_exclusions: string
          p_terms_inclusions: string
          p_validity_period: string
          p_variation_id: string
          p_variation_number: string
          p_variation_title: string
        }
        Returns: {
          gst_total: number
          id: string
          status: string
          subtotal: number
          total_variation_price: number
          updated_at: string
        }[]
      }
      save_takeoff_calibration_fast: {
        Args: {
          arg_base_unit: string
          arg_created_by: string
          arg_display_unit: string
          arg_id: string
          arg_name: string
          arg_notes: string
          arg_opportunity_id: string
          arg_organization_id: string
          arg_page_id: string
          arg_point_a_x: number
          arg_point_a_y: number
          arg_point_b_x: number
          arg_point_b_y: number
          arg_project_id: string
          arg_reference_length_base: number
          arg_reference_length_input: number
          arg_scale_ratio: number
          arg_unit_system: string
        }
        Returns: {
          base_unit: string
          created_at: string
          created_by: string
          display_unit: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          notes: string
          opportunity_id: string | null
          organization_id: string
          page_id: string
          point_a_x: number
          point_a_y: number
          point_b_x: number
          point_b_y: number
          project_id: string
          reference_length_base: number
          reference_length_input: number
          scale_ratio: number
          superseded_by: string | null
          unit_system: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "takeoff_calibrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      security_assert_tenant_posture: { Args: never; Returns: undefined }
      security_tenant_posture_checks: {
        Args: never
        Returns: {
          check_name: string
          details: string
          passed: boolean
        }[]
      }
      soft_delete_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: Json
      }
      supersede_previous_cost_items: {
        Args: {
          p_document_id: string
          p_document_kind: string
          p_source_revision_key: string
        }
        Returns: number
      }
      sync_project_claim_line_items: {
        Args: {
          p_claim_id: string
          p_input_line_items?: Json
          p_organization_id: string
          p_project_id: string
          p_target_claim_amount?: number
        }
        Returns: number
      }
      sync_purchase_order_line_cost_item: {
        Args: { p_purchase_order_line_item_id: string }
        Returns: string
      }
      takeoff_opportunity_matches_project: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: boolean
      }
      update_organization_settings:
        | {
            Args: {
              p_logo_path?: string
              p_name?: string
              p_organization_id: string
            }
            Returns: {
              address_line_1: string | null
              address_line_2: string | null
              bank_account_details: string | null
              brand_accent_color: string | null
              brand_primary_color: string | null
              business_number: string | null
              city: string | null
              contact_email: string | null
              contact_name: string | null
              contact_phone: string | null
              country: string | null
              created_at: string
              created_by: string
              default_currency: string
              default_tax_mode: string
              default_tax_rate: number
              gst_number: string | null
              id: string
              logo_path: string | null
              name: string
              postcode: string | null
              timezone: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "organizations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_address_line_1?: string
              p_address_line_2?: string
              p_bank_account_details?: string
              p_brand_accent_color?: string
              p_brand_primary_color?: string
              p_business_number?: string
              p_city?: string
              p_contact_email?: string
              p_contact_name?: string
              p_contact_phone?: string
              p_country?: string
              p_default_currency?: string
              p_default_tax_mode?: string
              p_default_tax_rate?: number
              p_gst_number?: string
              p_logo_path?: string
              p_name?: string
              p_organization_id: string
              p_postcode?: string
              p_timezone?: string
            }
            Returns: {
              address_line_1: string | null
              address_line_2: string | null
              bank_account_details: string | null
              brand_accent_color: string | null
              brand_primary_color: string | null
              business_number: string | null
              city: string | null
              contact_email: string | null
              contact_name: string | null
              contact_phone: string | null
              country: string | null
              created_at: string
              created_by: string
              default_currency: string
              default_tax_mode: string
              default_tax_rate: number
              gst_number: string | null
              id: string
              logo_path: string | null
              name: string
              postcode: string | null
              timezone: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "organizations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_project_claim_status: {
        Args: {
          p_claim_id: string
          p_organization_id: string
          p_project_id: string
          p_status: string
        }
        Returns: {
          claim_amount: number
          claim_date: string
          claim_number: string
          claim_title: string
          claim_type: string
          due_date: string
          gst_amount: number
          id: string
          linked_approved_variations: number
          linked_quote_value: number
          net_claim_excl_gst: number
          paid_amount: number
          percent_complete: number
          period_end: string
          period_start: string
          previous_claims_total: number
          retention_balance: number
          retention_held_to_date: number
          retention_percent: number
          retention_released_amount: number
          retention_released_to_date: number
          retention_withheld_amount: number
          revised_contract_value: number
          status: string
          total_payable: number
          updated_at: string
        }[]
      }
      update_purchase_order_status: {
        Args: {
          p_organization_id: string
          p_project_id: string
          p_purchase_order_id: string
          p_status: string
        }
        Returns: {
          id: string
          status: string
          updated_at: string
        }[]
      }
      update_task: { Args: { p_patch: Json; p_task_id: string }; Returns: Json }
      update_task_comment: {
        Args: { p_comment: string; p_comment_id: string; p_metadata?: Json }
        Returns: Json
      }
      upsert_cost_items_for_document: {
        Args: {
          p_document_id: string
          p_document_kind: string
          p_source_revision_key: string
        }
        Returns: number
      }
      upsert_cost_items_for_project_claim: {
        Args: { p_document_id: string; p_source_revision_key: string }
        Returns: number
      }
      upsert_cost_items_for_project_purchase_order: {
        Args: { p_document_id: string; p_source_revision_key: string }
        Returns: number
      }
      upsert_cost_items_for_project_variation: {
        Args: { p_source_revision_key: string; p_variation_id: string }
        Returns: number
      }
      upsert_opportunity_quote_cost_items: {
        Args: { p_document_id: string; p_source_revision_key: string }
        Returns: number
      }
      upsert_project_quote_cost_items_from_opportunity: {
        Args: {
          p_opportunity_quote_id: string
          p_organization_id: string
          p_project_quote_id: string
        }
        Returns: number
      }
    }
    Enums: {
      takeoff_event_type:
        | "created"
        | "updated"
        | "recalculated"
        | "archived"
        | "deleted"
        | "restored"
      takeoff_group_status: "active" | "archived"
      takeoff_measurement_kind: "line" | "area" | "count"
      takeoff_measurement_source: "manual" | "ai" | "imported"
      takeoff_measurement_status: "active" | "archived" | "deleted"
      takeoff_preview_status: "pending" | "processing" | "ready" | "failed"
      takeoff_render_job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      takeoff_event_type: [
        "created",
        "updated",
        "recalculated",
        "archived",
        "deleted",
        "restored",
      ],
      takeoff_group_status: ["active", "archived"],
      takeoff_measurement_kind: ["line", "area", "count"],
      takeoff_measurement_source: ["manual", "ai", "imported"],
      takeoff_measurement_status: ["active", "archived", "deleted"],
      takeoff_preview_status: ["pending", "processing", "ready", "failed"],
      takeoff_render_job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
      ],
    },
  },
} as const
