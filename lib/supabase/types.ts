export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_interactions: {
        Row: {
          actor_member_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          confidence: number | null
          created_at: string
          edited_output: Json | null
          finalized_at: string | null
          finalized_by_user_id: string | null
          human_disposition: string | null
          human_feedback_summary: string | null
          id: string
          input_context_summary: Json
          input_refs: Json
          interaction_type: string
          latency_ms: number | null
          lifecycle_state: string
          linked_event_id: string | null
          model: string
          model_version: string | null
          module: string
          opportunity_id: string | null
          organization_id: string
          output_refs: Json
          output_structured: Json | null
          output_text: string | null
          privacy_classification: string
          project_id: string | null
          prompt_template_key: string | null
          prompt_text: string | null
          provider: string
          retention_expires_at: string | null
          retention_policy_key: string | null
          run_status: string
          source_channel: string
          subject_entity_id: string | null
          subject_entity_type: string
          superseded_by_interaction_id: string | null
          updated_at: string
          usage_input_tokens: number | null
          usage_output_tokens: number | null
          usage_total_tokens: number | null
          validation_status: string | null
          visibility_scope: string
        }
        Insert: {
          actor_member_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          confidence?: number | null
          created_at?: string
          edited_output?: Json | null
          finalized_at?: string | null
          finalized_by_user_id?: string | null
          human_disposition?: string | null
          human_feedback_summary?: string | null
          id?: string
          input_context_summary?: Json
          input_refs?: Json
          interaction_type: string
          latency_ms?: number | null
          lifecycle_state?: string
          linked_event_id?: string | null
          model: string
          model_version?: string | null
          module: string
          opportunity_id?: string | null
          organization_id: string
          output_refs?: Json
          output_structured?: Json | null
          output_text?: string | null
          privacy_classification?: string
          project_id?: string | null
          prompt_template_key?: string | null
          prompt_text?: string | null
          provider: string
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          run_status?: string
          source_channel?: string
          subject_entity_id?: string | null
          subject_entity_type: string
          superseded_by_interaction_id?: string | null
          updated_at?: string
          usage_input_tokens?: number | null
          usage_output_tokens?: number | null
          usage_total_tokens?: number | null
          validation_status?: string | null
          visibility_scope?: string
        }
        Update: {
          actor_member_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          confidence?: number | null
          created_at?: string
          edited_output?: Json | null
          finalized_at?: string | null
          finalized_by_user_id?: string | null
          human_disposition?: string | null
          human_feedback_summary?: string | null
          id?: string
          input_context_summary?: Json
          input_refs?: Json
          interaction_type?: string
          latency_ms?: number | null
          lifecycle_state?: string
          linked_event_id?: string | null
          model?: string
          model_version?: string | null
          module?: string
          opportunity_id?: string | null
          organization_id?: string
          output_refs?: Json
          output_structured?: Json | null
          output_text?: string | null
          privacy_classification?: string
          project_id?: string | null
          prompt_template_key?: string | null
          prompt_text?: string | null
          provider?: string
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          run_status?: string
          source_channel?: string
          subject_entity_id?: string | null
          subject_entity_type?: string
          superseded_by_interaction_id?: string | null
          updated_at?: string
          usage_input_tokens?: number | null
          usage_output_tokens?: number | null
          usage_total_tokens?: number | null
          validation_status?: string | null
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_superseded_by_interaction_id_fkey"
            columns: ["superseded_by_interaction_id"]
            isOneToOne: false
            referencedRelation: "ai_interactions"
            referencedColumns: ["id"]
          },
        ]
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
      commercial_item_document_links: {
        Row: {
          commercial_item_id: string
          created_at: string
          created_by: string
          document_id: string
          document_kind: string
          document_line_id: string
          id: string
          link_role: string
          organization_id: string
          snapshot_at_link_json: Json
        }
        Insert: {
          commercial_item_id: string
          created_at?: string
          created_by: string
          document_id: string
          document_kind: string
          document_line_id: string
          id?: string
          link_role?: string
          organization_id: string
          snapshot_at_link_json?: Json
        }
        Update: {
          commercial_item_id?: string
          created_at?: string
          created_by?: string
          document_id?: string
          document_kind?: string
          document_line_id?: string
          id?: string
          link_role?: string
          organization_id?: string
          snapshot_at_link_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "commercial_item_document_links_commercial_item_id_fkey"
            columns: ["commercial_item_id"]
            isOneToOne: false
            referencedRelation: "commercial_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_item_document_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_items: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          last_source_changed_at: string | null
          last_source_checked_at: string | null
          locked_metadata_json: Json
          opportunity_id: string
          organization_id: string
          project_id: string | null
          quantity: number | null
          rate: number | null
          snapshot_json: Json
          source_link_json: Json
          source_range: string
          source_sheet_id: string
          source_signature: string
          source_status: string
          source_type: string
          source_version: number
          source_workbook_id: string
          source_worksheet_id: string
          stale_reason_code: string | null
          total: number | null
          ucl_classification: string | null
          ucl_validation_status: string
          unit: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string
          id?: string
          last_source_changed_at?: string | null
          last_source_checked_at?: string | null
          locked_metadata_json?: Json
          opportunity_id: string
          organization_id: string
          project_id?: string | null
          quantity?: number | null
          rate?: number | null
          snapshot_json?: Json
          source_link_json?: Json
          source_range: string
          source_sheet_id: string
          source_signature: string
          source_status?: string
          source_type?: string
          source_version?: number
          source_workbook_id: string
          source_worksheet_id: string
          stale_reason_code?: string | null
          total?: number | null
          ucl_classification?: string | null
          ucl_validation_status?: string
          unit?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          last_source_changed_at?: string | null
          last_source_checked_at?: string | null
          locked_metadata_json?: Json
          opportunity_id?: string
          organization_id?: string
          project_id?: string | null
          quantity?: number | null
          rate?: number | null
          snapshot_json?: Json
          source_link_json?: Json
          source_range?: string
          source_sheet_id?: string
          source_signature?: string
          source_status?: string
          source_type?: string
          source_version?: number
          source_workbook_id?: string
          source_worksheet_id?: string
          stale_reason_code?: string | null
          total?: number | null
          ucl_classification?: string | null
          ucl_validation_status?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_items_source_sheet_id_fkey"
            columns: ["source_sheet_id"]
            isOneToOne: false
            referencedRelation: "opportunity_pricing_workbook_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_items_source_workbook_id_fkey"
            columns: ["source_workbook_id"]
            isOneToOne: false
            referencedRelation: "opportunity_pricing_worksheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_items_source_worksheet_id_fkey"
            columns: ["source_worksheet_id"]
            isOneToOne: false
            referencedRelation: "opportunity_pricing_worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_evidence_pool_events: {
        Row: {
          event_confidence: number | null
          evidence_role: string
          id: string
          linked_at: string
          occurred_at: string
          organization_id: string
          pool_id: string
          source_event_id: string
        }
        Insert: {
          event_confidence?: number | null
          evidence_role?: string
          id?: string
          linked_at?: string
          occurred_at: string
          organization_id: string
          pool_id: string
          source_event_id: string
        }
        Update: {
          event_confidence?: number | null
          evidence_role?: string
          id?: string
          linked_at?: string
          occurred_at?: string
          organization_id?: string
          pool_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_evidence_pool_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_evidence_pool_events_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_evidence_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_evidence_pool_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cost_construction_intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_evidence_pool_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          source_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          source_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_evidence_pool_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_evidence_pool_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: true
            referencedRelation: "cost_construction_intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_evidence_pools: {
        Row: {
          average_confidence: number | null
          contradiction_count: number
          created_at: string
          event_count: number
          evidence_count: number
          first_seen_at: string
          id: string
          last_built_at: string
          last_seen_at: string
          maturity_status: string
          organization_id: string
          pool_kind: string
          pool_revision_hash: string
          pool_signature: string
          project_count: number
          scope_context: Json
          scope_signature: string
          semantic_seed_signature: string | null
          supplier_count: number
          support_count: number
          supporting_event_ids: Json
          target_context: Json
          target_signature: string
          updated_at: string
        }
        Insert: {
          average_confidence?: number | null
          contradiction_count?: number
          created_at?: string
          event_count?: number
          evidence_count?: number
          first_seen_at: string
          id?: string
          last_built_at?: string
          last_seen_at: string
          maturity_status?: string
          organization_id: string
          pool_kind: string
          pool_revision_hash: string
          pool_signature: string
          project_count?: number
          scope_context?: Json
          scope_signature: string
          semantic_seed_signature?: string | null
          supplier_count?: number
          support_count?: number
          supporting_event_ids?: Json
          target_context?: Json
          target_signature: string
          updated_at?: string
        }
        Update: {
          average_confidence?: number | null
          contradiction_count?: number
          created_at?: string
          event_count?: number
          evidence_count?: number
          first_seen_at?: string
          id?: string
          last_built_at?: string
          last_seen_at?: string
          maturity_status?: string
          organization_id?: string
          pool_kind?: string
          pool_revision_hash?: string
          pool_signature?: string
          project_count?: number
          scope_context?: Json
          scope_signature?: string
          semantic_seed_signature?: string | null
          supplier_count?: number
          support_count?: number
          supporting_event_ids?: Json
          target_context?: Json
          target_signature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_evidence_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_semantic_pool_events: {
        Row: {
          evidence_role: string
          id: string
          linked_at: string
          linked_by_run_id: string | null
          organization_id: string
          semantic_pool_id: string
          source_event_id: string
        }
        Insert: {
          evidence_role: string
          id?: string
          linked_at?: string
          linked_by_run_id?: string | null
          organization_id: string
          semantic_pool_id: string
          source_event_id: string
        }
        Update: {
          evidence_role?: string
          id?: string
          linked_at?: string
          linked_by_run_id?: string | null
          organization_id?: string
          semantic_pool_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_semantic_pool_events_linked_by_run_id_fkey"
            columns: ["linked_by_run_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pool_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pool_events_semantic_pool_id_fkey"
            columns: ["semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pool_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cost_construction_intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_semantic_pool_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          seed_maturity_status: string
          seed_pool_id: string
          seed_pool_revision_hash: string
          seed_pool_signature: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          seed_maturity_status: string
          seed_pool_id: string
          seed_pool_revision_hash: string
          seed_pool_signature: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          seed_maturity_status?: string
          seed_pool_id?: string
          seed_pool_revision_hash?: string
          seed_pool_signature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_semantic_pool_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pool_queue_seed_pool_id_fkey"
            columns: ["seed_pool_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_evidence_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_semantic_pool_runs: {
        Row: {
          candidate_event_count: number
          claimed_job_count: number
          completed_job_count: number
          created_at: string
          dead_lettered_job_count: number
          duration_ms: number
          id: string
          requested_organization_id: string | null
          retried_job_count: number
          semantic_pool_count: number
          updated_at: string
        }
        Insert: {
          candidate_event_count?: number
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          requested_organization_id?: string | null
          retried_job_count?: number
          semantic_pool_count?: number
          updated_at?: string
        }
        Update: {
          candidate_event_count?: number
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          requested_organization_id?: string | null
          retried_job_count?: number
          semantic_pool_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_semantic_poo_requested_organization_id_fkey"
            columns: ["requested_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_semantic_pools: {
        Row: {
          average_confidence: number | null
          contradiction_count: number
          contradiction_summary: Json
          created_at: string
          created_by_run_id: string | null
          event_count: number
          evidence_summary: Json
          first_seen_at: string
          id: string
          ignored_count: number
          last_grouped_at: string
          last_seen_at: string
          last_updated_by_run_id: string | null
          maturity_status: string
          organization_id: string
          pool_status: string
          pool_value_payload: Json
          project_count: number
          retrieval_guidance: string | null
          scope_payload: Json
          semantic_family: string | null
          semantic_signature: string
          semantic_type: string | null
          source_revision_hash: string
          summary: string | null
          supplier_count: number
          support_count: number
          title: string | null
          updated_at: string
        }
        Insert: {
          average_confidence?: number | null
          contradiction_count?: number
          contradiction_summary?: Json
          created_at?: string
          created_by_run_id?: string | null
          event_count?: number
          evidence_summary?: Json
          first_seen_at: string
          id?: string
          ignored_count?: number
          last_grouped_at?: string
          last_seen_at: string
          last_updated_by_run_id?: string | null
          maturity_status?: string
          organization_id: string
          pool_status?: string
          pool_value_payload?: Json
          project_count?: number
          retrieval_guidance?: string | null
          scope_payload?: Json
          semantic_family?: string | null
          semantic_signature: string
          semantic_type?: string | null
          source_revision_hash: string
          summary?: string | null
          supplier_count?: number
          support_count?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          average_confidence?: number | null
          contradiction_count?: number
          contradiction_summary?: Json
          created_at?: string
          created_by_run_id?: string | null
          event_count?: number
          evidence_summary?: Json
          first_seen_at?: string
          id?: string
          ignored_count?: number
          last_grouped_at?: string
          last_seen_at?: string
          last_updated_by_run_id?: string | null
          maturity_status?: string
          organization_id?: string
          pool_status?: string
          pool_value_payload?: Json
          project_count?: number
          retrieval_guidance?: string | null
          scope_payload?: Json
          semantic_family?: string | null
          semantic_signature?: string
          semantic_type?: string | null
          source_revision_hash?: string
          summary?: string | null
          supplier_count?: number
          support_count?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_semantic_pools_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pools_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_semantic_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_synthesis_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          semantic_pool_id: string
          source_revision_hash: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          semantic_pool_id: string
          source_revision_hash: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          semantic_pool_id?: string
          source_revision_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_synthesis_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_memory_synthesis_queue_semantic_pool_id_fkey"
            columns: ["semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "construction_memory_semantic_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_memory_synthesis_runs: {
        Row: {
          claimed_job_count: number
          completed_job_count: number
          contradicted_memory_count: number
          created_at: string
          created_memory_count: number
          dead_lettered_job_count: number
          duration_ms: number
          id: string
          no_memory_count: number
          organization_memory_write_count: number
          provenance_link_count: number
          reinforced_memory_count: number
          requested_organization_id: string | null
          retried_job_count: number
          reused_memory_count: number
          superseded_memory_count: number
          updated_at: string
          updated_memory_count: number
        }
        Insert: {
          claimed_job_count?: number
          completed_job_count?: number
          contradicted_memory_count?: number
          created_at?: string
          created_memory_count?: number
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          no_memory_count?: number
          organization_memory_write_count?: number
          provenance_link_count?: number
          reinforced_memory_count?: number
          requested_organization_id?: string | null
          retried_job_count?: number
          reused_memory_count?: number
          superseded_memory_count?: number
          updated_at?: string
          updated_memory_count?: number
        }
        Update: {
          claimed_job_count?: number
          completed_job_count?: number
          contradicted_memory_count?: number
          created_at?: string
          created_memory_count?: number
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          no_memory_count?: number
          organization_memory_write_count?: number
          provenance_link_count?: number
          reinforced_memory_count?: number
          requested_organization_id?: string | null
          retried_job_count?: number
          reused_memory_count?: number
          superseded_memory_count?: number
          updated_at?: string
          updated_memory_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "construction_memory_synthesis_ru_requested_organization_id_fkey"
            columns: ["requested_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_events: {
        Row: {
          corrected_by_member_id: string | null
          corrected_by_user_id: string | null
          corrected_field_name: string | null
          corrected_value: Json | null
          correction_reason: string | null
          correction_type: string
          created_at: string
          feedback_label: string | null
          id: string
          incorrect_value: Json | null
          is_training_eligible: boolean
          linked_ai_interaction_id: string | null
          linked_event_id: string | null
          linked_validation_case_id: string | null
          module: string
          opportunity_id: string | null
          organization_id: string
          privacy_classification: string
          project_id: string | null
          target_entity_id: string | null
          target_entity_type: string
          visibility_scope: string
        }
        Insert: {
          corrected_by_member_id?: string | null
          corrected_by_user_id?: string | null
          corrected_field_name?: string | null
          corrected_value?: Json | null
          correction_reason?: string | null
          correction_type: string
          created_at?: string
          feedback_label?: string | null
          id?: string
          incorrect_value?: Json | null
          is_training_eligible?: boolean
          linked_ai_interaction_id?: string | null
          linked_event_id?: string | null
          linked_validation_case_id?: string | null
          module: string
          opportunity_id?: string | null
          organization_id: string
          privacy_classification?: string
          project_id?: string | null
          target_entity_id?: string | null
          target_entity_type: string
          visibility_scope?: string
        }
        Update: {
          corrected_by_member_id?: string | null
          corrected_by_user_id?: string | null
          corrected_field_name?: string | null
          corrected_value?: Json | null
          correction_reason?: string | null
          correction_type?: string
          created_at?: string
          feedback_label?: string | null
          id?: string
          incorrect_value?: Json | null
          is_training_eligible?: boolean
          linked_ai_interaction_id?: string | null
          linked_event_id?: string | null
          linked_validation_case_id?: string | null
          module?: string
          opportunity_id?: string | null
          organization_id?: string
          privacy_classification?: string
          project_id?: string | null
          target_entity_id?: string | null
          target_entity_type?: string
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_events_corrected_by_member_id_fkey"
            columns: ["corrected_by_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_linked_ai_interaction_id_fkey"
            columns: ["linked_ai_interaction_id"]
            isOneToOne: false
            referencedRelation: "ai_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_linked_validation_case_id_fkey"
            columns: ["linked_validation_case_id"]
            isOneToOne: false
            referencedRelation: "validation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_construction_intelligence_events: {
        Row: {
          accounting_mapping_id: string | null
          ai_construction_intelligence: Json | null
          ai_model: string | null
          ai_prompt_version: number | null
          ai_provider: string | null
          amount: number | null
          classification_status: string
          classification_version: number
          created_at: string
          description: string
          document_context: Json
          error_code: string | null
          error_message: string | null
          event_payload: Json
          id: string
          idempotency_key: string
          organization_id: string
          processed_at: string | null
          project_id: string | null
          quantity: number | null
          rate: number | null
          source_id: string
          source_line_id: string | null
          source_type: string
          supplier_id: string | null
          supplier_name_snapshot: string | null
          tradesstack_cost_code: string
          tradesstack_cost_code_label: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json | null
          ai_model?: string | null
          ai_prompt_version?: number | null
          ai_provider?: string | null
          amount?: number | null
          classification_status?: string
          classification_version?: number
          created_at?: string
          description?: string
          document_context?: Json
          error_code?: string | null
          error_message?: string | null
          event_payload?: Json
          id?: string
          idempotency_key: string
          organization_id: string
          processed_at?: string | null
          project_id?: string | null
          quantity?: number | null
          rate?: number | null
          source_id: string
          source_line_id?: string | null
          source_type: string
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          tradesstack_cost_code: string
          tradesstack_cost_code_label: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json | null
          ai_model?: string | null
          ai_prompt_version?: number | null
          ai_provider?: string | null
          amount?: number | null
          classification_status?: string
          classification_version?: number
          created_at?: string
          description?: string
          document_context?: Json
          error_code?: string | null
          error_message?: string | null
          event_payload?: Json
          id?: string
          idempotency_key?: string
          organization_id?: string
          processed_at?: string | null
          project_id?: string | null
          quantity?: number | null
          rate?: number | null
          source_id?: string
          source_line_id?: string | null
          source_type?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          tradesstack_cost_code?: string
          tradesstack_cost_code_label?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_construction_intelligence_event_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_construction_intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_construction_intelligence_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_construction_intelligence_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_construction_intelligence_queue: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          event_id: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          processing_status: string
          retry_after: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          event_id: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          processing_status?: string
          retry_after?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          event_id?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          processing_status?: string
          retry_after?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_construction_intelligence_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "cost_construction_intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_construction_intelligence_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          accounting_mapping_id: string | null
          ai_construction_intelligence: Json
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
          financial_routing_confidence: number | null
          financial_routing_source: string | null
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
          review_reason: string | null
          review_status: string | null
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
          tradesstack_cost_code: number | null
          tradesstack_cost_code_label: string | null
          unit: string
          unit_rate: number
          updated_at: string
          work_type: string | null
        }
        Insert: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
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
          financial_routing_confidence?: number | null
          financial_routing_source?: string | null
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
          review_reason?: string | null
          review_status?: string | null
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
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          unit?: string
          unit_rate?: number
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
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
          financial_routing_confidence?: number | null
          financial_routing_source?: string | null
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
          review_reason?: string | null
          review_status?: string | null
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
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          unit?: string
          unit_rate?: number
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "cost_items_tradesstack_cost_code_fkey"
            columns: ["tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      intelligence_events: {
        Row: {
          action: string
          actor_member_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          contains_attachment_content: boolean
          contains_financial_data: boolean
          contains_personal_data: boolean
          created_at: string
          diff_data: Json
          entity_id: string | null
          entity_type: string
          entity_version: number | null
          event_family: string
          event_type: string
          field_name: string | null
          id: string
          legal_hold: boolean
          lineage_refs: Json
          metadata: Json
          module: string
          occurred_at: string
          opportunity_id: string | null
          organization_id: string
          parent_entity_id: string | null
          parent_entity_type: string | null
          privacy_classification: string
          project_id: string | null
          reason: string | null
          related_entities: Json
          retention_expires_at: string | null
          retention_policy_key: string | null
          source_channel: string
          source_device_id: string | null
          source_request_id: string | null
          source_session_id: string | null
          source_surface: string | null
          status_after: string | null
          status_before: string | null
          submodule: string | null
          visibility_scope: string
        }
        Insert: {
          action: string
          actor_member_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          contains_attachment_content?: boolean
          contains_financial_data?: boolean
          contains_personal_data?: boolean
          created_at?: string
          diff_data?: Json
          entity_id?: string | null
          entity_type: string
          entity_version?: number | null
          event_family: string
          event_type: string
          field_name?: string | null
          id?: string
          legal_hold?: boolean
          lineage_refs?: Json
          metadata?: Json
          module: string
          occurred_at?: string
          opportunity_id?: string | null
          organization_id: string
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          privacy_classification?: string
          project_id?: string | null
          reason?: string | null
          related_entities?: Json
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          source_channel?: string
          source_device_id?: string | null
          source_request_id?: string | null
          source_session_id?: string | null
          source_surface?: string | null
          status_after?: string | null
          status_before?: string | null
          submodule?: string | null
          visibility_scope?: string
        }
        Update: {
          action?: string
          actor_member_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          contains_attachment_content?: boolean
          contains_financial_data?: boolean
          contains_personal_data?: boolean
          created_at?: string
          diff_data?: Json
          entity_id?: string | null
          entity_type?: string
          entity_version?: number | null
          event_family?: string
          event_type?: string
          field_name?: string | null
          id?: string
          legal_hold?: boolean
          lineage_refs?: Json
          metadata?: Json
          module?: string
          occurred_at?: string
          opportunity_id?: string | null
          organization_id?: string
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          privacy_classification?: string
          project_id?: string | null
          reason?: string | null
          related_entities?: Json
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          source_channel?: string
          source_device_id?: string | null
          source_request_id?: string | null
          source_session_id?: string | null
          source_surface?: string | null
          status_after?: string | null
          status_before?: string | null
          submodule?: string | null
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_action_results: {
        Row: {
          action_key: string
          action_type: string
          confidence_adjustment: number | null
          created_at: string
          created_memory_id: string | null
          id: string
          learning_id: string
          organization_id: string
          reason: string | null
          result_status: string
          review_run_id: string
          target_memory_id: string | null
          updated_memory_id: string | null
        }
        Insert: {
          action_key: string
          action_type: string
          confidence_adjustment?: number | null
          created_at?: string
          created_memory_id?: string | null
          id?: string
          learning_id: string
          organization_id: string
          reason?: string | null
          result_status?: string
          review_run_id: string
          target_memory_id?: string | null
          updated_memory_id?: string | null
        }
        Update: {
          action_key?: string
          action_type?: string
          confidence_adjustment?: number | null
          created_at?: string
          created_memory_id?: string | null
          id?: string
          learning_id?: string
          organization_id?: string
          reason?: string | null
          result_status?: string
          review_run_id?: string
          target_memory_id?: string | null
          updated_memory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_action_results_created_memory_id_fkey"
            columns: ["created_memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_action_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_action_results_review_run_id_fkey"
            columns: ["review_run_id"]
            isOneToOne: false
            referencedRelation: "learning_review_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_action_results_target_memory_id_fkey"
            columns: ["target_memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_action_results_updated_memory_id_fkey"
            columns: ["updated_memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_cursors: {
        Row: {
          container_type: string
          created_at: string
          id: string
          last_cursor_id: string | null
          last_cursor_updated_at: string | null
          last_record_count: number
          last_run_id: string | null
          last_successful_review_month: string | null
          organization_id: string
          scope_key: string
          updated_at: string
        }
        Insert: {
          container_type: string
          created_at?: string
          id?: string
          last_cursor_id?: string | null
          last_cursor_updated_at?: string | null
          last_record_count?: number
          last_run_id?: string | null
          last_successful_review_month?: string | null
          organization_id: string
          scope_key?: string
          updated_at?: string
        }
        Update: {
          container_type?: string
          created_at?: string
          id?: string
          last_cursor_id?: string | null
          last_cursor_updated_at?: string | null
          last_record_count?: number
          last_run_id?: string | null
          last_successful_review_month?: string | null
          organization_id?: string
          scope_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_cursors_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "learning_review_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_cursors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_queue: {
        Row: {
          attempt_count: number
          available_at: string
          budget_snapshot: Json
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          container_type: string
          created_at: string
          eligibility_snapshot: Json
          id: string
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_run_id: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          review_month: string
          scope_key: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          budget_snapshot?: Json
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          container_type: string
          created_at?: string
          eligibility_snapshot?: Json
          id?: string
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_run_id?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          review_month: string
          scope_key?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          budget_snapshot?: Json
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          container_type?: string
          created_at?: string
          eligibility_snapshot?: Json
          id?: string
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_run_id?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          review_month?: string
          scope_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_queue_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "learning_review_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_run_records: {
        Row: {
          container_type: string
          created_at: string
          id: string
          organization_id: string
          record_hash: string
          record_strength: string
          review_run_id: string
          source_id: string
          source_opportunity_id: string | null
          source_project_id: string | null
          source_supplier_id: string | null
          source_table: string
          source_updated_at: string
        }
        Insert: {
          container_type: string
          created_at?: string
          id?: string
          organization_id: string
          record_hash: string
          record_strength?: string
          review_run_id: string
          source_id: string
          source_opportunity_id?: string | null
          source_project_id?: string | null
          source_supplier_id?: string | null
          source_table: string
          source_updated_at: string
        }
        Update: {
          container_type?: string
          created_at?: string
          id?: string
          organization_id?: string
          record_hash?: string
          record_strength?: string
          review_run_id?: string
          source_id?: string
          source_opportunity_id?: string | null
          source_project_id?: string | null
          source_supplier_id?: string | null
          source_table?: string
          source_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_run_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_run_records_review_run_id_fkey"
            columns: ["review_run_id"]
            isOneToOne: false
            referencedRelation: "learning_review_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_run_records_source_opportunity_id_fkey"
            columns: ["source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_run_records_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_run_records_source_supplier_id_fkey"
            columns: ["source_supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_runs: {
        Row: {
          candidate_next_cursor_id: string | null
          candidate_next_cursor_updated_at: string | null
          completed_at: string | null
          container_type: string
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          final_next_cursor_id: string | null
          final_next_cursor_updated_at: string | null
          id: string
          input_token_count: number | null
          memory_pack_count: number
          model_name: string | null
          model_provider: string | null
          organization_id: string
          output_token_count: number | null
          previous_cursor_id: string | null
          previous_cursor_updated_at: string | null
          prompt_hash: string
          prompt_version: string
          response_hash: string | null
          review_month: string
          run_status: string
          run_type: string
          scope_key: string
          selected_record_count: number
          started_at: string | null
          total_token_count: number | null
          updated_at: string
        }
        Insert: {
          candidate_next_cursor_id?: string | null
          candidate_next_cursor_updated_at?: string | null
          completed_at?: string | null
          container_type: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          final_next_cursor_id?: string | null
          final_next_cursor_updated_at?: string | null
          id?: string
          input_token_count?: number | null
          memory_pack_count?: number
          model_name?: string | null
          model_provider?: string | null
          organization_id: string
          output_token_count?: number | null
          previous_cursor_id?: string | null
          previous_cursor_updated_at?: string | null
          prompt_hash?: string
          prompt_version?: string
          response_hash?: string | null
          review_month: string
          run_status?: string
          run_type?: string
          scope_key?: string
          selected_record_count?: number
          started_at?: string | null
          total_token_count?: number | null
          updated_at?: string
        }
        Update: {
          candidate_next_cursor_id?: string | null
          candidate_next_cursor_updated_at?: string | null
          completed_at?: string | null
          container_type?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          final_next_cursor_id?: string | null
          final_next_cursor_updated_at?: string | null
          id?: string
          input_token_count?: number | null
          memory_pack_count?: number
          model_name?: string | null
          model_provider?: string | null
          organization_id?: string
          output_token_count?: number | null
          previous_cursor_id?: string | null
          previous_cursor_updated_at?: string | null
          prompt_hash?: string
          prompt_version?: string
          response_hash?: string | null
          review_month?: string
          run_status?: string
          run_type?: string
          scope_key?: string
          selected_record_count?: number
          started_at?: string | null
          total_token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      opportunity_pricing_workbook_sheets: {
        Row: {
          created_at: string
          created_by: string
          extracted_pricing_data: Json
          id: string
          is_default: boolean
          name: string
          opportunity_id: string
          organization_id: string
          pricing_summary: Json
          sheet_order: number
          updated_at: string
          updated_by: string
          version: number
          workbook_id: string
          worksheet_data: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          extracted_pricing_data?: Json
          id?: string
          is_default?: boolean
          name?: string
          opportunity_id: string
          organization_id: string
          pricing_summary?: Json
          sheet_order?: number
          updated_at?: string
          updated_by: string
          version?: number
          workbook_id: string
          worksheet_data?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          extracted_pricing_data?: Json
          id?: string
          is_default?: boolean
          name?: string
          opportunity_id?: string
          organization_id?: string
          pricing_summary?: Json
          sheet_order?: number
          updated_at?: string
          updated_by?: string
          version?: number
          workbook_id?: string
          worksheet_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_pricing_workbook_sheets_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_workbook_sheets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_workbook_sheets_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "opportunity_pricing_worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_pricing_worksheets: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          extracted_pricing_data: Json
          id: string
          last_active_sheet_id: string | null
          name: string
          opportunity_id: string
          organization_id: string
          pricing_summary: Json
          project_id: string | null
          quote_id: string | null
          sort_order: number | null
          trade_package: string | null
          updated_at: string
          updated_by: string
          variation_id: string | null
          version: number
          worksheet_data: Json
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          extracted_pricing_data?: Json
          id?: string
          last_active_sheet_id?: string | null
          name?: string
          opportunity_id: string
          organization_id: string
          pricing_summary?: Json
          project_id?: string | null
          quote_id?: string | null
          sort_order?: number | null
          trade_package?: string | null
          updated_at?: string
          updated_by: string
          variation_id?: string | null
          version?: number
          worksheet_data?: Json
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          extracted_pricing_data?: Json
          id?: string
          last_active_sheet_id?: string | null
          name?: string
          opportunity_id?: string
          organization_id?: string
          pricing_summary?: Json
          project_id?: string | null
          quote_id?: string | null
          sort_order?: number | null
          trade_package?: string | null
          updated_at?: string
          updated_by?: string
          variation_id?: string | null
          version?: number
          worksheet_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_pricing_worksheets_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_worksheets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_worksheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_worksheets_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_pricing_worksheets_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "project_variations"
            referencedColumns: ["id"]
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
      organization_accounting_document_lines: {
        Row: {
          accounting_mapping_id: string
          commercial_line_snapshot_id: string
          created_at: string
          description: string
          gross_amount: number
          id: string
          line_amount: number
          organization_cost_code_id: string
          organization_id: string
          project_id: string | null
          purchase_order_id: string | null
          purchase_order_line_item_id: string | null
          purchase_order_number_snapshot: string | null
          quantity: number
          routing_code: number
          sequence: number
          source_allocation_id: string | null
          source_invoice_line_id: string | null
          tax_amount: number
          unit_amount: number
          version_id: string
          xero_account_code: string
          xero_account_id: string
          xero_tax_type: string
        }
        Insert: {
          accounting_mapping_id: string
          commercial_line_snapshot_id: string
          created_at?: string
          description: string
          gross_amount: number
          id?: string
          line_amount: number
          organization_cost_code_id: string
          organization_id: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          purchase_order_number_snapshot?: string | null
          quantity: number
          routing_code: number
          sequence: number
          source_allocation_id?: string | null
          source_invoice_line_id?: string | null
          tax_amount: number
          unit_amount: number
          version_id: string
          xero_account_code: string
          xero_account_id: string
          xero_tax_type: string
        }
        Update: {
          accounting_mapping_id?: string
          commercial_line_snapshot_id?: string
          created_at?: string
          description?: string
          gross_amount?: number
          id?: string
          line_amount?: number
          organization_cost_code_id?: string
          organization_id?: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          purchase_order_number_snapshot?: string | null
          quantity?: number
          routing_code?: number
          sequence?: number
          source_allocation_id?: string | null
          source_invoice_line_id?: string | null
          tax_amount?: number
          unit_amount?: number
          version_id?: string
          xero_account_code?: string
          xero_account_id?: string
          xero_tax_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_accounting_docume_commercial_line_snapshot_id_fkey"
            columns: ["commercial_line_snapshot_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_commercial_line_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_docume_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_li_source_invoice_line_id_fkey"
            columns: ["source_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_lin_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_line_source_allocation_id_fkey"
            columns: ["source_allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_lines_routing_code_fkey"
            columns: ["routing_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_accounting_document_lines_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_organization_cost_code_id_fkey"
            columns: ["organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_accounting_document_versions: {
        Row: {
          commercial_approval_id: string
          connection_id_snapshot: string
          contact_id_snapshot: string
          contact_name_snapshot: string
          content_hash: string
          created_at: string
          created_by: string
          currency_code_snapshot: string
          document_id: string
          due_date_snapshot: string
          finance_hash: string
          id: string
          idempotency_key: string
          invoice_date_snapshot: string
          invoice_number_snapshot: string
          line_amount_type_snapshot: string
          organization_id: string
          po_numbers_snapshot: string[]
          readiness_snapshot: Json
          request_started_at: string | null
          requested_external_status: string
          status: string
          subtotal_snapshot: number
          supplier_link_id: string
          tax_total_snapshot: number
          tenant_id_snapshot: string
          total_snapshot: number
        }
        Insert: {
          commercial_approval_id: string
          connection_id_snapshot: string
          contact_id_snapshot: string
          contact_name_snapshot: string
          content_hash: string
          created_at?: string
          created_by: string
          currency_code_snapshot: string
          document_id: string
          due_date_snapshot: string
          finance_hash: string
          id?: string
          idempotency_key: string
          invoice_date_snapshot: string
          invoice_number_snapshot: string
          line_amount_type_snapshot: string
          organization_id: string
          po_numbers_snapshot?: string[]
          readiness_snapshot: Json
          request_started_at?: string | null
          requested_external_status?: string
          status?: string
          subtotal_snapshot: number
          supplier_link_id: string
          tax_total_snapshot: number
          tenant_id_snapshot: string
          total_snapshot: number
        }
        Update: {
          commercial_approval_id?: string
          connection_id_snapshot?: string
          contact_id_snapshot?: string
          contact_name_snapshot?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          currency_code_snapshot?: string
          document_id?: string
          due_date_snapshot?: string
          finance_hash?: string
          id?: string
          idempotency_key?: string
          invoice_date_snapshot?: string
          invoice_number_snapshot?: string
          line_amount_type_snapshot?: string
          organization_id?: string
          po_numbers_snapshot?: string[]
          readiness_snapshot?: Json
          request_started_at?: string | null
          requested_external_status?: string
          status?: string
          subtotal_snapshot?: number
          supplier_link_id?: string
          tax_total_snapshot?: number
          tenant_id_snapshot?: string
          total_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_accounting_document_ve_commercial_approval_id_fkey"
            columns: ["commercial_approval_id"]
            isOneToOne: true
            referencedRelation: "supplier_invoice_commercial_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_ve_connection_id_snapshot_fkey"
            columns: ["connection_id_snapshot"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_document_versions_supplier_link_id_fkey"
            columns: ["supplier_link_id"]
            isOneToOne: false
            referencedRelation: "organization_external_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_accounting_documents: {
        Row: {
          accounting_connection_id: string
          amount_credited: number | null
          amount_due: number | null
          amount_exported: number | null
          amount_paid: number | null
          attachment_error_code: string | null
          attachment_error_message: string | null
          attachment_filename: string | null
          attachment_status: string
          attachment_synced_hash: string | null
          attachment_uploaded_at: string | null
          created_at: string
          currency_code: string | null
          current_version_id: string | null
          export_status: string
          exported_at: string | null
          exported_by: string | null
          external_document_id: string | null
          external_document_number: string | null
          fully_paid_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_status_sync_error: string | null
          last_status_synced_at: string | null
          last_synced_at: string | null
          last_synced_hash: string | null
          local_document_id: string | null
          local_document_type: string
          normalized_external_status: string | null
          organization_id: string
          project_claim_id: string | null
          provider: string
          provider_updated_at: string | null
          raw_external_status: string | null
          tax_exported: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accounting_connection_id: string
          amount_credited?: number | null
          amount_due?: number | null
          amount_exported?: number | null
          amount_paid?: number | null
          attachment_error_code?: string | null
          attachment_error_message?: string | null
          attachment_filename?: string | null
          attachment_status?: string
          attachment_synced_hash?: string | null
          attachment_uploaded_at?: string | null
          created_at?: string
          currency_code?: string | null
          current_version_id?: string | null
          export_status?: string
          exported_at?: string | null
          exported_by?: string | null
          external_document_id?: string | null
          external_document_number?: string | null
          fully_paid_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_status_sync_error?: string | null
          last_status_synced_at?: string | null
          last_synced_at?: string | null
          last_synced_hash?: string | null
          local_document_id?: string | null
          local_document_type: string
          normalized_external_status?: string | null
          organization_id: string
          project_claim_id?: string | null
          provider: string
          provider_updated_at?: string | null
          raw_external_status?: string | null
          tax_exported?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accounting_connection_id?: string
          amount_credited?: number | null
          amount_due?: number | null
          amount_exported?: number | null
          amount_paid?: number | null
          attachment_error_code?: string | null
          attachment_error_message?: string | null
          attachment_filename?: string | null
          attachment_status?: string
          attachment_synced_hash?: string | null
          attachment_uploaded_at?: string | null
          created_at?: string
          currency_code?: string | null
          current_version_id?: string | null
          export_status?: string
          exported_at?: string | null
          exported_by?: string | null
          external_document_id?: string | null
          external_document_number?: string | null
          fully_paid_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_status_sync_error?: string | null
          last_status_synced_at?: string | null
          last_synced_at?: string | null
          last_synced_hash?: string | null
          local_document_id?: string | null
          local_document_type?: string
          normalized_external_status?: string | null
          organization_id?: string
          project_claim_id?: string | null
          provider?: string
          provider_updated_at?: string | null
          raw_external_status?: string | null
          tax_exported?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_accounting_documents_accounting_connection_id_fkey"
            columns: ["accounting_connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_documents_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_documents_local_document_id_fkey"
            columns: ["local_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_documents_project_claim_org_fkey"
            columns: ["organization_id", "project_claim_id"]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_accounting_sync_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          connection_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          idempotency_key: string | null
          job_kind: string
          last_completed_at: string | null
          last_error: string | null
          max_attempts: number
          organization_id: string
          provider: string
          queue_state: string
          request_payload: Json
          result_summary: Json
          retry_after: string | null
          trigger_source: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          connection_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          job_kind: string
          last_completed_at?: string | null
          last_error?: string | null
          max_attempts?: number
          organization_id: string
          provider: string
          queue_state?: string
          request_payload?: Json
          result_summary?: Json
          retry_after?: string | null
          trigger_source: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          connection_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          job_kind?: string
          last_completed_at?: string | null
          last_error?: string | null
          max_attempts?: number
          organization_id?: string
          provider?: string
          queue_state?: string
          request_payload?: Json
          result_summary?: Json
          retry_after?: string | null
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_accounting_sync_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_sync_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_accounting_tax_rates: {
        Row: {
          accounting_connection_id: string | null
          can_apply_to_expenses: boolean
          created_at: string
          created_by_user_id: string | null
          display_name: string | null
          effective_rate: number | null
          external_id: string
          id: string
          is_active: boolean
          jurisdiction_code: string | null
          metadata: Json
          name: string
          organization_id: string
          provider: string
          status: string | null
          synced_at: string | null
          tax_type: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          accounting_connection_id?: string | null
          can_apply_to_expenses?: boolean
          created_at?: string
          created_by_user_id?: string | null
          display_name?: string | null
          effective_rate?: number | null
          external_id: string
          id?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          metadata?: Json
          name: string
          organization_id: string
          provider: string
          status?: string | null
          synced_at?: string | null
          tax_type?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          accounting_connection_id?: string | null
          can_apply_to_expenses?: boolean
          created_at?: string
          created_by_user_id?: string | null
          display_name?: string | null
          effective_rate?: number | null
          external_id?: string
          id?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          provider?: string
          status?: string | null
          synced_at?: string | null
          tax_type?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_accounting_tax_rates_accounting_connection_id_fkey"
            columns: ["accounting_connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_accounting_tax_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_capabilities: {
        Row: {
          capability_key: string
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_capabilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_clients: {
        Row: {
          company_name: string
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
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
      organization_external_contact_operations: {
        Row: {
          accounting_connection_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          external_contact_id: string | null
          id: string
          local_entity_id: string
          local_entity_type: string
          operation_key: string
          operation_type: string
          organization_id: string
          provider: string
          request_summary: Json
          response_summary: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accounting_connection_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          external_contact_id?: string | null
          id?: string
          local_entity_id: string
          local_entity_type: string
          operation_key: string
          operation_type: string
          organization_id: string
          provider: string
          request_summary?: Json
          response_summary?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accounting_connection_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          external_contact_id?: string | null
          id?: string
          local_entity_id?: string
          local_entity_type?: string
          operation_key?: string
          operation_type?: string
          organization_id?: string
          provider?: string
          request_summary?: Json
          response_summary?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_external_contact_ope_accounting_connection_id_fkey"
            columns: ["accounting_connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_external_contact_operations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_external_contacts: {
        Row: {
          accounting_connection_id: string
          created_at: string
          external_contact_id: string
          external_contact_name: string | null
          external_contact_status: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_synced_at: string | null
          link_status: string
          linked_at: string | null
          linked_by: string | null
          local_entity_id: string
          local_entity_type: string
          match_method: string | null
          organization_id: string
          provider: string
          superseded_by_id: string | null
          tenant_id: string
          unlinked_at: string | null
          updated_at: string
        }
        Insert: {
          accounting_connection_id: string
          created_at?: string
          external_contact_id: string
          external_contact_name?: string | null
          external_contact_status?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_synced_at?: string | null
          link_status: string
          linked_at?: string | null
          linked_by?: string | null
          local_entity_id: string
          local_entity_type: string
          match_method?: string | null
          organization_id: string
          provider: string
          superseded_by_id?: string | null
          tenant_id: string
          unlinked_at?: string | null
          updated_at?: string
        }
        Update: {
          accounting_connection_id?: string
          created_at?: string
          external_contact_id?: string
          external_contact_name?: string | null
          external_contact_status?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_synced_at?: string | null
          link_status?: string
          linked_at?: string | null
          linked_by?: string | null
          local_entity_id?: string
          local_entity_type?: string
          match_method?: string | null
          organization_id?: string
          provider?: string
          superseded_by_id?: string | null
          tenant_id?: string
          unlinked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_external_contacts_accounting_connection_id_fkey"
            columns: ["accounting_connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_external_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_external_contacts_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "organization_external_contacts"
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
      organization_material_import_batches: {
        Row: {
          created_at: string
          extraction_method: string | null
          extraction_summary: Json
          file_name: string
          file_type: string
          id: string
          organization_id: string
          rows_approved: number
          rows_extracted: number
          rows_rejected: number
          status: string
          storage_path: string | null
          supplier_id: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          extraction_method?: string | null
          extraction_summary?: Json
          file_name: string
          file_type: string
          id?: string
          organization_id: string
          rows_approved?: number
          rows_extracted?: number
          rows_rejected?: number
          status?: string
          storage_path?: string | null
          supplier_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          extraction_method?: string | null
          extraction_summary?: Json
          file_name?: string
          file_type?: string
          id?: string
          organization_id?: string
          rows_approved?: number
          rows_extracted?: number
          rows_rejected?: number
          status?: string
          storage_path?: string | null
          supplier_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_material_import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_import_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_material_import_rows: {
        Row: {
          action: string
          classification_reason_summary: string | null
          classified_accounting_mapping_id: string | null
          classified_ai_construction_intelligence: Json
          classified_confidence: number | null
          classified_cost_code: string | null
          classified_cost_type: string | null
          classified_final_classification: Json | null
          classified_needs_review: boolean
          classified_organization_cost_code_id: string | null
          classified_original_classification: Json | null
          classified_review_reason: string | null
          classified_review_status: string | null
          classified_source: string | null
          classified_tradesstack_cost_code: number | null
          classified_tradesstack_cost_code_label: string | null
          classified_work_type: string | null
          confidence: number | null
          created_at: string
          extracted_currency: string | null
          extracted_description: string | null
          extracted_name: string | null
          extracted_unit: string | null
          extracted_unit_cost: number | null
          id: string
          import_batch_id: string
          matched_material_id: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_currency: string | null
          reviewed_description: string | null
          reviewed_name: string | null
          reviewed_supplier_description: string | null
          reviewed_supplier_sku: string | null
          reviewed_unit: string | null
          reviewed_unit_cost: number | null
          row_index: number
          source_payload: Json
          status: string
          supplier_description: string | null
          supplier_sku: string | null
          updated_at: string
        }
        Insert: {
          action?: string
          classification_reason_summary?: string | null
          classified_accounting_mapping_id?: string | null
          classified_ai_construction_intelligence?: Json
          classified_confidence?: number | null
          classified_cost_code?: string | null
          classified_cost_type?: string | null
          classified_final_classification?: Json | null
          classified_needs_review?: boolean
          classified_organization_cost_code_id?: string | null
          classified_original_classification?: Json | null
          classified_review_reason?: string | null
          classified_review_status?: string | null
          classified_source?: string | null
          classified_tradesstack_cost_code?: number | null
          classified_tradesstack_cost_code_label?: string | null
          classified_work_type?: string | null
          confidence?: number | null
          created_at?: string
          extracted_currency?: string | null
          extracted_description?: string | null
          extracted_name?: string | null
          extracted_unit?: string | null
          extracted_unit_cost?: number | null
          id?: string
          import_batch_id: string
          matched_material_id?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_currency?: string | null
          reviewed_description?: string | null
          reviewed_name?: string | null
          reviewed_supplier_description?: string | null
          reviewed_supplier_sku?: string | null
          reviewed_unit?: string | null
          reviewed_unit_cost?: number | null
          row_index?: number
          source_payload?: Json
          status?: string
          supplier_description?: string | null
          supplier_sku?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          classification_reason_summary?: string | null
          classified_accounting_mapping_id?: string | null
          classified_ai_construction_intelligence?: Json
          classified_confidence?: number | null
          classified_cost_code?: string | null
          classified_cost_type?: string | null
          classified_final_classification?: Json | null
          classified_needs_review?: boolean
          classified_organization_cost_code_id?: string | null
          classified_original_classification?: Json | null
          classified_review_reason?: string | null
          classified_review_status?: string | null
          classified_source?: string | null
          classified_tradesstack_cost_code?: number | null
          classified_tradesstack_cost_code_label?: string | null
          classified_work_type?: string | null
          confidence?: number | null
          created_at?: string
          extracted_currency?: string | null
          extracted_description?: string | null
          extracted_name?: string | null
          extracted_unit?: string | null
          extracted_unit_cost?: number | null
          id?: string
          import_batch_id?: string
          matched_material_id?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_currency?: string | null
          reviewed_description?: string | null
          reviewed_name?: string | null
          reviewed_supplier_description?: string | null
          reviewed_supplier_sku?: string | null
          reviewed_unit?: string | null
          reviewed_unit_cost?: number | null
          row_index?: number
          source_payload?: Json
          status?: string
          supplier_description?: string | null
          supplier_sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_material_import__classified_accounting_mappin_fkey"
            columns: ["classified_accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_import__classified_organization_cost_fkey"
            columns: ["classified_organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_import__classified_tradesstack_cost__fkey"
            columns: ["classified_tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_material_import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "organization_material_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_import_rows_matched_material_id_fkey"
            columns: ["matched_material_id"]
            isOneToOne: false
            referencedRelation: "organization_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_material_supplier_prices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          import_batch_id: string | null
          is_current: boolean
          is_preferred: boolean
          material_id: string
          organization_id: string
          source: string
          supplier_description: string | null
          supplier_id: string
          supplier_sku: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          import_batch_id?: string | null
          is_current?: boolean
          is_preferred?: boolean
          material_id: string
          organization_id: string
          source?: string
          supplier_description?: string | null
          supplier_id: string
          supplier_sku?: string | null
          unit: string
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          import_batch_id?: string | null
          is_current?: boolean
          is_preferred?: boolean
          material_id?: string
          organization_id?: string
          source?: string
          supplier_description?: string | null
          supplier_id?: string
          supplier_sku?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_material_supplier_prices_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "organization_material_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_supplier_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "organization_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_supplier_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_material_supplier_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_materials: {
        Row: {
          accounting_mapping_id: string | null
          ai_construction_intelligence: Json
          archived_at: string | null
          archived_by: string | null
          category: string | null
          classification_confidence: number | null
          classification_source: string | null
          confirmed_at: string | null
          confirmed_by_user_id: string | null
          cost_code: string | null
          cost_type: string | null
          created_at: string
          created_by: string | null
          default_unit: string
          description: string | null
          final_classification: Json | null
          financial_routing_confidence: number | null
          financial_routing_source: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          needs_review: boolean
          normalized_name: string
          organization_cost_code_id: string | null
          organization_id: string
          original_classification: Json | null
          review_reason: string | null
          review_status: string | null
          tradesstack_cost_code: number | null
          tradesstack_cost_code_label: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          classification_confidence?: number | null
          classification_source?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          cost_code?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          default_unit?: string
          description?: string | null
          final_classification?: Json | null
          financial_routing_confidence?: number | null
          financial_routing_source?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          needs_review?: boolean
          normalized_name: string
          organization_cost_code_id?: string | null
          organization_id: string
          original_classification?: Json | null
          review_reason?: string | null
          review_status?: string | null
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          classification_confidence?: number | null
          classification_source?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          cost_code?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          default_unit?: string
          description?: string | null
          final_classification?: Json | null
          financial_routing_confidence?: number | null
          financial_routing_source?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          needs_review?: boolean
          normalized_name?: string
          organization_cost_code_id?: string | null
          organization_id?: string
          original_classification?: Json | null
          review_reason?: string | null
          review_status?: string | null
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_materials_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_materials_organization_cost_code_id_fkey"
            columns: ["organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_materials_tradesstack_cost_code_fkey"
            columns: ["tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
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
      organization_memory_confidence_history: {
        Row: {
          calculation_inputs: Json
          calculation_version: number
          confidence_after: number
          confidence_before: number | null
          confidence_delta: number | null
          contributor_snapshot: Json
          created_at: string
          id: string
          is_recalculation: boolean
          lifecycle_history_id: string | null
          manual_actor_user_id: string | null
          memory_id: string
          organization_id: string
          reason_summary: string | null
          reason_type: string
          source_memory_pool_id: string | null
          source_memory_pool_type: string | null
          source_queue_id: string | null
          source_queue_type: string | null
          source_revision_hash: string | null
          source_run_id: string | null
          source_run_type: string | null
          source_semantic_pool_id: string | null
          synthesis_history_id: string | null
          synthesis_queue_row_id: string | null
          synthesis_run_id: string | null
        }
        Insert: {
          calculation_inputs?: Json
          calculation_version?: number
          confidence_after: number
          confidence_before?: number | null
          confidence_delta?: number | null
          contributor_snapshot?: Json
          created_at?: string
          id?: string
          is_recalculation?: boolean
          lifecycle_history_id?: string | null
          manual_actor_user_id?: string | null
          memory_id: string
          organization_id: string
          reason_summary?: string | null
          reason_type: string
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash?: string | null
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_history_id?: string | null
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Update: {
          calculation_inputs?: Json
          calculation_version?: number
          confidence_after?: number
          confidence_before?: number | null
          confidence_delta?: number | null
          contributor_snapshot?: Json
          created_at?: string
          id?: string
          is_recalculation?: boolean
          lifecycle_history_id?: string | null
          manual_actor_user_id?: string | null
          memory_id?: string
          organization_id?: string
          reason_summary?: string | null
          reason_type?: string
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash?: string | null
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_history_id?: string | null
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_confidence_his_source_semantic_pool_id_fkey"
            columns: ["source_semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_hist_synthesis_queue_row_id_fkey"
            columns: ["synthesis_queue_row_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_histor_lifecycle_history_id_fkey"
            columns: ["lifecycle_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_lifecycle_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_histor_synthesis_history_id_fkey"
            columns: ["synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_history_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_confidence_history_synthesis_run_id_fkey"
            columns: ["synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memory_items: {
        Row: {
          base_confidence_score: number | null
          confidence_calculation_version: number
          confidence_reason_summary: string | null
          confidence_score: number
          contradicted_supporting_classification_count: number
          contradiction_basis_hash: string | null
          contradiction_count: number
          contradiction_strength_score: number | null
          created_at: string
          derived_from_ai_interaction_count: number
          derived_from_correction_count: number
          derived_from_event_count: number
          derived_from_total_count: number
          derived_from_validation_count: number
          evidence_summary: Json
          first_derived_at: string | null
          id: string
          is_active: boolean
          is_user_confirmed: boolean
          last_confidence_calculated_at: string | null
          last_confidence_history_id: string | null
          last_contradicted_at: string | null
          last_contradicted_lifecycle_history_id: string | null
          last_contradicted_source_revision_hash: string | null
          last_contradicted_synthesis_history_id: string | null
          last_derived_at: string | null
          last_reinforced_at: string | null
          last_reinforced_lifecycle_history_id: string | null
          last_reinforced_source_revision_hash: string | null
          last_reinforced_synthesis_history_id: string | null
          memory_category: string
          memory_domain_signature: string | null
          memory_key: string
          memory_signature: string | null
          memory_type: string
          memory_value: Json
          organization_id: string
          privacy_classification: string
          reinforced_supporting_classification_count: number
          reinforcement_basis_hash: string | null
          reinforcement_count: number
          retention_expires_at: string | null
          retention_policy_key: string | null
          retired_at: string | null
          retired_by_synthesis_history_id: string | null
          retired_lifecycle_history_id: string | null
          retirement_basis_hash: string | null
          retirement_reason_summary: string | null
          source_memory_pool_id: string | null
          source_memory_pool_type: string | null
          source_revision_hash: string | null
          source_semantic_pool_id: string | null
          summary: string
          superseded_at: string | null
          superseded_by_memory_id: string | null
          superseded_by_synthesis_history_id: string | null
          superseded_lifecycle_history_id: string | null
          supersession_basis_hash: string | null
          supersession_reason_summary: string | null
          title: string
          updated_at: string
          user_confirmed_at: string | null
          user_confirmed_by_user_id: string | null
          visibility_scope: string
        }
        Insert: {
          base_confidence_score?: number | null
          confidence_calculation_version?: number
          confidence_reason_summary?: string | null
          confidence_score?: number
          contradicted_supporting_classification_count?: number
          contradiction_basis_hash?: string | null
          contradiction_count?: number
          contradiction_strength_score?: number | null
          created_at?: string
          derived_from_ai_interaction_count?: number
          derived_from_correction_count?: number
          derived_from_event_count?: number
          derived_from_total_count?: number
          derived_from_validation_count?: number
          evidence_summary?: Json
          first_derived_at?: string | null
          id?: string
          is_active?: boolean
          is_user_confirmed?: boolean
          last_confidence_calculated_at?: string | null
          last_confidence_history_id?: string | null
          last_contradicted_at?: string | null
          last_contradicted_lifecycle_history_id?: string | null
          last_contradicted_source_revision_hash?: string | null
          last_contradicted_synthesis_history_id?: string | null
          last_derived_at?: string | null
          last_reinforced_at?: string | null
          last_reinforced_lifecycle_history_id?: string | null
          last_reinforced_source_revision_hash?: string | null
          last_reinforced_synthesis_history_id?: string | null
          memory_category: string
          memory_domain_signature?: string | null
          memory_key: string
          memory_signature?: string | null
          memory_type: string
          memory_value?: Json
          organization_id: string
          privacy_classification?: string
          reinforced_supporting_classification_count?: number
          reinforcement_basis_hash?: string | null
          reinforcement_count?: number
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          retired_at?: string | null
          retired_by_synthesis_history_id?: string | null
          retired_lifecycle_history_id?: string | null
          retirement_basis_hash?: string | null
          retirement_reason_summary?: string | null
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_revision_hash?: string | null
          source_semantic_pool_id?: string | null
          summary?: string
          superseded_at?: string | null
          superseded_by_memory_id?: string | null
          superseded_by_synthesis_history_id?: string | null
          superseded_lifecycle_history_id?: string | null
          supersession_basis_hash?: string | null
          supersession_reason_summary?: string | null
          title: string
          updated_at?: string
          user_confirmed_at?: string | null
          user_confirmed_by_user_id?: string | null
          visibility_scope?: string
        }
        Update: {
          base_confidence_score?: number | null
          confidence_calculation_version?: number
          confidence_reason_summary?: string | null
          confidence_score?: number
          contradicted_supporting_classification_count?: number
          contradiction_basis_hash?: string | null
          contradiction_count?: number
          contradiction_strength_score?: number | null
          created_at?: string
          derived_from_ai_interaction_count?: number
          derived_from_correction_count?: number
          derived_from_event_count?: number
          derived_from_total_count?: number
          derived_from_validation_count?: number
          evidence_summary?: Json
          first_derived_at?: string | null
          id?: string
          is_active?: boolean
          is_user_confirmed?: boolean
          last_confidence_calculated_at?: string | null
          last_confidence_history_id?: string | null
          last_contradicted_at?: string | null
          last_contradicted_lifecycle_history_id?: string | null
          last_contradicted_source_revision_hash?: string | null
          last_contradicted_synthesis_history_id?: string | null
          last_derived_at?: string | null
          last_reinforced_at?: string | null
          last_reinforced_lifecycle_history_id?: string | null
          last_reinforced_source_revision_hash?: string | null
          last_reinforced_synthesis_history_id?: string | null
          memory_category?: string
          memory_domain_signature?: string | null
          memory_key?: string
          memory_signature?: string | null
          memory_type?: string
          memory_value?: Json
          organization_id?: string
          privacy_classification?: string
          reinforced_supporting_classification_count?: number
          reinforcement_basis_hash?: string | null
          reinforcement_count?: number
          retention_expires_at?: string | null
          retention_policy_key?: string | null
          retired_at?: string | null
          retired_by_synthesis_history_id?: string | null
          retired_lifecycle_history_id?: string | null
          retirement_basis_hash?: string | null
          retirement_reason_summary?: string | null
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_revision_hash?: string | null
          source_semantic_pool_id?: string | null
          summary?: string
          superseded_at?: string | null
          superseded_by_memory_id?: string | null
          superseded_by_synthesis_history_id?: string | null
          superseded_lifecycle_history_id?: string | null
          supersession_basis_hash?: string | null
          supersession_reason_summary?: string | null
          title?: string
          updated_at?: string
          user_confirmed_at?: string | null
          user_confirmed_by_user_id?: string | null
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_items_last_confidence_history_id_fkey"
            columns: ["last_confidence_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_confidence_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_last_contradicted_lifecycle_hist_fkey"
            columns: ["last_contradicted_lifecycle_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_lifecycle_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_last_contradicted_synthesis_hist_fkey"
            columns: ["last_contradicted_synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_last_reinforced_lifecycle_histor_fkey"
            columns: ["last_reinforced_lifecycle_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_lifecycle_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_last_reinforced_synthesis_histor_fkey"
            columns: ["last_reinforced_synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_retired_by_synthesis_history_id_fkey"
            columns: ["retired_by_synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_retired_lifecycle_history_id_fkey"
            columns: ["retired_lifecycle_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_lifecycle_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_source_semantic_pool_id_fkey"
            columns: ["source_semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_superseded_by_memory_id_fkey"
            columns: ["superseded_by_memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_superseded_by_synthesis_history__fkey"
            columns: ["superseded_by_synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_items_superseded_lifecycle_history_id_fkey"
            columns: ["superseded_lifecycle_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_lifecycle_history"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memory_lifecycle_history: {
        Row: {
          after_memory_snapshot: Json | null
          before_memory_snapshot: Json | null
          created_at: string
          event_origin_type: string
          id: string
          lifecycle_event_type: string
          lifecycle_metadata: Json
          memory_id: string
          organization_id: string
          reason_summary: string | null
          schema_version: number
          source_memory_pool_id: string | null
          source_memory_pool_type: string | null
          source_queue_id: string | null
          source_queue_type: string | null
          source_revision_hash: string | null
          source_run_id: string | null
          source_run_type: string | null
          source_semantic_pool_id: string | null
          synthesis_history_id: string | null
          synthesis_queue_row_id: string | null
          synthesis_run_id: string | null
        }
        Insert: {
          after_memory_snapshot?: Json | null
          before_memory_snapshot?: Json | null
          created_at?: string
          event_origin_type?: string
          id?: string
          lifecycle_event_type: string
          lifecycle_metadata?: Json
          memory_id: string
          organization_id: string
          reason_summary?: string | null
          schema_version?: number
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash?: string | null
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_history_id?: string | null
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Update: {
          after_memory_snapshot?: Json | null
          before_memory_snapshot?: Json | null
          created_at?: string
          event_origin_type?: string
          id?: string
          lifecycle_event_type?: string
          lifecycle_metadata?: Json
          memory_id?: string
          organization_id?: string
          reason_summary?: string | null
          schema_version?: number
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash?: string | null
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_history_id?: string | null
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_lifecycle_hist_source_semantic_pool_id_fkey"
            columns: ["source_semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_lifecycle_histo_synthesis_queue_row_id_fkey"
            columns: ["synthesis_queue_row_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_lifecycle_history_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_lifecycle_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_lifecycle_history_synthesis_history_id_fkey"
            columns: ["synthesis_history_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_synthesis_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_lifecycle_history_synthesis_run_id_fkey"
            columns: ["synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memory_links: {
        Row: {
          confidence_delta: number | null
          created_at: string
          created_by_user_id: string | null
          id: string
          link_type: string
          note: string | null
          organization_id: string
          organization_memory_item_id: string
          source_ai_interaction_id: string | null
          source_correction_event_id: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          source_event_id: string | null
          source_validation_case_id: string | null
          weight: number
        }
        Insert: {
          confidence_delta?: number | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          link_type?: string
          note?: string | null
          organization_id: string
          organization_memory_item_id: string
          source_ai_interaction_id?: string | null
          source_correction_event_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          source_event_id?: string | null
          source_validation_case_id?: string | null
          weight?: number
        }
        Update: {
          confidence_delta?: number | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          link_type?: string
          note?: string | null
          organization_id?: string
          organization_memory_item_id?: string
          source_ai_interaction_id?: string | null
          source_correction_event_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          source_event_id?: string | null
          source_validation_case_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_links_memory_item_fkey"
            columns: ["organization_memory_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memory_links_source_ai_interaction_id_fkey"
            columns: ["source_ai_interaction_id"]
            isOneToOne: false
            referencedRelation: "ai_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_links_source_correction_event_id_fkey"
            columns: ["source_correction_event_id"]
            isOneToOne: false
            referencedRelation: "correction_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_links_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_links_source_validation_case_id_fkey"
            columns: ["source_validation_case_id"]
            isOneToOne: false
            referencedRelation: "validation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memory_retirement_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_no_action_reason: string | null
          max_attempts: number
          memory_id: string
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_no_action_reason?: string | null
          max_attempts?: number
          memory_id: string
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_no_action_reason?: string | null
          max_attempts?: number
          memory_id?: string
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_retirement_queue_memory_fkey"
            columns: ["memory_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memory_retirement_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memory_synthesis_history: {
        Row: {
          after_memory_snapshot: Json | null
          before_memory_snapshot: Json | null
          created_at: string
          decision_schema_version: number
          duplicate_deactivation_snapshot: Json
          evidence_snapshot: Json
          id: string
          memory_id: string | null
          model: string | null
          organization_id: string
          persistence_outcome: string
          prompt_version: string
          provider: string | null
          reasoning_summary: string | null
          schema_version: number
          source_memory_pool_id: string | null
          source_memory_pool_type: string | null
          source_queue_id: string | null
          source_queue_type: string | null
          source_revision_hash: string
          source_run_id: string | null
          source_run_type: string | null
          source_semantic_pool_id: string | null
          synthesis_decision: string
          synthesis_queue_row_id: string | null
          synthesis_run_id: string | null
        }
        Insert: {
          after_memory_snapshot?: Json | null
          before_memory_snapshot?: Json | null
          created_at?: string
          decision_schema_version?: number
          duplicate_deactivation_snapshot?: Json
          evidence_snapshot?: Json
          id?: string
          memory_id?: string | null
          model?: string | null
          organization_id: string
          persistence_outcome: string
          prompt_version: string
          provider?: string | null
          reasoning_summary?: string | null
          schema_version?: number
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash: string
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_decision: string
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Update: {
          after_memory_snapshot?: Json | null
          before_memory_snapshot?: Json | null
          created_at?: string
          decision_schema_version?: number
          duplicate_deactivation_snapshot?: Json
          evidence_snapshot?: Json
          id?: string
          memory_id?: string | null
          model?: string | null
          organization_id?: string
          persistence_outcome?: string
          prompt_version?: string
          provider?: string | null
          reasoning_summary?: string | null
          schema_version?: number
          source_memory_pool_id?: string | null
          source_memory_pool_type?: string | null
          source_queue_id?: string | null
          source_queue_type?: string | null
          source_revision_hash?: string
          source_run_id?: string | null
          source_run_type?: string | null
          source_semantic_pool_id?: string | null
          synthesis_decision?: string
          synthesis_queue_row_id?: string | null
          synthesis_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memory_synthesis_hist_source_semantic_pool_id_fkey"
            columns: ["source_semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_synthesis_histo_synthesis_queue_row_id_fkey"
            columns: ["synthesis_queue_row_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_synthesis_history_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "organization_memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_synthesis_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memory_synthesis_history_synthesis_run_id_fkey"
            columns: ["synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_synthesis_runs"
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
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_name: string
          company_registration_number: string | null
          country_code: string | null
          created_at: string
          created_by: string
          default_currency_code: string | null
          default_payment_terms: string
          default_tax_rate_id: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          organization_id: string
          payment_terms_day: number | null
          payment_terms_type: string | null
          phone: string | null
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_first_name: string | null
          primary_contact_last_name: string | null
          primary_contact_phone: string | null
          region: string | null
          source: string
          tax_number: string | null
          tax_number_type: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name?: string
          company_registration_number?: string | null
          country_code?: string | null
          created_at?: string
          created_by: string
          default_currency_code?: string | null
          default_payment_terms?: string
          default_tax_rate_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          organization_id: string
          payment_terms_day?: number | null
          payment_terms_type?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_first_name?: string | null
          primary_contact_last_name?: string | null
          primary_contact_phone?: string | null
          region?: string | null
          source?: string
          tax_number?: string | null
          tax_number_type?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name?: string
          company_registration_number?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          default_currency_code?: string | null
          default_payment_terms?: string
          default_tax_rate_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          organization_id?: string
          payment_terms_day?: number | null
          payment_terms_type?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_first_name?: string | null
          primary_contact_last_name?: string | null
          primary_contact_phone?: string | null
          region?: string | null
          source?: string
          tax_number?: string | null
          tax_number_type?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_suppliers_default_tax_rate_fkey"
            columns: ["default_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_tradesstack_accounting_mappings: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          is_active: boolean
          organization_cost_code_id: string
          organization_id: string
          project_id: string | null
          provider: string
          tradesstack_cost_code: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean
          organization_cost_code_id: string
          organization_id: string
          project_id?: string | null
          provider: string
          tradesstack_cost_code: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean
          organization_cost_code_id?: string
          organization_id?: string
          project_id?: string | null
          provider?: string
          tradesstack_cost_code?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_tradesstack_account_organization_cost_code_id_fkey"
            columns: ["organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_tradesstack_accounting__tradesstack_cost_code_fkey"
            columns: ["tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_tradesstack_accounting_mappin_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_tradesstack_accounting_mappings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_xero_connection_secrets: {
        Row: {
          connection_id: string
          created_at: string
          encrypted_token_set: string
          encryption_version: number
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          encrypted_token_set: string
          encryption_version?: number
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          encrypted_token_set?: string
          encryption_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_xero_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_xero_connections: {
        Row: {
          available_tenants_json: Json
          connected_by_user_id: string | null
          created_at: string
          id: string
          last_accounts_sync_at: string | null
          last_contacts_sync_at: string | null
          last_error: string | null
          last_health_checked_at: string | null
          last_health_status: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          last_tax_rates_sync_at: string | null
          organization_id: string
          refresh_token_expires_at: string | null
          scope: string[]
          status: string
          tenant_connection_id: string | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_type: string | null
          token_expires_at: string | null
          updated_at: string
          xero_user_id: string | null
        }
        Insert: {
          available_tenants_json?: Json
          connected_by_user_id?: string | null
          created_at?: string
          id?: string
          last_accounts_sync_at?: string | null
          last_contacts_sync_at?: string | null
          last_error?: string | null
          last_health_checked_at?: string | null
          last_health_status?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          last_tax_rates_sync_at?: string | null
          organization_id: string
          refresh_token_expires_at?: string | null
          scope?: string[]
          status?: string
          tenant_connection_id?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          tenant_type?: string | null
          token_expires_at?: string | null
          updated_at?: string
          xero_user_id?: string | null
        }
        Update: {
          available_tenants_json?: Json
          connected_by_user_id?: string | null
          created_at?: string
          id?: string
          last_accounts_sync_at?: string | null
          last_contacts_sync_at?: string | null
          last_error?: string | null
          last_health_checked_at?: string | null
          last_health_status?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          last_tax_rates_sync_at?: string | null
          organization_id?: string
          refresh_token_expires_at?: string | null
          scope?: string[]
          status?: string
          tenant_connection_id?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          tenant_type?: string | null
          token_expires_at?: string | null
          updated_at?: string
          xero_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_xero_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_xero_contacts: {
        Row: {
          account_number: string | null
          addresses_json: Json
          connection_id: string
          contact_id: string
          contact_status: string | null
          created_at: string
          email: string | null
          external_updated_at: string | null
          first_name: string | null
          id: string
          imported_at: string
          is_customer: boolean | null
          is_supplier: boolean | null
          last_name: string | null
          mobile: string | null
          name: string
          organization_id: string
          phone: string | null
          phones_json: Json
          raw_metadata: Json
          tax_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          addresses_json?: Json
          connection_id: string
          contact_id: string
          contact_status?: string | null
          created_at?: string
          email?: string | null
          external_updated_at?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          is_customer?: boolean | null
          is_supplier?: boolean | null
          last_name?: string | null
          mobile?: string | null
          name: string
          organization_id: string
          phone?: string | null
          phones_json?: Json
          raw_metadata?: Json
          tax_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          addresses_json?: Json
          connection_id?: string
          contact_id?: string
          contact_status?: string | null
          created_at?: string
          email?: string | null
          external_updated_at?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          is_customer?: boolean | null
          is_supplier?: boolean | null
          last_name?: string | null
          mobile?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          phones_json?: Json
          raw_metadata?: Json
          tax_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_xero_contacts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "organization_xero_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_xero_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_xero_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          redirect_path: string
          state_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          redirect_path?: string
          state_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          redirect_path?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_xero_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          bank_account_details: string | null
          construction_profile: string | null
          created_at: string
          created_by: string
          id: string
          logo_path: string | null
          name: string
          tax_registration_status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          bank_account_details?: string | null
          construction_profile?: string | null
          created_at?: string
          created_by: string
          id?: string
          logo_path?: string | null
          name: string
          tax_registration_status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          bank_account_details?: string | null
          construction_profile?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logo_path?: string | null
          name?: string
          tax_registration_status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_actual_cost_events: {
        Row: {
          accounting_mapping_id: string | null
          ai_construction_intelligence: Json
          amount: number
          correction_root_event_id: string | null
          cost_item_id: string | null
          cost_type: string | null
          created_at: string
          created_by_user_id: string | null
          event_date: string
          event_status: string
          event_type: string
          id: string
          internal_cost_code: string | null
          organization_cost_code_id: string | null
          organization_id: string
          posting_source: string
          project_id: string
          purchase_order_id: string | null
          purchase_order_line_item_id: string | null
          quantity: number | null
          reversal_note: string | null
          reversal_reason: string | null
          reverses_event_id: string | null
          source_cost_item_id: string | null
          source_invoice_allocation_id: string | null
          source_invoice_line_id: string | null
          source_reference: string
          source_type: string
          supplier_id: string | null
          supplier_invoice_id: string | null
          supplier_invoice_line_allocation_id: string | null
          supplier_invoice_line_id: string | null
          tax_amount: number
          total_amount: number
          tradesstack_cost_code: number | null
          tradesstack_cost_code_label: string | null
          work_type: string | null
        }
        Insert: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
          amount?: number
          correction_root_event_id?: string | null
          cost_item_id?: string | null
          cost_type?: string | null
          created_at?: string
          created_by_user_id?: string | null
          event_date: string
          event_status?: string
          event_type?: string
          id?: string
          internal_cost_code?: string | null
          organization_cost_code_id?: string | null
          organization_id: string
          posting_source?: string
          project_id: string
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          quantity?: number | null
          reversal_note?: string | null
          reversal_reason?: string | null
          reverses_event_id?: string | null
          source_cost_item_id?: string | null
          source_invoice_allocation_id?: string | null
          source_invoice_line_id?: string | null
          source_reference?: string
          source_type?: string
          supplier_id?: string | null
          supplier_invoice_id?: string | null
          supplier_invoice_line_allocation_id?: string | null
          supplier_invoice_line_id?: string | null
          tax_amount?: number
          total_amount?: number
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          work_type?: string | null
        }
        Update: {
          accounting_mapping_id?: string | null
          ai_construction_intelligence?: Json
          amount?: number
          correction_root_event_id?: string | null
          cost_item_id?: string | null
          cost_type?: string | null
          created_at?: string
          created_by_user_id?: string | null
          event_date?: string
          event_status?: string
          event_type?: string
          id?: string
          internal_cost_code?: string | null
          organization_cost_code_id?: string | null
          organization_id?: string
          posting_source?: string
          project_id?: string
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          quantity?: number | null
          reversal_note?: string | null
          reversal_reason?: string | null
          reverses_event_id?: string | null
          source_cost_item_id?: string | null
          source_invoice_allocation_id?: string | null
          source_invoice_line_id?: string | null
          source_reference?: string
          source_type?: string
          supplier_id?: string | null
          supplier_invoice_id?: string | null
          supplier_invoice_line_allocation_id?: string | null
          supplier_invoice_line_id?: string | null
          tax_amount?: number
          total_amount?: number
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_actual_cost_events_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_correction_root_event_id_fkey"
            columns: ["correction_root_event_id"]
            isOneToOne: false
            referencedRelation: "project_actual_cost_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_organization_cost_code_id_fkey"
            columns: ["organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_reverses_event_id_fkey"
            columns: ["reverses_event_id"]
            isOneToOne: false
            referencedRelation: "project_actual_cost_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_source_cost_item_id_fkey"
            columns: ["source_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_source_invoice_allocation_id_fkey"
            columns: ["source_invoice_allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_source_invoice_line_id_fkey"
            columns: ["source_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_supplier_invoice_line_allocatio_fkey"
            columns: ["supplier_invoice_line_allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_supplier_invoice_line_id_fkey"
            columns: ["supplier_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actual_cost_events_tradesstack_cost_code_fkey"
            columns: ["tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
        ]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          originating_opportunity_id: string | null
          payment_terms: string
          project_id: string | null
          project_name: string
          quote_date: string | null
          quote_number: string
          quote_title: string
          retention_percent_default: number
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
          originating_opportunity_id?: string | null
          payment_terms?: string
          project_id?: string | null
          project_name?: string
          quote_date?: string | null
          quote_number: string
          quote_title: string
          retention_percent_default?: number
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
          originating_opportunity_id?: string | null
          payment_terms?: string
          project_id?: string | null
          project_name?: string
          quote_date?: string | null
          quote_number?: string
          quote_title?: string
          retention_percent_default?: number
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
            foreignKeyName: "project_quotes_originating_opportunity_id_fkey"
            columns: ["originating_opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
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
      project_retention_claim_counters: {
        Row: {
          last_number: number
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_retention_claim_counters_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: true
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      project_retention_release_schedules: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activation_eligibility_state_hash: string | null
          activation_evidence: Json | null
          activation_position_state_hash: string | null
          actual_trigger_date: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cap_amount: number | null
          completed_at: string | null
          completed_by: string | null
          completion_reason: string | null
          confirmation_required: boolean
          created_at: string
          created_by: string
          delay_days: number
          eligibility_date: string | null
          entitlement_method: string
          fixed_amount: number | null
          id: string
          name: string
          organization_id: string
          percentage_bps: number | null
          project_id: string
          reminder_rules: Json
          replaces_schedule_id: string | null
          revision: number
          schedule_sequence: number
          scheduled_trigger_date: string | null
          scope_policy: string
          status: string
          trigger_confirmation_evidence: Json | null
          trigger_confirmation_reason: string | null
          trigger_confirmed_at: string | null
          trigger_confirmed_by: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activation_eligibility_state_hash?: string | null
          activation_evidence?: Json | null
          activation_position_state_hash?: string | null
          actual_trigger_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cap_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          completion_reason?: string | null
          confirmation_required?: boolean
          created_at?: string
          created_by: string
          delay_days?: number
          eligibility_date?: string | null
          entitlement_method: string
          fixed_amount?: number | null
          id?: string
          name: string
          organization_id: string
          percentage_bps?: number | null
          project_id: string
          reminder_rules?: Json
          replaces_schedule_id?: string | null
          revision?: number
          schedule_sequence: number
          scheduled_trigger_date?: string | null
          scope_policy?: string
          status?: string
          trigger_confirmation_evidence?: Json | null
          trigger_confirmation_reason?: string | null
          trigger_confirmed_at?: string | null
          trigger_confirmed_by?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activation_eligibility_state_hash?: string | null
          activation_evidence?: Json | null
          activation_position_state_hash?: string | null
          actual_trigger_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cap_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          completion_reason?: string | null
          confirmation_required?: boolean
          created_at?: string
          created_by?: string
          delay_days?: number
          eligibility_date?: string | null
          entitlement_method?: string
          fixed_amount?: number | null
          id?: string
          name?: string
          organization_id?: string
          percentage_bps?: number | null
          project_id?: string
          reminder_rules?: Json
          replaces_schedule_id?: string | null
          revision?: number
          schedule_sequence?: number
          scheduled_trigger_date?: string | null
          scope_policy?: string
          status?: string
          trigger_confirmation_evidence?: Json | null
          trigger_confirmation_reason?: string | null
          trigger_confirmed_at?: string | null
          trigger_confirmed_by?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_retention_release_schedules_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "project_retention_release_schedules_replacement_fkey"
            columns: ["organization_id", "project_id", "replaces_schedule_id"]
            isOneToOne: false
            referencedRelation: "project_retention_release_schedules"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      project_retention_schedule_origins: {
        Row: {
          activated_at: string | null
          activated_entitlement_amount: number | null
          activation_claim_created_at_snapshot: string | null
          activation_claim_date_snapshot: string | null
          activation_claim_number_snapshot: string | null
          activation_claim_status_snapshot: string | null
          activation_claim_updated_at_snapshot: string | null
          activation_evidence: Json | null
          activation_origin_state_hash: string | null
          activation_position_state_hash: string | null
          activation_retention_owned_snapshot: number | null
          cap_amount: number | null
          created_at: string
          created_by: string
          fixed_amount_override: number | null
          id: string
          organization_id: string
          origin_sequence: number
          originating_payment_claim_id: string
          percentage_bps_override: number | null
          project_id: string
          schedule_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_entitlement_amount?: number | null
          activation_claim_created_at_snapshot?: string | null
          activation_claim_date_snapshot?: string | null
          activation_claim_number_snapshot?: string | null
          activation_claim_status_snapshot?: string | null
          activation_claim_updated_at_snapshot?: string | null
          activation_evidence?: Json | null
          activation_origin_state_hash?: string | null
          activation_position_state_hash?: string | null
          activation_retention_owned_snapshot?: number | null
          cap_amount?: number | null
          created_at?: string
          created_by: string
          fixed_amount_override?: number | null
          id?: string
          organization_id: string
          origin_sequence: number
          originating_payment_claim_id: string
          percentage_bps_override?: number | null
          project_id: string
          schedule_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_entitlement_amount?: number | null
          activation_claim_created_at_snapshot?: string | null
          activation_claim_date_snapshot?: string | null
          activation_claim_number_snapshot?: string | null
          activation_claim_status_snapshot?: string | null
          activation_claim_updated_at_snapshot?: string | null
          activation_evidence?: Json | null
          activation_origin_state_hash?: string | null
          activation_position_state_hash?: string | null
          activation_retention_owned_snapshot?: number | null
          cap_amount?: number | null
          created_at?: string
          created_by?: string
          fixed_amount_override?: number | null
          id?: string
          organization_id?: string
          origin_sequence?: number
          originating_payment_claim_id?: string
          percentage_bps_override?: number | null
          project_id?: string
          schedule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_retention_schedule_origins_origin_fkey"
            columns: [
              "organization_id",
              "project_id",
              "originating_payment_claim_id",
            ]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "project_retention_schedule_origins_parent_fkey"
            columns: ["organization_id", "project_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "project_retention_release_schedules"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      project_retention_workflow_states: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          created_at: string
          mode: string
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string
          mode?: string
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string
          mode?: string
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_retention_workflow_states_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: true
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      project_time_sheet_entries: {
        Row: {
          auto_clocked_out: boolean
          auto_clocked_out_at: string | null
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
          id: string
          notes: string
          organization_id: string
          project_id: string
          purchase_order_id: string | null
          purchase_order_number: string
          purchase_order_title: string
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
          id?: string
          notes?: string
          organization_id: string
          project_id: string
          purchase_order_id?: string | null
          purchase_order_number?: string
          purchase_order_title?: string
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
          id?: string
          notes?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string | null
          purchase_order_number?: string
          purchase_order_title?: string
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
          quantity: number | null
          rate: number | null
          section: string
          sort_order: number
          source_project_quote_id: string | null
          source_project_quote_line_item_id: string | null
          source_project_quote_number: string | null
          source_purchase_order_id: string | null
          source_purchase_order_line_item_id: string | null
          source_purchase_order_number: string | null
          total: number | null
          unit: string | null
          updated_at: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          organization_id: string
          project_id: string
          quantity?: number | null
          rate?: number | null
          section?: string
          sort_order?: number
          source_project_quote_id?: string | null
          source_project_quote_line_item_id?: string | null
          source_project_quote_number?: string | null
          source_purchase_order_id?: string | null
          source_purchase_order_line_item_id?: string | null
          source_purchase_order_number?: string | null
          total?: number | null
          unit?: string | null
          updated_at?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          project_id?: string
          quantity?: number | null
          rate?: number | null
          section?: string
          sort_order?: number
          source_project_quote_id?: string | null
          source_project_quote_line_item_id?: string | null
          source_project_quote_number?: string | null
          source_purchase_order_id?: string | null
          source_purchase_order_line_item_id?: string | null
          source_purchase_order_number?: string | null
          total?: number | null
          unit?: string | null
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
      purchase_order_activity_log: {
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
          project_id: string
          purchase_order_id: string
          summary: string
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
          project_id: string
          purchase_order_id: string
          summary: string
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
          project_id?: string
          purchase_order_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_activity_log_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_commitment_release_lines: {
        Row: {
          commitment_release_id: string
          created_at: string
          id: string
          organization_id: string
          purchase_order_id: string
          purchase_order_line_item_id: string
          released_amount: number
        }
        Insert: {
          commitment_release_id: string
          created_at?: string
          id?: string
          organization_id: string
          purchase_order_id: string
          purchase_order_line_item_id: string
          released_amount: number
        }
        Update: {
          commitment_release_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          purchase_order_id?: string
          purchase_order_line_item_id?: string
          released_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_commitment_rele_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_commitment_release_li_commitment_release_id_fkey"
            columns: ["commitment_release_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_commitment_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_commitment_release_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_commitment_release_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_commitment_releases: {
        Row: {
          created_at: string
          id: string
          note: string
          organization_id: string
          purchase_order_id: string
          reason: string
          released_amount: number
          released_at: string
          released_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          organization_id: string
          purchase_order_id: string
          reason: string
          released_amount: number
          released_at?: string
          released_by: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          organization_id?: string
          purchase_order_id?: string
          reason?: string
          released_amount?: number
          released_at?: string
          released_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_commitment_releases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_commitment_releases_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
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
      retention_capability_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          domain_key: string
          event_type: string
          id: string
          metadata: Json
          new_state: string | null
          occurred_at: string
          organization_id: string
          previous_state: string | null
          project_id: string | null
          reason: string
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          domain_key?: string
          event_type: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          organization_id: string
          previous_state?: string | null
          project_id?: string | null
          reason: string
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          domain_key?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          organization_id?: string
          previous_state?: string | null
          project_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_capability_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_capability_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_claim_allocations: {
        Row: {
          allocation_amount: number
          allocation_sequence: number
          created_at: string
          created_by: string
          draft_origin_retention_owned: number
          draft_origin_state_hash: string
          draft_origin_updated_at: string
          eligibility_schedule_ids_snapshot: string[] | null
          eligibility_state_hash_snapshot: string | null
          existing_submitted_allocation_before: number | null
          gross_claim_amount_snapshot: number | null
          gst_amount_snapshot: number | null
          id: string
          net_claim_excl_gst_snapshot: number | null
          organization_id: string
          origin_claim_created_at_snapshot: string | null
          origin_claim_date_snapshot: string | null
          origin_claim_number_snapshot: string | null
          origin_claim_status_snapshot: string | null
          origin_claim_updated_at_snapshot: string | null
          origin_state_hash_snapshot: string | null
          originating_payment_claim_id: string
          project_id: string
          project_state_hash_snapshot: string | null
          remaining_after_allocation: number | null
          retention_balance_snapshot: number | null
          retention_claim_id: string
          retention_held_to_date_snapshot: number | null
          retention_method_snapshot: string | null
          retention_rate_snapshot: number | null
          retention_released_snapshot: number | null
          retention_released_to_date_snapshot: number | null
          retention_scale_bands_snapshot: Json | null
          retention_withheld_snapshot: number | null
          submitted_at: string | null
          submitted_by: string | null
          total_payable_snapshot: number | null
          updated_at: string
        }
        Insert: {
          allocation_amount: number
          allocation_sequence: number
          created_at?: string
          created_by: string
          draft_origin_retention_owned: number
          draft_origin_state_hash: string
          draft_origin_updated_at: string
          eligibility_schedule_ids_snapshot?: string[] | null
          eligibility_state_hash_snapshot?: string | null
          existing_submitted_allocation_before?: number | null
          gross_claim_amount_snapshot?: number | null
          gst_amount_snapshot?: number | null
          id?: string
          net_claim_excl_gst_snapshot?: number | null
          organization_id: string
          origin_claim_created_at_snapshot?: string | null
          origin_claim_date_snapshot?: string | null
          origin_claim_number_snapshot?: string | null
          origin_claim_status_snapshot?: string | null
          origin_claim_updated_at_snapshot?: string | null
          origin_state_hash_snapshot?: string | null
          originating_payment_claim_id: string
          project_id: string
          project_state_hash_snapshot?: string | null
          remaining_after_allocation?: number | null
          retention_balance_snapshot?: number | null
          retention_claim_id: string
          retention_held_to_date_snapshot?: number | null
          retention_method_snapshot?: string | null
          retention_rate_snapshot?: number | null
          retention_released_snapshot?: number | null
          retention_released_to_date_snapshot?: number | null
          retention_scale_bands_snapshot?: Json | null
          retention_withheld_snapshot?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_payable_snapshot?: number | null
          updated_at?: string
        }
        Update: {
          allocation_amount?: number
          allocation_sequence?: number
          created_at?: string
          created_by?: string
          draft_origin_retention_owned?: number
          draft_origin_state_hash?: string
          draft_origin_updated_at?: string
          eligibility_schedule_ids_snapshot?: string[] | null
          eligibility_state_hash_snapshot?: string | null
          existing_submitted_allocation_before?: number | null
          gross_claim_amount_snapshot?: number | null
          gst_amount_snapshot?: number | null
          id?: string
          net_claim_excl_gst_snapshot?: number | null
          organization_id?: string
          origin_claim_created_at_snapshot?: string | null
          origin_claim_date_snapshot?: string | null
          origin_claim_number_snapshot?: string | null
          origin_claim_status_snapshot?: string | null
          origin_claim_updated_at_snapshot?: string | null
          origin_state_hash_snapshot?: string | null
          originating_payment_claim_id?: string
          project_id?: string
          project_state_hash_snapshot?: string | null
          remaining_after_allocation?: number | null
          retention_balance_snapshot?: number | null
          retention_claim_id?: string
          retention_held_to_date_snapshot?: number | null
          retention_method_snapshot?: string | null
          retention_rate_snapshot?: number | null
          retention_released_snapshot?: number | null
          retention_released_to_date_snapshot?: number | null
          retention_scale_bands_snapshot?: Json | null
          retention_withheld_snapshot?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_payable_snapshot?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_claim_allocations_origin_fkey"
            columns: [
              "organization_id",
              "project_id",
              "originating_payment_claim_id",
            ]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_claim_allocations_parent_fkey"
            columns: ["organization_id", "project_id", "retention_claim_id"]
            isOneToOne: false
            referencedRelation: "retention_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_claim_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          occurred_at: string
          organization_id: string
          previous_status: string | null
          project_id: string
          reason: string
          retention_claim_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id: string
          previous_status?: string | null
          project_id: string
          reason: string
          retention_claim_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id?: string
          previous_status?: string | null
          project_id?: string
          reason?: string
          retention_claim_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_claim_events_claim_identity_fkey"
            columns: ["organization_id", "project_id", "retention_claim_id"]
            isOneToOne: false
            referencedRelation: "retention_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_claim_events_org_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "retention_claim_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_claim_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_claim_events_retention_claim_id_fkey"
            columns: ["retention_claim_id"]
            isOneToOne: false
            referencedRelation: "retention_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_claims: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          claim_number: string
          created_at: string
          created_by: string
          draft_revision: number
          due_date: string | null
          id: string
          issue_date: string | null
          last_eligibility_state_hash: string | null
          last_position_state_hash: string | null
          organization_id: string
          project_id: string
          reference: string | null
          status: string
          submission_eligibility_state_hash: string | null
          submission_state_hash: string | null
          submitted_at: string | null
          submitted_by: string | null
          subtotal_excl_tax: number
          title: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          claim_number: string
          created_at?: string
          created_by: string
          draft_revision?: number
          due_date?: string | null
          id?: string
          issue_date?: string | null
          last_eligibility_state_hash?: string | null
          last_position_state_hash?: string | null
          organization_id: string
          project_id: string
          reference?: string | null
          status?: string
          submission_eligibility_state_hash?: string | null
          submission_state_hash?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          subtotal_excl_tax?: number
          title: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          claim_number?: string
          created_at?: string
          created_by?: string
          draft_revision?: number
          due_date?: string | null
          id?: string
          issue_date?: string | null
          last_eligibility_state_hash?: string | null
          last_position_state_hash?: string | null
          organization_id?: string
          project_id?: string
          reference?: string | null
          status?: string
          submission_eligibility_state_hash?: string | null
          submission_state_hash?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          subtotal_excl_tax?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_claims_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      retention_legacy_reconciliation_cases: {
        Row: {
          allocation_count: number
          approved_at: string | null
          approved_by: string | null
          case_sequence: number
          created_at: string
          created_by: string
          evidence: Json | null
          evidence_reference: string | null
          id: string
          organization_id: string
          position_state_hash: string
          project_id: string
          reconciliation_note: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          revision: number
          source_count: number
          source_fingerprint: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          superseded_at: string | null
          superseded_by_case_id: string | null
          supersedes_case_id: string | null
          total_allocated: number
          total_legacy_released: number
          updated_at: string
        }
        Insert: {
          allocation_count?: number
          approved_at?: string | null
          approved_by?: string | null
          case_sequence: number
          created_at?: string
          created_by: string
          evidence?: Json | null
          evidence_reference?: string | null
          id?: string
          organization_id: string
          position_state_hash: string
          project_id: string
          reconciliation_note?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          revision?: number
          source_count: number
          source_fingerprint: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_at?: string | null
          superseded_by_case_id?: string | null
          supersedes_case_id?: string | null
          total_allocated?: number
          total_legacy_released: number
          updated_at?: string
        }
        Update: {
          allocation_count?: number
          approved_at?: string | null
          approved_by?: string | null
          case_sequence?: number
          created_at?: string
          created_by?: string
          evidence?: Json | null
          evidence_reference?: string | null
          id?: string
          organization_id?: string
          position_state_hash?: string
          project_id?: string
          reconciliation_note?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          revision?: number
          source_count?: number
          source_fingerprint?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_at?: string | null
          superseded_by_case_id?: string | null
          supersedes_case_id?: string | null
          total_allocated?: number
          total_legacy_released?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_legacy_cases_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "retention_legacy_cases_superseded_by_fkey"
            columns: ["organization_id", "project_id", "superseded_by_case_id"]
            isOneToOne: false
            referencedRelation: "retention_legacy_reconciliation_cases"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_legacy_cases_supersedes_fkey"
            columns: ["organization_id", "project_id", "supersedes_case_id"]
            isOneToOne: false
            referencedRelation: "retention_legacy_reconciliation_cases"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_legacy_reconciliation_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          event_type: string
          financial_snapshot: Json
          id: string
          metadata: Json
          new_status: string | null
          occurred_at: string
          organization_id: string
          position_state_hash: string | null
          previous_status: string | null
          project_id: string
          reason: string
          reconciliation_case_id: string | null
          source_fingerprint: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type: string
          financial_snapshot?: Json
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id: string
          position_state_hash?: string | null
          previous_status?: string | null
          project_id: string
          reason: string
          reconciliation_case_id?: string | null
          source_fingerprint?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type?: string
          financial_snapshot?: Json
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id?: string
          position_state_hash?: string | null
          previous_status?: string | null
          project_id?: string
          reason?: string
          reconciliation_case_id?: string | null
          source_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_legacy_events_case_fkey"
            columns: ["organization_id", "project_id", "reconciliation_case_id"]
            isOneToOne: false
            referencedRelation: "retention_legacy_reconciliation_cases"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_legacy_release_allocations: {
        Row: {
          allocation_amount: number
          allocation_sequence: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          legacy_release_source_id: string
          organization_id: string
          origin_claim_created_at_snapshot: string | null
          origin_claim_date_snapshot: string | null
          origin_claim_number_snapshot: string | null
          origin_claim_status_snapshot: string | null
          origin_claim_updated_at_snapshot: string | null
          origin_retention_owned_snapshot: number | null
          origin_state_hash_snapshot: string | null
          originating_payment_claim_id: string
          position_state_hash_snapshot: string | null
          project_id: string
          reconciliation_case_id: string
          updated_at: string
        }
        Insert: {
          allocation_amount: number
          allocation_sequence: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          legacy_release_source_id: string
          organization_id: string
          origin_claim_created_at_snapshot?: string | null
          origin_claim_date_snapshot?: string | null
          origin_claim_number_snapshot?: string | null
          origin_claim_status_snapshot?: string | null
          origin_claim_updated_at_snapshot?: string | null
          origin_retention_owned_snapshot?: number | null
          origin_state_hash_snapshot?: string | null
          originating_payment_claim_id: string
          position_state_hash_snapshot?: string | null
          project_id: string
          reconciliation_case_id: string
          updated_at?: string
        }
        Update: {
          allocation_amount?: number
          allocation_sequence?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          legacy_release_source_id?: string
          organization_id?: string
          origin_claim_created_at_snapshot?: string | null
          origin_claim_date_snapshot?: string | null
          origin_claim_number_snapshot?: string | null
          origin_claim_status_snapshot?: string | null
          origin_claim_updated_at_snapshot?: string | null
          origin_retention_owned_snapshot?: number | null
          origin_state_hash_snapshot?: string | null
          originating_payment_claim_id?: string
          position_state_hash_snapshot?: string | null
          project_id?: string
          reconciliation_case_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_legacy_allocations_case_fkey"
            columns: ["organization_id", "project_id", "reconciliation_case_id"]
            isOneToOne: false
            referencedRelation: "retention_legacy_reconciliation_cases"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_legacy_allocations_origin_fkey"
            columns: [
              "organization_id",
              "project_id",
              "originating_payment_claim_id",
            ]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_legacy_allocations_source_fkey"
            columns: [
              "organization_id",
              "project_id",
              "legacy_release_source_id",
            ]
            isOneToOne: false
            referencedRelation: "retention_legacy_release_sources"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_legacy_release_sources: {
        Row: {
          claim_created_at_snapshot: string
          claim_date_snapshot: string | null
          claim_number_snapshot: string
          claim_status_snapshot: string
          claim_updated_at_snapshot: string
          created_at: string
          id: string
          organization_id: string
          project_id: string
          reconciliation_case_id: string
          retention_released_amount_snapshot: number
          source_origin_state_hash: string
          source_payment_claim_id: string
          source_sequence: number
        }
        Insert: {
          claim_created_at_snapshot: string
          claim_date_snapshot?: string | null
          claim_number_snapshot: string
          claim_status_snapshot: string
          claim_updated_at_snapshot: string
          created_at?: string
          id?: string
          organization_id: string
          project_id: string
          reconciliation_case_id: string
          retention_released_amount_snapshot: number
          source_origin_state_hash: string
          source_payment_claim_id: string
          source_sequence: number
        }
        Update: {
          claim_created_at_snapshot?: string
          claim_date_snapshot?: string | null
          claim_number_snapshot?: string
          claim_status_snapshot?: string
          claim_updated_at_snapshot?: string
          created_at?: string
          id?: string
          organization_id?: string
          project_id?: string
          reconciliation_case_id?: string
          retention_released_amount_snapshot?: number
          source_origin_state_hash?: string
          source_payment_claim_id?: string
          source_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "retention_legacy_sources_case_fkey"
            columns: ["organization_id", "project_id", "reconciliation_case_id"]
            isOneToOne: false
            referencedRelation: "retention_legacy_reconciliation_cases"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_legacy_sources_claim_fkey"
            columns: [
              "organization_id",
              "project_id",
              "source_payment_claim_id",
            ]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_reminder_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          event_type: string
          id: string
          metadata: Json
          new_state: string | null
          occurred_at: string
          organization_id: string
          previous_state: string | null
          project_id: string
          reason: string
          reminder_id: string | null
          schedule_id: string
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          organization_id: string
          previous_state?: string | null
          project_id: string
          reason: string
          reminder_id?: string | null
          schedule_id: string
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          organization_id?: string
          previous_state?: string | null
          project_id?: string
          reason?: string
          reminder_id?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_reminder_events_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "retention_reminder_events_reminder_fkey"
            columns: ["organization_id", "project_id", "reminder_id"]
            isOneToOne: false
            referencedRelation: "retention_reminders"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_reminder_events_schedule_fkey"
            columns: ["organization_id", "project_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "project_retention_release_schedules"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_reminders: {
        Row: {
          assigned_permission_key: string | null
          assigned_user_id: string | null
          attempt_count: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          contractual_due_date: string
          created_at: string
          created_by: string
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          due_at: string
          escalation_after_days: number | null
          escalation_level: number
          failure_reason: string | null
          id: string
          last_delivery_at: string | null
          maximum_attempts: number
          next_delivery_at: string | null
          occurrence_key: string
          organization_id: string
          organization_timezone: string
          project_id: string
          recurrence_interval: number | null
          recurrence_type: string
          reminder_type: string
          retention_claim_id: string | null
          revision: number
          schedule_id: string
          snoozed_until: string | null
          state: string
          updated_at: string
          use_project_owner_fallback: boolean
        }
        Insert: {
          assigned_permission_key?: string | null
          assigned_user_id?: string | null
          attempt_count?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contractual_due_date: string
          created_at?: string
          created_by: string
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          due_at: string
          escalation_after_days?: number | null
          escalation_level?: number
          failure_reason?: string | null
          id?: string
          last_delivery_at?: string | null
          maximum_attempts?: number
          next_delivery_at?: string | null
          occurrence_key: string
          organization_id: string
          organization_timezone: string
          project_id: string
          recurrence_interval?: number | null
          recurrence_type?: string
          reminder_type: string
          retention_claim_id?: string | null
          revision?: number
          schedule_id: string
          snoozed_until?: string | null
          state?: string
          updated_at?: string
          use_project_owner_fallback?: boolean
        }
        Update: {
          assigned_permission_key?: string | null
          assigned_user_id?: string | null
          attempt_count?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contractual_due_date?: string
          created_at?: string
          created_by?: string
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          due_at?: string
          escalation_after_days?: number | null
          escalation_level?: number
          failure_reason?: string | null
          id?: string
          last_delivery_at?: string | null
          maximum_attempts?: number
          next_delivery_at?: string | null
          occurrence_key?: string
          organization_id?: string
          organization_timezone?: string
          project_id?: string
          recurrence_interval?: number | null
          recurrence_type?: string
          reminder_type?: string
          retention_claim_id?: string | null
          revision?: number
          schedule_id?: string
          snoozed_until?: string | null
          state?: string
          updated_at?: string
          use_project_owner_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "retention_reminders_assigned_permission_key_fkey"
            columns: ["assigned_permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["permission_key"]
          },
          {
            foreignKeyName: "retention_reminders_claim_fkey"
            columns: ["organization_id", "project_id", "retention_claim_id"]
            isOneToOne: false
            referencedRelation: "retention_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_reminders_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "retention_reminders_schedule_fkey"
            columns: ["organization_id", "project_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "project_retention_release_schedules"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_schedule_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          occurred_at: string
          organization_id: string
          previous_status: string | null
          project_id: string
          reason: string
          schedule_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id: string
          previous_status?: string | null
          project_id: string
          reason: string
          schedule_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          occurred_at?: string
          organization_id?: string
          previous_status?: string | null
          project_id?: string
          reason?: string
          schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_schedule_events_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "retention_schedule_events_schedule_fkey"
            columns: ["organization_id", "project_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "project_retention_release_schedules"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
      }
      retention_variance_events: {
        Row: {
          actor_user_id: string | null
          committed_allocation_hash: string | null
          correlation_id: string | null
          event_type: string
          financial_snapshot: Json
          id: string
          metadata: Json
          new_severity: string | null
          new_state: string | null
          occurred_at: string
          organization_id: string
          originating_payment_claim_id: string | null
          phase2_state_hash: string | null
          phase4_eligibility_hash: string | null
          previous_severity: string | null
          previous_state: string | null
          project_id: string
          reason: string
          variance_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          committed_allocation_hash?: string | null
          correlation_id?: string | null
          event_type: string
          financial_snapshot?: Json
          id?: string
          metadata?: Json
          new_severity?: string | null
          new_state?: string | null
          occurred_at?: string
          organization_id: string
          originating_payment_claim_id?: string | null
          phase2_state_hash?: string | null
          phase4_eligibility_hash?: string | null
          previous_severity?: string | null
          previous_state?: string | null
          project_id: string
          reason: string
          variance_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          committed_allocation_hash?: string | null
          correlation_id?: string | null
          event_type?: string
          financial_snapshot?: Json
          id?: string
          metadata?: Json
          new_severity?: string | null
          new_state?: string | null
          occurred_at?: string
          organization_id?: string
          originating_payment_claim_id?: string | null
          phase2_state_hash?: string | null
          phase4_eligibility_hash?: string | null
          previous_severity?: string | null
          previous_state?: string | null
          project_id?: string
          reason?: string
          variance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_variance_events_org_project_origin_fkey"
            columns: [
              "organization_id",
              "project_id",
              "originating_payment_claim_id",
            ]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
          {
            foreignKeyName: "retention_variance_events_variance_fkey"
            columns: ["variance_id"]
            isOneToOne: false
            referencedRelation: "retention_variances"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_variance_scan_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          project_id: string
          queue_state: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          project_id: string
          queue_state?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          project_id?: string
          queue_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_variance_scan_queue_project_fkey"
            columns: ["organization_id", "project_id"]
            isOneToOne: true
            referencedRelation: "organization_projects"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      retention_variance_scan_runs: {
        Row: {
          after_project_id: string | null
          cleared_count: number
          completed_at: string | null
          correlation_id: string
          detected_count: number
          error_code: string | null
          error_count: number
          error_message: string | null
          id: string
          next_project_id: string | null
          organization_id: string | null
          origin_count: number
          project_count: number
          project_limit: number
          scope: string
          started_at: string
          state: string
          updated_count: number
          worker_id: string
        }
        Insert: {
          after_project_id?: string | null
          cleared_count?: number
          completed_at?: string | null
          correlation_id: string
          detected_count?: number
          error_code?: string | null
          error_count?: number
          error_message?: string | null
          id?: string
          next_project_id?: string | null
          organization_id?: string | null
          origin_count?: number
          project_count?: number
          project_limit: number
          scope?: string
          started_at?: string
          state?: string
          updated_count?: number
          worker_id: string
        }
        Update: {
          after_project_id?: string | null
          cleared_count?: number
          completed_at?: string | null
          correlation_id?: string
          detected_count?: number
          error_code?: string | null
          error_count?: number
          error_message?: string | null
          id?: string
          next_project_id?: string | null
          organization_id?: string | null
          origin_count?: number
          project_count?: number
          project_limit?: number
          scope?: string
          started_at?: string
          state?: string
          updated_count?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_variance_scan_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_variances: {
        Row: {
          affected_allocation_ids: string[]
          affected_retention_claim_ids: string[]
          assigned_role: string | null
          assigned_user_id: string | null
          committed_allocation_hash: string
          committed_retention: number
          contributing_conditions: string[]
          corrective_amount_proposed: number | null
          corrective_reference_id: string | null
          created_at: string
          current_eligibility: number
          current_ownership: number
          current_schedule_ids: string[]
          diagnostic_remaining: number
          due_date: string | null
          eligibility_variance: number
          escalation_level: number
          evidence_recorded_at: string | null
          first_detected_at: string
          id: string
          is_blocking: boolean
          last_correlation_id: string | null
          last_detected_at: string
          last_evaluated_at: string
          last_notification_at: string | null
          latest_phase2_state_hash: string
          latest_phase4_eligibility_hash: string
          organization_id: string
          originating_payment_claim_id: string
          override_approved_amount: number | null
          override_basis_hash: string | null
          ownership_variance: number
          primary_type: string
          prior_committed_allocation_hash: string | null
          prior_phase2_state_hash: string | null
          prior_phase4_eligibility_hash: string | null
          project_id: string
          relied_schedule_ids: string[]
          resolution_approved_by: string | null
          resolution_evidence: Json | null
          resolution_proposed_by: string | null
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          revision: number
          severity: string
          state: string
          updated_at: string
        }
        Insert: {
          affected_allocation_ids?: string[]
          affected_retention_claim_ids?: string[]
          assigned_role?: string | null
          assigned_user_id?: string | null
          committed_allocation_hash: string
          committed_retention: number
          contributing_conditions?: string[]
          corrective_amount_proposed?: number | null
          corrective_reference_id?: string | null
          created_at?: string
          current_eligibility: number
          current_ownership: number
          current_schedule_ids?: string[]
          diagnostic_remaining: number
          due_date?: string | null
          eligibility_variance: number
          escalation_level?: number
          evidence_recorded_at?: string | null
          first_detected_at?: string
          id?: string
          is_blocking: boolean
          last_correlation_id?: string | null
          last_detected_at?: string
          last_evaluated_at?: string
          last_notification_at?: string | null
          latest_phase2_state_hash: string
          latest_phase4_eligibility_hash: string
          organization_id: string
          originating_payment_claim_id: string
          override_approved_amount?: number | null
          override_basis_hash?: string | null
          ownership_variance: number
          primary_type: string
          prior_committed_allocation_hash?: string | null
          prior_phase2_state_hash?: string | null
          prior_phase4_eligibility_hash?: string | null
          project_id: string
          relied_schedule_ids?: string[]
          resolution_approved_by?: string | null
          resolution_evidence?: Json | null
          resolution_proposed_by?: string | null
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          revision?: number
          severity: string
          state: string
          updated_at?: string
        }
        Update: {
          affected_allocation_ids?: string[]
          affected_retention_claim_ids?: string[]
          assigned_role?: string | null
          assigned_user_id?: string | null
          committed_allocation_hash?: string
          committed_retention?: number
          contributing_conditions?: string[]
          corrective_amount_proposed?: number | null
          corrective_reference_id?: string | null
          created_at?: string
          current_eligibility?: number
          current_ownership?: number
          current_schedule_ids?: string[]
          diagnostic_remaining?: number
          due_date?: string | null
          eligibility_variance?: number
          escalation_level?: number
          evidence_recorded_at?: string | null
          first_detected_at?: string
          id?: string
          is_blocking?: boolean
          last_correlation_id?: string | null
          last_detected_at?: string
          last_evaluated_at?: string
          last_notification_at?: string | null
          latest_phase2_state_hash?: string
          latest_phase4_eligibility_hash?: string
          organization_id?: string
          originating_payment_claim_id?: string
          override_approved_amount?: number | null
          override_basis_hash?: string | null
          ownership_variance?: number
          primary_type?: string
          prior_committed_allocation_hash?: string | null
          prior_phase2_state_hash?: string | null
          prior_phase4_eligibility_hash?: string | null
          project_id?: string
          relied_schedule_ids?: string[]
          resolution_approved_by?: string | null
          resolution_evidence?: Json | null
          resolution_proposed_by?: string | null
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          revision?: number
          severity?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_variances_org_project_origin_fkey"
            columns: [
              "organization_id",
              "project_id",
              "originating_payment_claim_id",
            ]
            isOneToOne: true
            referencedRelation: "project_claims"
            referencedColumns: ["organization_id", "project_id", "id"]
          },
        ]
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
      supplier_contact_link_activity: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          external_contact_link_id: string | null
          id: string
          message: string
          metadata: Json
          organization_id: string
          supplier_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          external_contact_link_id?: string | null
          id?: string
          message: string
          metadata?: Json
          organization_id: string
          supplier_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          external_contact_link_id?: string | null
          id?: string
          message?: string
          metadata?: Json
          organization_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contact_link_activity_external_contact_link_id_fkey"
            columns: ["external_contact_link_id"]
            isOneToOne: false
            referencedRelation: "organization_external_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contact_link_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contact_link_activity_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_accounts_approvals: {
        Row: {
          approval_note: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          finance_hash: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          organization_id: string
          site_review_submission_id: string | null
          status: string
          supplier_invoice_id: string
          updated_at: string
        }
        Insert: {
          approval_note?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          finance_hash: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          organization_id: string
          site_review_submission_id?: string | null
          status: string
          supplier_invoice_id: string
          updated_at?: string
        }
        Update: {
          approval_note?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          finance_hash?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          organization_id?: string
          site_review_submission_id?: string | null
          status?: string
          supplier_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_accounts_approv_site_review_submission_id_fkey"
            columns: ["site_review_submission_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_site_review_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_accounts_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_accounts_approvals_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
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
      supplier_invoice_ai_suggestions: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          confidence_score: number | null
          created_at: string
          final_outcome_json: Json
          id: string
          input_fingerprint: string | null
          model: string | null
          organization_id: string
          output_json: Json
          prompt_version: string | null
          provider: string | null
          reasoning_summary: string | null
          rejected_at: string | null
          rejected_by_user_id: string | null
          suggestion_type: string
          supplier_invoice_id: string
          supplier_invoice_line_allocation_id: string | null
          supplier_invoice_line_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          final_outcome_json?: Json
          id?: string
          input_fingerprint?: string | null
          model?: string | null
          organization_id: string
          output_json?: Json
          prompt_version?: string | null
          provider?: string | null
          reasoning_summary?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          suggestion_type: string
          supplier_invoice_id: string
          supplier_invoice_line_allocation_id?: string | null
          supplier_invoice_line_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          final_outcome_json?: Json
          id?: string
          input_fingerprint?: string | null
          model?: string | null
          organization_id?: string
          output_json?: Json
          prompt_version?: string | null
          provider?: string | null
          reasoning_summary?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          suggestion_type?: string
          supplier_invoice_id?: string
          supplier_invoice_line_allocation_id?: string | null
          supplier_invoice_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_ai_suggestio_supplier_invoice_line_alloca_fkey"
            columns: ["supplier_invoice_line_allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_ai_suggestions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_ai_suggestions_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_ai_suggestions_supplier_invoice_line_id_fkey"
            columns: ["supplier_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
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
      supplier_invoice_commercial_approvals: {
        Row: {
          accepted_variances: Json
          approval_note: string
          created_at: string
          currency: string
          finance_version_hash: string
          id: string
          invalidated_at: string | null
          invalidated_by: string | null
          invalidation_reason: string | null
          invalidation_source: string | null
          invoice_tax_total: number
          invoice_total: number
          no_po_explanation: string | null
          no_po_reason: string | null
          normalized_invoice_number: string
          organization_id: string
          reviewed_at: string
          reviewed_by: string
          status: string
          supplier_id: string | null
          supplier_invoice_id: string
        }
        Insert: {
          accepted_variances?: Json
          approval_note?: string
          created_at?: string
          currency: string
          finance_version_hash: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          invalidation_source?: string | null
          invoice_tax_total: number
          invoice_total: number
          no_po_explanation?: string | null
          no_po_reason?: string | null
          normalized_invoice_number: string
          organization_id: string
          reviewed_at?: string
          reviewed_by: string
          status: string
          supplier_id?: string | null
          supplier_invoice_id: string
        }
        Update: {
          accepted_variances?: Json
          approval_note?: string
          created_at?: string
          currency?: string
          finance_version_hash?: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          invalidation_source?: string | null
          invoice_tax_total?: number
          invoice_total?: number
          no_po_explanation?: string | null
          no_po_reason?: string | null
          normalized_invoice_number?: string
          organization_id?: string
          reviewed_at?: string
          reviewed_by?: string
          status?: string
          supplier_id?: string | null
          supplier_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_commercial_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_approvals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "organization_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_approvals_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_commercial_line_snapshots: {
        Row: {
          accounting_mapping_id: string
          accounting_tax_rate_id: string | null
          allocation_id: string | null
          amount: number
          commercial_approval_id: string
          created_at: string
          description: string
          id: string
          organization_id: string
          project_id: string | null
          purchase_order_id: string | null
          purchase_order_line_item_id: string | null
          quantity: number
          supplier_invoice_id: string
          supplier_invoice_line_id: string | null
          tax_amount: number
          tax_resolution_status: string
          unit_rate: number
        }
        Insert: {
          accounting_mapping_id: string
          accounting_tax_rate_id?: string | null
          allocation_id?: string | null
          amount: number
          commercial_approval_id: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          quantity: number
          supplier_invoice_id: string
          supplier_invoice_line_id?: string | null
          tax_amount: number
          tax_resolution_status: string
          unit_rate: number
        }
        Update: {
          accounting_mapping_id?: string
          accounting_tax_rate_id?: string | null
          allocation_id?: string | null
          amount?: number
          commercial_approval_id?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          quantity?: number
          supplier_invoice_id?: string
          supplier_invoice_line_id?: string | null
          tax_amount?: number
          tax_resolution_status?: string
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_commercial_li_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line__supplier_invoice_line_id_fkey"
            columns: ["supplier_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_sn_accounting_tax_rate_id_fkey"
            columns: ["accounting_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_sn_commercial_approval_id_fkey"
            columns: ["commercial_approval_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_commercial_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_sna_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_snaps_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_snapsho_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_snapshots_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_line_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_commercial_variances: {
        Row: {
          accepted_at: string
          accepted_by: string
          actual_value: Json | null
          commercial_approval_id: string
          created_at: string
          expected_value: Json | null
          explanation: string
          id: string
          organization_id: string
          purchase_order_line_item_id: string | null
          severity: string
          supplier_invoice_id: string
          variance_amount: number | null
          variance_key: string
          variance_type: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          actual_value?: Json | null
          commercial_approval_id: string
          created_at?: string
          expected_value?: Json | null
          explanation: string
          id?: string
          organization_id: string
          purchase_order_line_item_id?: string | null
          severity: string
          supplier_invoice_id: string
          variance_amount?: number | null
          variance_key: string
          variance_type: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          actual_value?: Json | null
          commercial_approval_id?: string
          created_at?: string
          expected_value?: Json | null
          explanation?: string
          id?: string
          organization_id?: string
          purchase_order_line_item_id?: string | null
          severity?: string
          supplier_invoice_id?: string
          variance_amount?: number | null
          variance_key?: string
          variance_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_commercial_va_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_varianc_commercial_approval_id_fkey"
            columns: ["commercial_approval_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_commercial_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_variances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_commercial_variances_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_document_extractions: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          extracted_payload_json: Json | null
          id: string
          idempotency_key: string
          model: string | null
          organization_id: string
          provider: string | null
          requested_by: string | null
          schema_version: string
          started_at: string | null
          status: string
          supplier_invoice_document_id: string
          supplier_invoice_id: string
          updated_at: string
          warnings_json: Json
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          extracted_payload_json?: Json | null
          id?: string
          idempotency_key: string
          model?: string | null
          organization_id: string
          provider?: string | null
          requested_by?: string | null
          schema_version?: string
          started_at?: string | null
          status?: string
          supplier_invoice_document_id: string
          supplier_invoice_id: string
          updated_at?: string
          warnings_json?: Json
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          extracted_payload_json?: Json | null
          id?: string
          idempotency_key?: string
          model?: string | null
          organization_id?: string
          provider?: string | null
          requested_by?: string | null
          schema_version?: string
          started_at?: string | null
          status?: string
          supplier_invoice_document_id?: string
          supplier_invoice_id?: string
          updated_at?: string
          warnings_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_document_ext_supplier_invoice_document_id_fkey"
            columns: ["supplier_invoice_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_document_extractions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_document_extractions_supplier_invoice_id_fkey"
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
          is_current: boolean
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          superseded_at: string | null
          superseded_by_document_id: string | null
          supplier_invoice_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string
          file_name: string
          file_path: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          superseded_at?: string | null
          superseded_by_document_id?: string | null
          supplier_invoice_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          superseded_at?: string | null
          superseded_by_document_id?: string | null
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
            foreignKeyName: "supplier_invoice_documents_superseded_by_document_id_fkey"
            columns: ["superseded_by_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_documents"
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
      supplier_invoice_line_allocations: {
        Row: {
          accepted_ai_suggestion: boolean
          accounting_mapping_id: string | null
          accounting_resolution_status: string
          accounting_tax_rate_id: string | null
          ai_confidence_score: number | null
          ai_construction_intelligence: Json
          ai_reasoning_summary: string | null
          ai_suggested_cost_item_id: string | null
          ai_suggested_purchase_order_line_item_id: string | null
          ai_suggestion_metadata_json: Json
          allocated_amount: number
          allocated_quantity: number | null
          allocation_group_id: string
          allocation_sequence: number
          allocation_source: string
          allocation_status: string
          approval_checks_json: Json
          approval_notes: string
          approval_status: string
          approved_at: string | null
          approved_by_user_id: string | null
          classification_status: string
          cost_item_id: string | null
          cost_type: string | null
          created_at: string
          edit_state: string
          id: string
          internal_cost_code: string | null
          match_status: string
          matched_amount: number
          organization_cost_code_id: string | null
          organization_id: string
          project_id: string | null
          purchase_order_id: string | null
          purchase_order_line_item_id: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          source_cost_item_id: string | null
          supersedes_allocation_id: string | null
          supplier_invoice_id: string
          supplier_invoice_line_id: string
          tax_resolution_status: string
          tradesstack_cost_code: number | null
          tradesstack_cost_code_label: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          accepted_ai_suggestion?: boolean
          accounting_mapping_id?: string | null
          accounting_resolution_status?: string
          accounting_tax_rate_id?: string | null
          ai_confidence_score?: number | null
          ai_construction_intelligence?: Json
          ai_reasoning_summary?: string | null
          ai_suggested_cost_item_id?: string | null
          ai_suggested_purchase_order_line_item_id?: string | null
          ai_suggestion_metadata_json?: Json
          allocated_amount?: number
          allocated_quantity?: number | null
          allocation_group_id: string
          allocation_sequence?: number
          allocation_source?: string
          allocation_status?: string
          approval_checks_json?: Json
          approval_notes?: string
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          classification_status?: string
          cost_item_id?: string | null
          cost_type?: string | null
          created_at?: string
          edit_state?: string
          id?: string
          internal_cost_code?: string | null
          match_status?: string
          matched_amount?: number
          organization_cost_code_id?: string | null
          organization_id: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_cost_item_id?: string | null
          supersedes_allocation_id?: string | null
          supplier_invoice_id: string
          supplier_invoice_line_id: string
          tax_resolution_status?: string
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          accepted_ai_suggestion?: boolean
          accounting_mapping_id?: string | null
          accounting_resolution_status?: string
          accounting_tax_rate_id?: string | null
          ai_confidence_score?: number | null
          ai_construction_intelligence?: Json
          ai_reasoning_summary?: string | null
          ai_suggested_cost_item_id?: string | null
          ai_suggested_purchase_order_line_item_id?: string | null
          ai_suggestion_metadata_json?: Json
          allocated_amount?: number
          allocated_quantity?: number | null
          allocation_group_id?: string
          allocation_sequence?: number
          allocation_source?: string
          allocation_status?: string
          approval_checks_json?: Json
          approval_notes?: string
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          classification_status?: string
          cost_item_id?: string | null
          cost_type?: string | null
          created_at?: string
          edit_state?: string
          id?: string
          internal_cost_code?: string | null
          match_status?: string
          matched_amount?: number
          organization_cost_code_id?: string | null
          organization_id?: string
          project_id?: string | null
          purchase_order_id?: string | null
          purchase_order_line_item_id?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_cost_item_id?: string | null
          supersedes_allocation_id?: string | null
          supplier_invoice_id?: string
          supplier_invoice_line_id?: string
          tax_resolution_status?: string
          tradesstack_cost_code?: number | null
          tradesstack_cost_code_label?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_line_allocat_ai_suggested_purchase_order__fkey"
            columns: ["ai_suggested_purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocati_purchase_order_line_item_id_fkey"
            columns: ["purchase_order_line_item_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocation_ai_suggested_cost_item_id_fkey"
            columns: ["ai_suggested_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocation_organization_cost_code_id_fkey"
            columns: ["organization_cost_code_id"]
            isOneToOne: false
            referencedRelation: "organization_cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_accounting_mapping_id_fkey"
            columns: ["accounting_mapping_id"]
            isOneToOne: false
            referencedRelation: "organization_tradesstack_accounting_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_accounting_tax_rate_id_fkey"
            columns: ["accounting_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "organization_accounting_tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_source_cost_item_id_fkey"
            columns: ["source_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_supersedes_allocation_id_fkey"
            columns: ["supersedes_allocation_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_line_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_supplier_invoice_line_id_fkey"
            columns: ["supplier_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_line_allocations_tradesstack_cost_code_fkey"
            columns: ["tradesstack_cost_code"]
            isOneToOne: false
            referencedRelation: "tradesstack_financial_routing_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      supplier_invoice_lines: {
        Row: {
          cost_code_id: string | null
          created_at: string
          description: string
          id: string
          import_source: string
          line_total: number
          line_uid: string
          normalized_line_text: string | null
          ocr_confidence: number | null
          organization_id: string
          project_id: string | null
          quantity: number
          raw_line_text: string | null
          sort_order: number
          source_metadata_json: Json
          source_row_number: number | null
          supplier_description: string | null
          supplier_invoice_id: string
          supplier_item_code: string | null
          tax_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          import_source?: string
          line_total?: number
          line_uid?: string
          normalized_line_text?: string | null
          ocr_confidence?: number | null
          organization_id: string
          project_id?: string | null
          quantity?: number
          raw_line_text?: string | null
          sort_order?: number
          source_metadata_json?: Json
          source_row_number?: number | null
          supplier_description?: string | null
          supplier_invoice_id: string
          supplier_item_code?: string | null
          tax_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          import_source?: string
          line_total?: number
          line_uid?: string
          normalized_line_text?: string | null
          ocr_confidence?: number | null
          organization_id?: string
          project_id?: string | null
          quantity?: number
          raw_line_text?: string | null
          sort_order?: number
          source_metadata_json?: Json
          source_row_number?: number | null
          supplier_description?: string | null
          supplier_invoice_id?: string
          supplier_item_code?: string | null
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
      supplier_invoice_site_review_decisions: {
        Row: {
          accepted_variances: Json
          allocated_amount_snapshot: number
          allocation_ids_snapshot: string[]
          created_at: string
          decision: string
          disputed_allocation_ids: string[]
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          note: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          submission_id: string
          supplier_invoice_id: string
          updated_at: string
        }
        Insert: {
          accepted_variances?: Json
          allocated_amount_snapshot: number
          allocation_ids_snapshot?: string[]
          created_at?: string
          decision?: string
          disputed_allocation_ids?: string[]
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          note?: string
          organization_id: string
          project_id: string
          purchase_order_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          submission_id: string
          supplier_invoice_id: string
          updated_at?: string
        }
        Update: {
          accepted_variances?: Json
          allocated_amount_snapshot?: number
          allocation_ids_snapshot?: string[]
          created_at?: string
          decision?: string
          disputed_allocation_ids?: string[]
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          note?: string
          organization_id?: string
          project_id?: string
          purchase_order_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          submission_id?: string
          supplier_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_site_review_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_site_review_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_site_review_decisions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "project_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_site_review_decisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_site_review_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_site_review_decisions_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_site_review_submissions: {
        Row: {
          created_at: string
          finance_hash: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          organization_id: string
          status: string
          submitted_at: string
          submitted_by: string
          supplier_invoice_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finance_hash: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          organization_id: string
          status?: string
          submitted_at?: string
          submitted_by: string
          supplier_invoice_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finance_hash?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          organization_id?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          supplier_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_site_review_submissio_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_site_review_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          supplier_po_reference: string | null
          supplier_po_reference_normalized: string | null
          tax_amount_mode: string
          tax_evidence_json: Json
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
          supplier_po_reference?: string | null
          supplier_po_reference_normalized?: string | null
          tax_amount_mode?: string
          tax_evidence_json?: Json
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
          supplier_po_reference?: string | null
          supplier_po_reference_normalized?: string | null
          tax_amount_mode?: string
          tax_evidence_json?: Json
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
      tradesstack_financial_routing_codes: {
        Row: {
          code: number
          created_at: string
          description: string | null
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          code: number
          created_at?: string
          description?: string | null
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          code?: number
          created_at?: string
          description?: string | null
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      validation_cases: {
        Row: {
          approval_note: string | null
          approval_status: string
          approved_at: string | null
          approved_by_user_id: string | null
          created_at: string
          details: Json
          expected_value: Json | null
          id: string
          linked_ai_interaction_id: string | null
          linked_event_id: string | null
          module: string
          observed_value: Json | null
          opportunity_id: string | null
          organization_id: string
          privacy_classification: string
          project_id: string | null
          requires_approval: boolean
          result: string
          rule_key: string
          rule_version: string | null
          scope_entity_id: string | null
          scope_entity_type: string
          severity: string
          updated_at: string
          validation_type: string
          visibility_scope: string
        }
        Insert: {
          approval_note?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          details?: Json
          expected_value?: Json | null
          id?: string
          linked_ai_interaction_id?: string | null
          linked_event_id?: string | null
          module: string
          observed_value?: Json | null
          opportunity_id?: string | null
          organization_id: string
          privacy_classification?: string
          project_id?: string | null
          requires_approval?: boolean
          result: string
          rule_key: string
          rule_version?: string | null
          scope_entity_id?: string | null
          scope_entity_type: string
          severity: string
          updated_at?: string
          validation_type: string
          visibility_scope?: string
        }
        Update: {
          approval_note?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          details?: Json
          expected_value?: Json | null
          id?: string
          linked_ai_interaction_id?: string | null
          linked_event_id?: string | null
          module?: string
          observed_value?: Json | null
          opportunity_id?: string | null
          organization_id?: string
          privacy_classification?: string
          project_id?: string | null
          requires_approval?: boolean
          result?: string
          rule_key?: string
          rule_version?: string | null
          scope_entity_id?: string | null
          scope_entity_type?: string
          severity?: string
          updated_at?: string
          validation_type?: string
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_cases_linked_ai_interaction_id_fkey"
            columns: ["linked_ai_interaction_id"]
            isOneToOne: false
            referencedRelation: "ai_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_cases_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_cases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_event_classification_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          classification_version: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          source_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_version?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          source_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_version?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_event_classification_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_event_classification_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_event_classifications: {
        Row: {
          attempt_number: number
          batch_key: string | null
          classification_model: string | null
          classification_model_version: string | null
          classification_provider: string | null
          classification_source: string
          classification_status: string
          classification_version: number
          classified_at: string
          confidence_detail: Json
          construction_intelligence_inputs: Json
          context_sources: Json
          created_at: string
          error_code: string | null
          error_message: string | null
          future_use_summary: Json
          id: string
          interpretation_payload: Json
          interpretation_prompt_version: number
          interpretation_schema_version: number
          organization_id: string
          overall_confidence: number | null
          reasoning_summary: string | null
          request_context: Json
          retry_after: string | null
          semantic_fields: Json
          source_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          batch_key?: string | null
          classification_model?: string | null
          classification_model_version?: string | null
          classification_provider?: string | null
          classification_source?: string
          classification_status: string
          classification_version?: number
          classified_at?: string
          confidence_detail?: Json
          construction_intelligence_inputs?: Json
          context_sources?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          future_use_summary?: Json
          id?: string
          interpretation_payload?: Json
          interpretation_prompt_version?: number
          interpretation_schema_version?: number
          organization_id: string
          overall_confidence?: number | null
          reasoning_summary?: string | null
          request_context?: Json
          retry_after?: string | null
          semantic_fields?: Json
          source_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          batch_key?: string | null
          classification_model?: string | null
          classification_model_version?: string | null
          classification_provider?: string | null
          classification_source?: string
          classification_status?: string
          classification_version?: number
          classified_at?: string
          confidence_detail?: Json
          construction_intelligence_inputs?: Json
          context_sources?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          future_use_summary?: Json
          id?: string
          interpretation_payload?: Json
          interpretation_prompt_version?: number
          interpretation_schema_version?: number
          organization_id?: string
          overall_confidence?: number | null
          reasoning_summary?: string | null
          request_context?: Json
          retry_after?: string | null
          semantic_fields?: Json
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_event_classifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_event_classifications_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_evidence_pool_events: {
        Row: {
          classification_attempt_number: number
          classification_record_id: string | null
          classification_version: number
          event_confidence: number | null
          evidence_role: string
          id: string
          linked_at: string
          occurred_at: string
          organization_id: string
          pool_id: string
          source_event_id: string
        }
        Insert: {
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version?: number
          event_confidence?: number | null
          evidence_role?: string
          id?: string
          linked_at?: string
          occurred_at: string
          organization_id: string
          pool_id: string
          source_event_id: string
        }
        Update: {
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version?: number
          event_confidence?: number | null
          evidence_role?: string
          id?: string
          linked_at?: string
          occurred_at?: string
          organization_id?: string
          pool_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_evidence_pool_ev_classification_record_id_fkey"
            columns: ["classification_record_id"]
            isOneToOne: false
            referencedRelation: "worksheet_event_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_evidence_pool_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_evidence_pool_events_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_evidence_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_evidence_pool_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_evidence_pool_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          classification_attempt_number: number
          classification_record_id: string | null
          classification_version: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          source_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          source_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_evidence_pool_qu_classification_record_id_fkey"
            columns: ["classification_record_id"]
            isOneToOne: false
            referencedRelation: "worksheet_event_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_evidence_pool_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_evidence_pool_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_evidence_pools: {
        Row: {
          average_confidence: number | null
          contradiction_count: number
          created_at: string
          event_type: string
          evidence_count: number
          first_seen_at: string
          id: string
          ignored_count: number
          last_built_at: string
          last_seen_at: string
          maturity_status: string
          organization_id: string
          pool_kind: string
          pool_revision_hash: string
          pool_signature: string
          project_count: number
          scope_context: Json
          scope_signature: string
          support_count: number
          target_context: Json
          target_signature: string
          updated_at: string
          workbook_count: number
          worksheet_count: number
        }
        Insert: {
          average_confidence?: number | null
          contradiction_count?: number
          created_at?: string
          event_type: string
          evidence_count?: number
          first_seen_at: string
          id?: string
          ignored_count?: number
          last_built_at?: string
          last_seen_at: string
          maturity_status?: string
          organization_id: string
          pool_kind: string
          pool_revision_hash: string
          pool_signature: string
          project_count?: number
          scope_context?: Json
          scope_signature: string
          support_count?: number
          target_context?: Json
          target_signature: string
          updated_at?: string
          workbook_count?: number
          worksheet_count?: number
        }
        Update: {
          average_confidence?: number | null
          contradiction_count?: number
          created_at?: string
          event_type?: string
          evidence_count?: number
          first_seen_at?: string
          id?: string
          ignored_count?: number
          last_built_at?: string
          last_seen_at?: string
          maturity_status?: string
          organization_id?: string
          pool_kind?: string
          pool_revision_hash?: string
          pool_signature?: string
          project_count?: number
          scope_context?: Json
          scope_signature?: string
          support_count?: number
          target_context?: Json
          target_signature?: string
          updated_at?: string
          workbook_count?: number
          worksheet_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_evidence_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_semantic_pool_events: {
        Row: {
          classification_record_id: string | null
          evidence_role: string
          id: string
          linked_at: string
          linked_by_run_id: string | null
          organization_id: string
          semantic_pool_id: string
          source_event_id: string
        }
        Insert: {
          classification_record_id?: string | null
          evidence_role: string
          id?: string
          linked_at?: string
          linked_by_run_id?: string | null
          organization_id: string
          semantic_pool_id: string
          source_event_id: string
        }
        Update: {
          classification_record_id?: string | null
          evidence_role?: string
          id?: string
          linked_at?: string
          linked_by_run_id?: string | null
          organization_id?: string
          semantic_pool_id?: string
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_semantic_pool_ev_classification_record_id_fkey"
            columns: ["classification_record_id"]
            isOneToOne: false
            referencedRelation: "worksheet_event_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pool_events_linked_by_run_id_fkey"
            columns: ["linked_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pool_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pool_events_semantic_pool_id_fkey"
            columns: ["semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pool_events_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_semantic_pool_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          seed_maturity_status: string
          seed_pool_id: string
          seed_pool_revision_hash: string
          seed_pool_signature: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          seed_maturity_status: string
          seed_pool_id: string
          seed_pool_revision_hash: string
          seed_pool_signature: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          seed_maturity_status?: string
          seed_pool_id?: string
          seed_pool_revision_hash?: string
          seed_pool_signature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_semantic_pool_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pool_queue_seed_pool_id_fkey"
            columns: ["seed_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_evidence_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_semantic_pool_runs: {
        Row: {
          candidate_event_count: number
          claimed_job_count: number
          completed_job_count: number
          created_at: string
          dead_lettered_job_count: number
          diagnostic_summary: Json
          duration_ms: number
          id: string
          model: string | null
          no_pool_count: number
          provider: string | null
          requested_organization_id: string | null
          retried_job_count: number
          semantic_pool_count: number
          updated_at: string
        }
        Insert: {
          candidate_event_count?: number
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          dead_lettered_job_count?: number
          diagnostic_summary?: Json
          duration_ms?: number
          id?: string
          model?: string | null
          no_pool_count?: number
          provider?: string | null
          requested_organization_id?: string | null
          retried_job_count?: number
          semantic_pool_count?: number
          updated_at?: string
        }
        Update: {
          candidate_event_count?: number
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          dead_lettered_job_count?: number
          diagnostic_summary?: Json
          duration_ms?: number
          id?: string
          model?: string | null
          no_pool_count?: number
          provider?: string | null
          requested_organization_id?: string | null
          retried_job_count?: number
          semantic_pool_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_semantic_pool_r_requested_organization_id_fkey"
            columns: ["requested_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_semantic_pools: {
        Row: {
          adjacent_count: number
          average_confidence: number | null
          contradiction_count: number
          contradiction_summary: Json
          created_at: string
          created_by_run_id: string | null
          domain_label: string | null
          domain_summary: string | null
          evidence_summary: Json
          excluded_count: number
          first_seen_at: string
          grouping_rationale: string | null
          id: string
          ignored_count: number
          included_count: number
          last_grouped_at: string
          last_seen_at: string
          last_updated_by_run_id: string | null
          maturity_status: string
          organization_id: string
          pool_status: string
          pool_value_payload: Json
          project_count: number
          retrieval_guidance: string | null
          scope_payload: Json
          semantic_family: string | null
          semantic_signature: string
          semantic_type: string | null
          source_revision_hash: string
          summary: string | null
          support_count: number
          title: string | null
          uncertain_count: number
          updated_at: string
          variant_summary: string | null
          workbook_count: number
          worksheet_count: number
        }
        Insert: {
          adjacent_count?: number
          average_confidence?: number | null
          contradiction_count?: number
          contradiction_summary?: Json
          created_at?: string
          created_by_run_id?: string | null
          domain_label?: string | null
          domain_summary?: string | null
          evidence_summary?: Json
          excluded_count?: number
          first_seen_at: string
          grouping_rationale?: string | null
          id?: string
          ignored_count?: number
          included_count?: number
          last_grouped_at?: string
          last_seen_at: string
          last_updated_by_run_id?: string | null
          maturity_status?: string
          organization_id: string
          pool_status?: string
          pool_value_payload?: Json
          project_count?: number
          retrieval_guidance?: string | null
          scope_payload?: Json
          semantic_family?: string | null
          semantic_signature: string
          semantic_type?: string | null
          source_revision_hash: string
          summary?: string | null
          support_count?: number
          title?: string | null
          uncertain_count?: number
          updated_at?: string
          variant_summary?: string | null
          workbook_count?: number
          worksheet_count?: number
        }
        Update: {
          adjacent_count?: number
          average_confidence?: number | null
          contradiction_count?: number
          contradiction_summary?: Json
          created_at?: string
          created_by_run_id?: string | null
          domain_label?: string | null
          domain_summary?: string | null
          evidence_summary?: Json
          excluded_count?: number
          first_seen_at?: string
          grouping_rationale?: string | null
          id?: string
          ignored_count?: number
          included_count?: number
          last_grouped_at?: string
          last_seen_at?: string
          last_updated_by_run_id?: string | null
          maturity_status?: string
          organization_id?: string
          pool_status?: string
          pool_value_payload?: Json
          project_count?: number
          retrieval_guidance?: string | null
          scope_payload?: Json
          semantic_family?: string | null
          semantic_signature?: string
          semantic_type?: string | null
          source_revision_hash?: string
          summary?: string | null
          support_count?: number
          title?: string | null
          uncertain_count?: number
          updated_at?: string
          variant_summary?: string | null
          workbook_count?: number
          worksheet_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_semantic_pools_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pools_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_semantic_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_synthesis_queue: {
        Row: {
          attempt_count: number
          available_at: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          maturity_status: string
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          semantic_pool_id: string
          semantic_pool_signature: string
          source_revision_hash: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          maturity_status: string
          max_attempts?: number
          organization_id: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          semantic_pool_id: string
          semantic_pool_signature: string
          source_revision_hash: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_completed_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          maturity_status?: string
          max_attempts?: number
          organization_id?: string
          priority?: number
          queue_state?: string
          retry_after?: string | null
          semantic_pool_id?: string
          semantic_pool_signature?: string
          source_revision_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_synthesis_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_memory_synthesis_queue_semantic_pool_id_fkey"
            columns: ["semantic_pool_id"]
            isOneToOne: false
            referencedRelation: "worksheet_memory_semantic_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_memory_synthesis_runs: {
        Row: {
          claimed_job_count: number
          completed_job_count: number
          created_at: string
          created_memory_count: number
          deactivated_duplicate_memory_count: number
          dead_lettered_job_count: number
          duration_ms: number
          id: string
          model: string | null
          no_memory_count: number
          organization_memory_write_count: number
          provenance_link_count: number
          provider: string | null
          reconciled_memory_count: number
          reinforced_memory_count: number
          requested_organization_id: string | null
          retried_job_count: number
          reused_memory_count: number
          superseded_memory_count: number
          updated_at: string
          updated_memory_count: number
        }
        Insert: {
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          created_memory_count?: number
          deactivated_duplicate_memory_count?: number
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          model?: string | null
          no_memory_count?: number
          organization_memory_write_count?: number
          provenance_link_count?: number
          provider?: string | null
          reconciled_memory_count?: number
          reinforced_memory_count?: number
          requested_organization_id?: string | null
          retried_job_count?: number
          reused_memory_count?: number
          superseded_memory_count?: number
          updated_at?: string
          updated_memory_count?: number
        }
        Update: {
          claimed_job_count?: number
          completed_job_count?: number
          created_at?: string
          created_memory_count?: number
          deactivated_duplicate_memory_count?: number
          dead_lettered_job_count?: number
          duration_ms?: number
          id?: string
          model?: string | null
          no_memory_count?: number
          organization_memory_write_count?: number
          provenance_link_count?: number
          provider?: string | null
          reconciled_memory_count?: number
          reinforced_memory_count?: number
          requested_organization_id?: string | null
          retried_job_count?: number
          reused_memory_count?: number
          superseded_memory_count?: number
          updated_at?: string
          updated_memory_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_memory_synthesis_runs_requested_organization_id_fkey"
            columns: ["requested_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_mutation_evidence_v2_outbox: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_mutation_id: string
          created_at: string
          dead_lettered_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          next_worksheet: Json
          occurred_at: string
          opportunity_id: string
          organization_id: string
          previous_worksheet: Json
          processed_at: string | null
          processing_status: string
          project_id: string | null
          retry_after: string | null
          sheet_id: string
          sheet_name: string
          source: string
          trade_package: string | null
          updated_at: string
          user_id: string | null
          workbook_id: string
          workbook_name: string | null
          worksheet_id: string
          worksheet_name: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_mutation_id: string
          created_at?: string
          dead_lettered_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          next_worksheet: Json
          occurred_at: string
          opportunity_id: string
          organization_id: string
          previous_worksheet: Json
          processed_at?: string | null
          processing_status?: string
          project_id?: string | null
          retry_after?: string | null
          sheet_id: string
          sheet_name: string
          source?: string
          trade_package?: string | null
          updated_at?: string
          user_id?: string | null
          workbook_id: string
          workbook_name?: string | null
          worksheet_id: string
          worksheet_name: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_mutation_id?: string
          created_at?: string
          dead_lettered_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          next_worksheet?: Json
          occurred_at?: string
          opportunity_id?: string
          organization_id?: string
          previous_worksheet?: Json
          processed_at?: string | null
          processing_status?: string
          project_id?: string | null
          retry_after?: string | null
          sheet_id?: string
          sheet_name?: string
          source?: string
          trade_package?: string | null
          updated_at?: string
          user_id?: string | null
          workbook_id?: string
          workbook_name?: string | null
          worksheet_id?: string
          worksheet_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_mutation_evidence_v2_outbox_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_mutation_evidence_v2_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_mutation_evidence_v2_outbox_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_pricing_pattern_evidence_processing: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          classification_attempt_number: number
          classification_record_id: string | null
          classification_version: number
          created_at: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          organization_id: string
          processed_at: string | null
          processing_run_id: string | null
          processing_status: string
          retry_after: string | null
          source_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id: string
          processed_at?: string | null
          processing_run_id?: string | null
          processing_status?: string
          retry_after?: string | null
          source_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          classification_attempt_number?: number
          classification_record_id?: string | null
          classification_version?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          organization_id?: string
          processed_at?: string | null
          processing_run_id?: string | null
          processing_status?: string
          retry_after?: string | null
          source_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_pricing_pattern_evidenc_classification_record_id_fkey"
            columns: ["classification_record_id"]
            isOneToOne: false
            referencedRelation: "worksheet_event_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_evidence_proce_processing_run_id_fkey"
            columns: ["processing_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_evidence_process_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_evidence_process_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_pricing_pattern_shadow_candidate_evidence: {
        Row: {
          candidate_id: string
          created_at: string
          evidence_role: string
          id: string
          linked_by_run_id: string | null
          source_event_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          evidence_role: string
          id?: string
          linked_by_run_id?: string | null
          source_event_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          evidence_role?: string
          id?: string
          linked_by_run_id?: string | null
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_candidat_linked_by_run_id_fkey"
            columns: ["linked_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_candidate_ev_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_candidate_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_pricing_pattern_shadow_candidates: {
        Row: {
          candidate_signature: string
          candidate_status: string
          confidence: number | null
          contradiction_count: number
          contradiction_diversity: Json | null
          created_at: string
          created_by_run_id: string | null
          current_strength: string | null
          id: string
          ignored_count: number
          last_contradicted_at: string | null
          last_reinforced_at: string | null
          last_updated_by_run_id: string | null
          organization_id: string
          pattern_family: string | null
          pattern_type: string | null
          pattern_value: Json
          pattern_value_signature: string
          retrieval_guidance: string | null
          scope: Json
          scope_signature: string
          signature_uniqueness_enabled: boolean
          stale_after: string | null
          summary: string | null
          support_count: number
          support_diversity: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          candidate_signature: string
          candidate_status?: string
          confidence?: number | null
          contradiction_count?: number
          contradiction_diversity?: Json | null
          created_at?: string
          created_by_run_id?: string | null
          current_strength?: string | null
          id?: string
          ignored_count?: number
          last_contradicted_at?: string | null
          last_reinforced_at?: string | null
          last_updated_by_run_id?: string | null
          organization_id: string
          pattern_family?: string | null
          pattern_type?: string | null
          pattern_value?: Json
          pattern_value_signature: string
          retrieval_guidance?: string | null
          scope?: Json
          scope_signature: string
          signature_uniqueness_enabled?: boolean
          stale_after?: string | null
          summary?: string | null
          support_count?: number
          support_diversity?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          candidate_signature?: string
          candidate_status?: string
          confidence?: number | null
          contradiction_count?: number
          contradiction_diversity?: Json | null
          created_at?: string
          created_by_run_id?: string | null
          current_strength?: string | null
          id?: string
          ignored_count?: number
          last_contradicted_at?: string | null
          last_reinforced_at?: string | null
          last_updated_by_run_id?: string | null
          organization_id?: string
          pattern_family?: string | null
          pattern_type?: string | null
          pattern_value?: Json
          pattern_value_signature?: string
          retrieval_guidance?: string | null
          scope?: Json
          scope_signature?: string
          signature_uniqueness_enabled?: boolean
          stale_after?: string | null
          summary?: string | null
          support_count?: number
          support_diversity?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_ca_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_candida_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_candidate_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_pricing_pattern_shadow_proposals: {
        Row: {
          batch_id: string
          confidence: number | null
          contradiction_summary: Json
          contradictory_evidence_event_ids: Json
          created_at: string
          evidence_summary: Json
          gate_status: string
          id: string
          ignored_evidence_event_ids: Json
          organization_id: string
          pattern_family: string | null
          pattern_type: string | null
          pattern_value: Json
          proposal_kind: string
          proposed_strength: string | null
          rejection_reasons: Json
          retrieval_guidance: string | null
          run_id: string
          scope: Json
          summary: string | null
          supporting_evidence_event_ids: Json
          title: string | null
          validation: Json
        }
        Insert: {
          batch_id: string
          confidence?: number | null
          contradiction_summary?: Json
          contradictory_evidence_event_ids?: Json
          created_at?: string
          evidence_summary?: Json
          gate_status: string
          id?: string
          ignored_evidence_event_ids?: Json
          organization_id: string
          pattern_family?: string | null
          pattern_type?: string | null
          pattern_value?: Json
          proposal_kind: string
          proposed_strength?: string | null
          rejection_reasons?: Json
          retrieval_guidance?: string | null
          run_id: string
          scope?: Json
          summary?: string | null
          supporting_evidence_event_ids?: Json
          title?: string | null
          validation?: Json
        }
        Update: {
          batch_id?: string
          confidence?: number | null
          contradiction_summary?: Json
          contradictory_evidence_event_ids?: Json
          created_at?: string
          evidence_summary?: Json
          gate_status?: string
          id?: string
          ignored_evidence_event_ids?: Json
          organization_id?: string
          pattern_family?: string | null
          pattern_type?: string | null
          pattern_value?: Json
          proposal_kind?: string
          proposed_strength?: string | null
          rejection_reasons?: Json
          retrieval_guidance?: string | null
          run_id?: string
          scope?: Json
          summary?: string | null
          supporting_evidence_event_ids?: Json
          title?: string | null
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_proposals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "worksheet_pricing_pattern_shadow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_pricing_pattern_shadow_runs: {
        Row: {
          accepted_by_gate_count: number
          created_at: string
          duration_ms: number
          family_distribution: Json
          fetched_event_count: number
          id: string
          input_batch_size: number
          input_limit_count: number
          model: string
          no_pattern_count: number
          pools_built: number
          proposals_returned: number
          provider: string
          rejected_by_gate_count: number
          rejection_reasons: Json
          requested_organization_id: string | null
          strength_distribution: Json
        }
        Insert: {
          accepted_by_gate_count?: number
          created_at?: string
          duration_ms?: number
          family_distribution?: Json
          fetched_event_count?: number
          id?: string
          input_batch_size: number
          input_limit_count: number
          model: string
          no_pattern_count?: number
          pools_built?: number
          proposals_returned?: number
          provider: string
          rejected_by_gate_count?: number
          rejection_reasons?: Json
          requested_organization_id?: string | null
          strength_distribution?: Json
        }
        Update: {
          accepted_by_gate_count?: number
          created_at?: string
          duration_ms?: number
          family_distribution?: Json
          fetched_event_count?: number
          id?: string
          input_batch_size?: number
          input_limit_count?: number
          model?: string
          no_pattern_count?: number
          pools_built?: number
          proposals_returned?: number
          provider?: string
          rejected_by_gate_count?: number
          rejection_reasons?: Json
          requested_organization_id?: string | null
          strength_distribution?: Json
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_pricing_pattern_shadow_requested_organization_id_fkey"
            columns: ["requested_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      intelligence_observability_ai_confidence_daily: {
        Row: {
          accepted_count: number | null
          confidence_band: string | null
          corrected_interaction_count: number | null
          correction_rate: number | null
          edited_count: number | null
          event_date: string | null
          interaction_count: number | null
          interaction_type: string | null
          module: string | null
          organization_id: string | null
          rejected_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_ai_daily: {
        Row: {
          accepted_count: number | null
          avg_confidence: number | null
          avg_confidence_accepted: number | null
          avg_confidence_corrected: number | null
          avg_confidence_edited: number | null
          avg_confidence_rejected: number | null
          corrected_interaction_count: number | null
          correction_rate: number | null
          edited_count: number | null
          event_date: string | null
          ignored_count: number | null
          interaction_count: number | null
          interaction_type: string | null
          module: string | null
          organization_id: string | null
          partially_accepted_count: number | null
          rejected_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_correction_daily: {
        Row: {
          corrected_field_name: string | null
          correction_count: number | null
          correction_type: string | null
          distinct_actor_count: number | null
          distinct_target_count: number | null
          event_date: string | null
          feedback_label: string | null
          first_created_at: string | null
          is_training_eligible: boolean | null
          last_created_at: string | null
          module: string | null
          organization_id: string | null
          target_entity_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_cost_item_daily: {
        Row: {
          cost_type: string | null
          distinct_entity_count: number | null
          event_count: number | null
          event_date: string | null
          event_type: string | null
          intelligence_cost_code: string | null
          module: string | null
          organization_id: string | null
          project_id: string | null
          source_document_kind: string | null
          target_cost_code_id: string | null
          work_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_cost_item_review_backlog: {
        Row: {
          avg_classification_confidence: number | null
          cost_type: string | null
          last_updated_at: string | null
          organization_id: string | null
          project_id: string | null
          source_document_kind: string | null
          unresolved_review_count: number | null
          work_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_daily_overview: {
        Row: {
          activity_date: string | null
          ai_interaction_count: number | null
          correction_event_count: number | null
          intelligence_event_count: number | null
          latest_activity_at: string | null
          module: string | null
          organization_id: string | null
          validation_case_count: number | null
        }
        Relationships: []
      }
      intelligence_observability_event_daily: {
        Row: {
          contains_financial_data: boolean | null
          distinct_actor_count: number | null
          distinct_entity_count: number | null
          distinct_opportunity_count: number | null
          distinct_project_count: number | null
          event_count: number | null
          event_date: string | null
          event_family: string | null
          event_type: string | null
          first_occurred_at: string | null
          last_occurred_at: string | null
          module: string | null
          organization_id: string | null
          privacy_classification: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_pricing_worksheet_daily: {
        Row: {
          avg_column_count_on_save: number | null
          avg_formula_count_on_save: number | null
          avg_populated_cell_count_on_save: number | null
          avg_row_count_on_save: number | null
          event_date: string | null
          organization_id: string | null
          sheet_id: string | null
          sheet_name: string | null
          trade_package: string | null
          workbook_id: string | null
          worksheet_archived_count: number | null
          worksheet_created_count: number | null
          worksheet_duplicated_count: number | null
          worksheet_name: string | null
          worksheet_renamed_count: number | null
          worksheet_saved_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_supplier_invoice_daily: {
        Row: {
          actual_cost_posted_count: number | null
          actual_cost_reversed_count: number | null
          ai_match_accepted_count: number | null
          ai_match_edited_count: number | null
          ai_match_rejected_count: number | null
          allocation_approval_rate: number | null
          allocation_approved_count: number | null
          allocation_corrected_count: number | null
          allocation_suggested_count: number | null
          approval_requested_count: number | null
          event_date: string | null
          invoice_approved_count: number | null
          invoice_created_count: number | null
          invoice_rejected_count: number | null
          match_acceptance_rate: number | null
          match_confirmed_count: number | null
          match_rejected_count: number | null
          match_suggested_count: number | null
          organization_id: string | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_takeoff_daily: {
        Row: {
          calibration_corrected_count: number | null
          calibration_created_count: number | null
          event_date: string | null
          measurement_archived_count: number | null
          measurement_corrected_count: number | null
          measurement_created_count: number | null
          measurement_deleted_count: number | null
          measurement_kind: string | null
          measurement_restored_count: number | null
          measurement_updated_count: number | null
          opportunity_id: string | null
          organization_id: string | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "organization_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organization_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability_validation_daily: {
        Row: {
          approval_approved_count: number | null
          approval_pending_count: number | null
          approval_rejected_count: number | null
          event_date: string | null
          failed_count: number | null
          module: string | null
          organization_id: string | null
          overridden_count: number | null
          override_rate: number | null
          passed_count: number | null
          requires_approval_count: number | null
          rule_key: string | null
          severity: string | null
          validation_case_count: number | null
          validation_type: string | null
          warning_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _intelligence_assert_ai_interaction_in_organization: {
        Args: { p_ai_interaction_id: string; p_organization_id: string }
        Returns: undefined
      }
      _intelligence_assert_event_in_organization: {
        Args: { p_event_id: string; p_organization_id: string }
        Returns: undefined
      }
      _intelligence_assert_opportunity_in_organization: {
        Args: { p_opportunity_id: string; p_organization_id: string }
        Returns: undefined
      }
      _intelligence_assert_organization_member: {
        Args: { p_organization_id: string }
        Returns: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _intelligence_assert_project_in_organization: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: undefined
      }
      _intelligence_assert_validation_case_in_organization: {
        Args: { p_organization_id: string; p_validation_case_id: string }
        Returns: undefined
      }
      _intelligence_can_read_visibility_scope: {
        Args: { p_organization_id: string; p_visibility_scope: string }
        Returns: boolean
      }
      _intelligence_can_view_analytics: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      _normalize_opportunity_pricing_workbook_name: {
        Args: { p_fallback?: string; p_name: string }
        Returns: string
      }
      _organization_memory_assert_item_in_organization: {
        Args: { p_memory_item_id: string; p_organization_id: string }
        Returns: undefined
      }
      _organization_memory_assert_organization_exists: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      _organization_memory_assert_platform_admin: {
        Args: { p_required_role?: string }
        Returns: undefined
      }
      _organization_memory_assert_source_in_organization: {
        Args: {
          p_organization_id: string
          p_source_ai_interaction_id: string
          p_source_correction_event_id: string
          p_source_event_id: string
          p_source_validation_case_id: string
        }
        Returns: undefined
      }
      _organization_memory_confidence_from_signal: {
        Args: {
          p_dominance_ratio: number
          p_evidence_count: number
          p_is_user_confirmed?: boolean
        }
        Returns: number
      }
      _organization_memory_default_confidence_delta: {
        Args: { p_link_type: string }
        Returns: number
      }
      _organization_memory_mark_superseded_conflicts: {
        Args: {
          p_memory_category: string
          p_memory_type: string
          p_note?: string
          p_organization_id: string
          p_pattern_scope_key: string
          p_winner_memory_item_id: string
        }
        Returns: number
      }
      _organization_memory_upsert_derived_item: {
        Args: {
          p_confidence_score: number
          p_evidence_summary: Json
          p_memory_category: string
          p_memory_key: string
          p_memory_type: string
          p_memory_value: Json
          p_organization_id: string
          p_privacy_classification?: string
          p_summary: string
          p_title: string
          p_visibility_scope?: string
        }
        Returns: string
      }
      _platform_admin_role_rank: { Args: { p_role: string }; Returns: number }
      _pricing_worksheet_structure_summary: {
        Args: { p_worksheet_data: Json }
        Returns: Json
      }
      _sync_opportunity_pricing_workbook_sheet_name: {
        Args: { p_sheet_name: string; p_worksheet_data: Json }
        Returns: Json
      }
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
      _worksheet_event_classification_current_attempt: {
        Args: { p_classification_version: number; p_source_event_id: string }
        Returns: number
      }
      _worksheet_pricing_pattern_shadow_candidate_signature: {
        Args: {
          p_organization_id: string
          p_pattern_family: string
          p_pattern_type: string
          p_pattern_value: Json
          p_scope: Json
        }
        Returns: string
      }
      _worksheet_pricing_pattern_shadow_normalize_text: {
        Args: { p_value: string }
        Returns: string
      }
      _worksheet_pricing_pattern_shadow_pattern_value_signature: {
        Args: {
          p_pattern_family: string
          p_pattern_type: string
          p_pattern_value: Json
        }
        Returns: string
      }
      _worksheet_pricing_pattern_shadow_scope_signature: {
        Args: { p_scope: Json }
        Returns: string
      }
      _write_purchase_order_activity: {
        Args: {
          p_actor_user_id: string
          p_event_type: string
          p_field_name: string
          p_metadata?: Json
          p_new_value: Json
          p_old_value: Json
          p_organization_id: string
          p_project_id: string
          p_purchase_order_id: string
          p_summary: string
        }
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
      accept_retention_variance_contractual_override: {
        Args: { p_input: Json }
        Returns: Json
      }
      acquire_shared_concurrency_slot: {
        Args: { p_limit: number; p_route_key: string; p_subject_key: string }
        Returns: boolean
      }
      activate_retention_release_schedule: {
        Args: { p_input: Json }
        Returns: Json
      }
      activate_retention_release_schedule_phase4_pre_variance: {
        Args: { p_input: Json }
        Returns: Json
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
      add_retention_claim_allocation: {
        Args: {
          p_allocation_amount: number
          p_allocation_sequence?: number
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_originating_payment_claim_id: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      add_retention_legacy_release_allocation: {
        Args: { p_input: Json }
        Returns: Json
      }
      add_retention_schedule_origin: { Args: { p_input: Json }; Returns: Json }
      add_task_link: {
        Args: {
          p_linked_id: string
          p_linked_type: string
          p_metadata?: Json
          p_task_id: string
        }
        Returns: Json
      }
      apply_xero_bill_status_refresh: {
        Args: {
          p_amount_credited: number
          p_amount_due: number
          p_amount_paid: number
          p_document_id: string
          p_expected_external_document_id: string
          p_expected_tenant_id: string
          p_fully_paid_at: string
          p_job_id: string
          p_normalized_external_status: string
          p_organization_id: string
          p_provider_updated_at: string
          p_raw_external_status: string
          p_synced_at: string
        }
        Returns: Json
      }
      apply_xero_sales_invoice_payment_to_claim: {
        Args: {
          p_accounting_connection_id: string
          p_amount_credited: number
          p_amount_due: number
          p_amount_paid: number
          p_attention_message: string
          p_document_id: string
          p_expected_claim_updated_at: string
          p_external_document_id: string
          p_fully_paid_at: string
          p_normalized_external_status: string
          p_organization_id: string
          p_project_claim_id: string
          p_projected_claim_status: string
          p_projected_paid_amount: number
          p_provider_updated_at: string
          p_raw_external_status: string
          p_status_synced_at: string
          p_tenant_id: string
        }
        Returns: {
          claim_id: string
          claim_paid_amount: number
          claim_projection_applied: boolean
          claim_status: string
          document_id: string
        }[]
      }
      approve_retention_legacy_reconciliation_case: {
        Args: { p_input: Json }
        Returns: Json
      }
      approve_supplier_invoice_commercially: {
        Args: {
          p_accepted_variances?: Json
          p_approval_note?: string
          p_expected_finance_hash: string
          p_no_po_explanation?: string
          p_no_po_reason?: string
          p_organization_id: string
          p_supplier_invoice_id: string
        }
        Returns: string
      }
      archive_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: Json
      }
      assert_supplier_invoice_commercial_snapshot_completeness: {
        Args: { p_commercial_approval_id: string }
        Returns: undefined
      }
      assign_retention_variance: { Args: { p_input: Json }; Returns: Json }
      assign_task: {
        Args: { p_assigned_user_id: string; p_task_id: string }
        Returns: Json
      }
      attach_opportunity_commercial_history_to_project: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: {
          attached_commercial_item_count: number
          attached_quote_count: number
          attached_quote_line_count: number
        }[]
      }
      begin_cost_item_revision: {
        Args: { p_document_id: string; p_document_kind: string }
        Returns: string
      }
      build_time_sheet_entry_labour_line_description: {
        Args: {
          p_clock_in_at: string
          p_organization_id: string
          p_worker_name: string
        }
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
      can_access_material_import_storage_object: {
        Args: { object_path: string; p_permission_key: string }
        Returns: boolean
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
      can_insert_commercial_item_document_link: {
        Args: {
          p_commercial_item_id: string
          p_document_id: string
          p_document_kind: string
          p_document_line_id: string
          p_link_role: string
          p_organization_id: string
        }
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
      can_run_spec_finishes_once: {
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
      can_view_supplier_invoice_workflow: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: boolean
      }
      can_write_pricing_workbook_owner: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_project_id?: string
          p_quote_id?: string
          p_variation_id?: string
        }
        Returns: boolean
      }
      cancel_retention_claim_draft: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_reason: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      cancel_retention_release_schedule: {
        Args: { p_input: Json }
        Returns: Json
      }
      cancel_retention_release_schedule_phase4_pre_variance: {
        Args: { p_input: Json }
        Returns: Json
      }
      cancel_retention_reminder: { Args: { p_input: Json }; Returns: Json }
      cancel_supplier_invoice_xero_bill_export: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: Json
      }
      check_retention_variance_blocks: {
        Args: { p_origin_ids?: string[]; p_project_id: string }
        Returns: Json
      }
      claim_cost_construction_intelligence_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: {
          accounting_mapping_id: string | null
          ai_construction_intelligence: Json | null
          ai_model: string | null
          ai_prompt_version: number | null
          ai_provider: string | null
          amount: number | null
          classification_status: string
          classification_version: number
          created_at: string
          description: string
          document_context: Json
          error_code: string | null
          error_message: string | null
          event_payload: Json
          id: string
          idempotency_key: string
          organization_id: string
          processed_at: string | null
          project_id: string | null
          quantity: number | null
          rate: number | null
          source_id: string
          source_line_id: string | null
          source_type: string
          supplier_id: string | null
          supplier_name_snapshot: string | null
          tradesstack_cost_code: string
          tradesstack_cost_code_label: string
          unit: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cost_construction_intelligence_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_learning_review_batch: {
        Args: {
          p_container_type?: string
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_organization_memory_retirement_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_memory_id?: string
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_retention_variance_scan_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_worksheet_event_classification_batch: {
        Args: {
          p_classification_version?: number
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_worksheet_memory_evidence_pool_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_worksheet_memory_semantic_pool_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_worksheet_memory_synthesis_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_semantic_pool_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      claim_worksheet_mutation_evidence_v2_outbox_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_mutation_id: string
          created_at: string
          dead_lettered_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          next_worksheet: Json
          occurred_at: string
          opportunity_id: string
          organization_id: string
          previous_worksheet: Json
          processed_at: string | null
          processing_status: string
          project_id: string | null
          retry_after: string | null
          sheet_id: string
          sheet_name: string
          source: string
          trade_package: string | null
          updated_at: string
          user_id: string | null
          workbook_id: string
          workbook_name: string | null
          worksheet_id: string
          worksheet_name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "worksheet_mutation_evidence_v2_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_worksheet_pricing_pattern_evidence_processing_batch: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_organization_id?: string
          p_processing_run_id?: string
          p_source_event_ids?: string[]
          p_worker_id?: string
        }
        Returns: Json
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
      commercial_item_json_is_non_negative_integer_like: {
        Args: { p_value: Json }
        Returns: boolean
      }
      commercial_item_json_object_has_only_keys: {
        Args: { p_allowed_keys: string[]; p_object: Json }
        Returns: boolean
      }
      commercial_item_json_object_has_required_keys: {
        Args: { p_object: Json; p_required_keys: string[] }
        Returns: boolean
      }
      commercial_item_json_text_matches_regex: {
        Args: { p_pattern: string; p_value: Json }
        Returns: boolean
      }
      commercial_item_json_value_is_type: {
        Args: { p_allowed_types: string[]; p_value: Json }
        Returns: boolean
      }
      commit_ai_chat_quota_reservation: {
        Args: {
          p_response_chars: number
          p_tokens_used: number
          p_usage_id: string
        }
        Returns: boolean
      }
      complete_retention_release_schedule: {
        Args: { p_input: Json }
        Returns: Json
      }
      complete_retention_release_schedule_phase4_pre_variance: {
        Args: { p_input: Json }
        Returns: Json
      }
      complete_retention_reminder: { Args: { p_input: Json }; Returns: Json }
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
      confirm_retention_schedule_trigger: {
        Args: { p_input: Json }
        Returns: Json
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
      create_ai_interaction: { Args: { p_input: Json }; Returns: string }
      create_commercial_item: {
        Args: { p_input: Json }
        Returns: {
          created_at: string
          created_by: string
          description: string
          id: string
          last_source_changed_at: string
          last_source_checked_at: string
          opportunity_id: string
          organization_id: string
          project_id: string
          quantity: number
          rate: number
          snapshot_json: Json
          source_link_json: Json
          source_range: string
          source_sheet_id: string
          source_signature: string
          source_status: string
          source_type: string
          source_version: number
          source_workbook_id: string
          source_worksheet_id: string
          stale_reason_code: string
          total: number
          ucl_classification: string
          ucl_validation_status: string
          unit: string
          updated_at: string
          updated_by: string
        }[]
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
      create_retention_claim_draft: {
        Args: {
          p_correlation_id?: string
          p_due_date?: string
          p_issue_date?: string
          p_project_id: string
          p_reference?: string
          p_title?: string
        }
        Returns: Json
      }
      create_retention_legacy_reconciliation_case: {
        Args: { p_correlation_id?: string; p_project_id: string }
        Returns: Json
      }
      create_retention_release_schedule: {
        Args: { p_input: Json }
        Returns: Json
      }
      create_retention_reminder: { Args: { p_input: Json }; Returns: Json }
      create_task: { Args: { p_input: Json }; Returns: Json }
      create_task_attachment: {
        Args: { p_input: Json; p_task_id: string }
        Returns: Json
      }
      create_task_comment: {
        Args: { p_comment: string; p_metadata?: Json; p_task_id: string }
        Returns: Json
      }
      create_validation_case: { Args: { p_input: Json }; Returns: string }
      decide_supplier_invoice_site_review:
        | {
            Args: {
              p_accepted_variances?: Json
              p_allocation_id: string
              p_decision: string
              p_decision_id: string
              p_note: string
            }
            Returns: string
          }
        | {
            Args: {
              p_accepted_variances?: Json
              p_decision: string
              p_decision_id: string
              p_disputed_allocation_ids?: string[]
              p_note: string
            }
            Returns: string
          }
      default_trade_pack_monthly_limit: {
        Args: { plan_tier: string }
        Returns: number
      }
      delete_opportunity_pricing_workbook_sheet: {
        Args: {
          p_next_sheet_id?: string
          p_opportunity_id: string
          p_organization_id: string
          p_sheet_id: string
          p_user_id: string
          p_workbook_id: string
        }
        Returns: Json
      }
      delete_project_claim_safe: {
        Args: {
          p_claim_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: undefined
      }
      delete_supplier_invoice: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: Json
      }
      delete_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: Json
      }
      delete_task_comment: { Args: { p_comment_id: string }; Returns: Json }
      duplicate_opportunity_pricing_workbook: {
        Args: {
          p_opportunity_id: string
          p_organization_id: string
          p_user_id: string
          p_workbook_id: string
        }
        Returns: Json
      }
      enforce_shared_rate_limit: {
        Args: {
          p_limit: number
          p_route_key: string
          p_subject_key: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      enqueue_cost_construction_intelligence_event: {
        Args: { p_input: Json }
        Returns: Json
      }
      enqueue_learning_review_queue: {
        Args: {
          p_available_at?: string
          p_budget_snapshot?: Json
          p_container_type: string
          p_eligibility_snapshot?: Json
          p_max_attempts?: number
          p_organization_id: string
          p_priority?: number
          p_review_month: string
          p_scope_key?: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          budget_snapshot: Json
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          container_type: string
          created_at: string
          eligibility_snapshot: Json
          id: string
          last_completed_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_run_id: string | null
          max_attempts: number
          organization_id: string
          priority: number
          queue_state: string
          retry_after: string | null
          review_month: string
          scope_key: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "learning_review_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_organization_memory_retirement_queue: {
        Args: {
          p_limit?: number
          p_memory_id?: string
          p_organization_id?: string
        }
        Returns: Json
      }
      enqueue_retention_variance_scan_projects: {
        Args: {
          p_after_project_id?: string
          p_limit?: number
          p_organization_id?: string
        }
        Returns: Json
      }
      enqueue_worksheet_event_classification_queue: {
        Args: {
          p_classification_version?: number
          p_limit?: number
          p_organization_id?: string
        }
        Returns: Json
      }
      enqueue_worksheet_memory_evidence_pool_queue: {
        Args: { p_limit?: number; p_organization_id?: string }
        Returns: Json
      }
      enqueue_worksheet_memory_semantic_pool_queue: {
        Args: { p_limit?: number; p_organization_id?: string }
        Returns: Json
      }
      enqueue_worksheet_memory_synthesis_queue: {
        Args: {
          p_limit?: number
          p_organization_id?: string
          p_semantic_pool_id?: string
        }
        Returns: Json
      }
      enqueue_worksheet_mutation_evidence_v2_outbox: {
        Args: { p_input: Json }
        Returns: Json
      }
      enqueue_worksheet_pricing_pattern_evidence_processing: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      ensure_organization_membership: { Args: never; Returns: string }
      evaluate_retention_variances: {
        Args: {
          p_correlation_id?: string
          p_origin_ids?: string[]
          p_project_id: string
        }
        Returns: Json
      }
      finalize_cost_construction_intelligence_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_learning_review_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_organization_memory_retirement_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_retention_variance_scan_item: {
        Args: { p_input: Json }
        Returns: Json
      }
      finalize_worksheet_event_classification_claims: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_worksheet_memory_evidence_pool_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_worksheet_memory_semantic_pool_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_worksheet_memory_synthesis_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_worksheet_mutation_evidence_v2_outbox_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      finalize_worksheet_pricing_pattern_evidence_processing_batch: {
        Args: { p_inputs: Json }
        Returns: Json
      }
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
      get_commercial_item: {
        Args: { p_commercial_item_id: string }
        Returns: {
          created_at: string
          created_by: string
          description: string
          id: string
          last_source_changed_at: string
          last_source_checked_at: string
          opportunity_id: string
          organization_id: string
          project_id: string
          quantity: number
          rate: number
          snapshot_json: Json
          source_link_json: Json
          source_range: string
          source_sheet_id: string
          source_signature: string
          source_status: string
          source_type: string
          source_version: number
          source_workbook_id: string
          source_worksheet_id: string
          stale_reason_code: string
          total: number
          ucl_classification: string
          ucl_validation_status: string
          unit: string
          updated_at: string
          updated_by: string
        }[]
      }
      get_commercial_item_locked_metadata_internal: {
        Args: { p_commercial_item_id: string }
        Returns: {
          commercial_item_id: string
          locked_metadata_json: Json
        }[]
      }
      get_mobile_project_purchase_order_detail_v2: {
        Args: { p_project_id: string; p_purchase_order_id: string }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string
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
          requested_date: string
          status: string
          subtotal: number
          supplier_contact: string
          supplier_email_snapshot: string
          supplier_name_snapshot: string
          supplier_phone_snapshot: string
          total_purchase_order_price: number
          updated_at: string
        }[]
      }
      get_mobile_worker_project_purchase_order_detail: {
        Args: { p_project_id: string; p_purchase_order_id: string }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string
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
          requested_date: string
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
          expires_at: string
          file_kind: string
          file_name: string
          purchase_order_id: string
          source: string
          url: string
        }[]
      }
      get_organization_member_emails: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_organization_memory_context: {
        Args: { p_input: Json }
        Returns: Json
      }
      get_organization_retention_capability: {
        Args: never
        Returns: {
          capability_key: string
          created_at: string
          disabled_at: string
          disabled_by: string
          enabled: boolean
          enabled_at: string
          enabled_by: string
          organization_id: string
          updated_at: string
        }[]
      }
      get_project_claim_approved_variations_total: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: number
      }
      get_project_claim_base_quote_retention_percent_default: {
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
      get_project_dashboard_aggregate_before_xero_claim_payment: {
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
      get_project_purchase_order_mobile_edit_snapshot_v2: {
        Args: { p_project_id: string; p_purchase_order_id: string }
        Returns: {
          invoice_risk: Json
          lines: Json
          project_id: string
          purchase_order_id: string
          updated_at: string
        }[]
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
      get_project_retention_eligibility: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_retention_position_page: {
        Args: {
          p_after_claim_date?: string
          p_after_claim_id?: string
          p_after_created_at?: string
          p_diagnostic_codes?: string[]
          p_legacy_release?: boolean
          p_page_size?: number
          p_positive_retention?: boolean
          p_project_id: string
          p_statuses?: string[]
        }
        Returns: Json
      }
      get_project_retention_position_summary: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_retention_position_summary_phase2_pre_legacy_reconc: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_retention_workflow_state: {
        Args: { p_project_id: string }
        Returns: {
          changed_at: string
          changed_by: string
          created_at: string
          mode: string
          organization_id: string
          project_id: string
          updated_at: string
        }[]
      }
      get_retention_capability_events: {
        Args: { p_limit?: number; p_project_id?: string }
        Returns: {
          actor_user_id: string
          correlation_id: string
          event_type: string
          id: string
          metadata: Json
          new_state: string
          occurred_at: string
          organization_id: string
          previous_state: string
          project_id: string
          reason: string
        }[]
      }
      get_retention_claim: {
        Args: { p_retention_claim_id: string }
        Returns: Json
      }
      get_retention_claim_draft_origin_set_hash: {
        Args: { p_retention_claim_id: string }
        Returns: Json
      }
      get_retention_claim_events: {
        Args: { p_limit?: number; p_retention_claim_id: string }
        Returns: Json
      }
      get_retention_legacy_reconciliation_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      get_retention_legacy_reconciliation_events: {
        Args: { p_case_id: string; p_limit?: number }
        Returns: Json
      }
      get_retention_release_schedule: {
        Args: { p_schedule_id: string }
        Returns: Json
      }
      get_retention_reminder_events: {
        Args: { p_limit?: number; p_reminder_id: string }
        Returns: Json
      }
      get_retention_schedule_events: {
        Args: { p_limit?: number; p_schedule_id: string }
        Returns: Json
      }
      get_retention_variance: { Args: { p_variance_id: string }; Returns: Json }
      get_retention_variance_events: {
        Args: { p_limit?: number; p_variance_id: string }
        Returns: Json
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
      has_platform_admin_role: {
        Args: { required_role: string }
        Returns: boolean
      }
      invalidate_supplier_invoice_commercial_approval: {
        Args: {
          p_actor?: string
          p_reason: string
          p_source: string
          p_supplier_invoice_id: string
        }
        Returns: number
      }
      invalidate_supplier_invoice_role_workflow: {
        Args: { p_reason: string; p_supplier_invoice_id: string }
        Returns: undefined
      }
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
      is_mobile_worker_assigned_purchase_order: {
        Args: {
          p_organization_member_id: string
          p_project_id: string
          p_purchase_order_id: string
        }
        Returns: boolean
      }
      is_owner_of_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_safe_mobile_https_url: { Args: { p_url: string }; Returns: boolean }
      link_commercial_item_to_purchase_order_line: {
        Args: { p_input: Json }
        Returns: {
          commercial_item_id: string
          created_at: string
          created_by: string
          document_id: string
          document_kind: string
          document_line_id: string
          id: string
          link_role: string
          organization_id: string
          snapshot_at_link_json: Json
        }[]
      }
      link_commercial_item_to_quote_line: {
        Args: { p_input: Json }
        Returns: {
          commercial_item_id: string
          created_at: string
          created_by: string
          document_id: string
          document_kind: string
          document_line_id: string
          id: string
          link_role: string
          organization_id: string
          snapshot_at_link_json: Json
        }[]
      }
      link_commercial_item_to_variation_line: {
        Args: { p_input: Json }
        Returns: {
          commercial_item_id: string
          created_at: string
          created_by: string
          document_id: string
          document_kind: string
          document_line_id: string
          id: string
          link_role: string
          organization_id: string
          snapshot_at_link_json: Json
        }[]
      }
      link_organization_memory_evidence: {
        Args: { p_input: Json }
        Returns: string
      }
      list_classified_worksheet_memory_events: {
        Args: { p_limit?: number; p_organization_id?: string }
        Returns: Json
      }
      list_commercial_items_for_opportunity: {
        Args: { p_opportunity_id: string; p_organization_id: string }
        Returns: {
          created_at: string
          created_by: string
          description: string
          id: string
          last_source_changed_at: string
          last_source_checked_at: string
          opportunity_id: string
          organization_id: string
          project_id: string
          quantity: number
          rate: number
          snapshot_json: Json
          source_link_json: Json
          source_range: string
          source_sheet_id: string
          source_signature: string
          source_status: string
          source_type: string
          source_version: number
          source_workbook_id: string
          source_worksheet_id: string
          stale_reason_code: string
          total: number
          ucl_classification: string
          ucl_validation_status: string
          unit: string
          updated_at: string
          updated_by: string
        }[]
      }
      list_mobile_project_purchase_orders_v2: {
        Args: { p_project_id: string }
        Returns: {
          created_at: string
          due_date: string
          issued_to_label: string
          notes: string
          origin: string
          project_id: string
          purchase_order_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by: string
          requested_date: string
          status: string
          updated_at: string
        }[]
      }
      list_mobile_worker_project_purchase_orders: {
        Args: { p_project_id: string }
        Returns: {
          created_at: string
          due_date: string
          issued_to_label: string
          notes: string
          origin: string
          project_id: string
          purchase_order_id: string
          purchase_order_number: string
          purchase_order_title: string
          requested_by: string
          requested_date: string
          status: string
          updated_at: string
        }[]
      }
      list_pending_worksheet_event_classification_batch:
        | {
            Args: { p_classification_version?: number; p_limit?: number }
            Returns: Json
          }
        | {
            Args: {
              p_classification_version?: number
              p_limit?: number
              p_organization_id?: string
            }
            Returns: Json
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
      list_project_retention_claims: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
          p_project_id: string
        }
        Returns: Json
      }
      list_project_retention_legacy_reconciliation_cases: {
        Args: {
          p_before_sequence?: number
          p_limit?: number
          p_project_id: string
        }
        Returns: Json
      }
      list_project_retention_variances: {
        Args: {
          p_after_detected_at?: string
          p_after_id?: string
          p_blocking?: boolean
          p_limit?: number
          p_project_id: string
          p_states?: string[]
        }
        Returns: Json
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
      list_retention_release_schedules: {
        Args: {
          p_before_sequence?: number
          p_limit?: number
          p_project_id: string
        }
        Returns: Json
      }
      list_retention_reminders: {
        Args: { p_limit?: number; p_project_id: string; p_state?: string }
        Returns: Json
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
      mobile_mutate_project_purchase_order_manual_line_v2: {
        Args: {
          p_description: string
          p_expected_updated_at: string
          p_line_id: string
          p_operation: string
          p_project_id: string
          p_purchase_order_id: string
          p_quantity: number
          p_rate: number
          p_section: string
          p_unit: string
        }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string
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
          requested_date: string
          status: string
          subtotal: number
          supplier_contact: string
          supplier_email_snapshot: string
          supplier_name_snapshot: string
          supplier_phone_snapshot: string
          total_purchase_order_price: number
          updated_at: string
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
      normalize_supplier_invoice_number: {
        Args: { p_value: string }
        Returns: string
      }
      normalize_supported_tax_jurisdiction: {
        Args: { p_country: string }
        Returns: string
      }
      prepare_supplier_invoice_xero_bill_export: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: Json
      }
      process_project_time_sheet_rules: {
        Args: { p_max_rows?: number; p_now?: string; p_project_id?: string }
        Returns: {
          processed_auto_clock_outs: number
          processed_warnings: number
        }[]
      }
      process_retention_variance_scan_item: {
        Args: {
          p_claim_token: string
          p_correlation_id: string
          p_queue_id: string
        }
        Returns: Json
      }
      recalculate_project_claim_snapshots: {
        Args: { p_organization_id: string; p_project_id: string }
        Returns: undefined
      }
      recalculate_project_purchase_order_totals: {
        Args: { p_purchase_order_id: string }
        Returns: undefined
      }
      record_ai_interaction_validation: {
        Args: { p_input: Json }
        Returns: string
      }
      record_retention_capability_event: {
        Args: {
          p_actor_user_id: string
          p_correlation_id: string
          p_event_type: string
          p_metadata?: Json
          p_new_state: string
          p_organization_id: string
          p_previous_state: string
          p_project_id: string
          p_reason: string
        }
        Returns: string
      }
      record_retention_reminder_delivery_result: {
        Args: { p_input: Json }
        Returns: Json
      }
      record_retention_variance_corrective_evidence: {
        Args: { p_input: Json }
        Returns: Json
      }
      record_supplier_invoice_accounts_approval: {
        Args: {
          p_approval_note?: string
          p_expected_finance_hash: string
          p_site_review_submission_id: string
          p_supplier_invoice_id: string
        }
        Returns: string
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
      record_worksheet_event_classifications: {
        Args: { p_inputs: Json }
        Returns: Json
      }
      record_xero_bill_status_sync_error: {
        Args: {
          p_document_id: string
          p_job_id: string
          p_organization_id: string
          p_safe_error: string
        }
        Returns: undefined
      }
      refresh_retention_claim_eligibility_state: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_retention_claim_id: string
        }
        Returns: Json
      }
      refresh_retention_claim_eligibility_state_phase4_pre_variance: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_retention_claim_id: string
        }
        Returns: Json
      }
      refresh_retention_legacy_reconciliation_case: {
        Args: {
          p_case_id: string
          p_correlation_id?: string
          p_expected_revision: number
        }
        Returns: Json
      }
      reject_retention_legacy_reconciliation_case: {
        Args: { p_input: Json }
        Returns: Json
      }
      reject_supplier_invoice_commercially: {
        Args: {
          p_organization_id: string
          p_reason: string
          p_supplier_invoice_id: string
        }
        Returns: string
      }
      release_ai_chat_quota_reservation: {
        Args: { p_usage_id: string }
        Returns: boolean
      }
      release_purchase_order_commitment: {
        Args: {
          p_expected_remaining_amount: number
          p_note?: string
          p_organization_id: string
          p_purchase_order_id: string
          p_reason: string
        }
        Returns: string
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
      remove_retention_claim_allocation: {
        Args: {
          p_allocation_id: string
          p_correlation_id?: string
          p_expected_draft_revision: number
        }
        Returns: Json
      }
      remove_retention_legacy_release_allocation: {
        Args: {
          p_allocation_id: string
          p_correlation_id?: string
          p_expected_revision: number
        }
        Returns: Json
      }
      remove_retention_schedule_origin: {
        Args: { p_input: Json }
        Returns: Json
      }
      remove_task_link: { Args: { p_task_link_id: string }; Returns: Json }
      rename_opportunity_pricing_workbook: {
        Args: {
          p_next_name: string
          p_opportunity_id: string
          p_organization_id: string
          p_user_id: string
          p_workbook_id: string
        }
        Returns: Json
      }
      reopen_retention_variance: { Args: { p_input: Json }; Returns: Json }
      reopen_task: { Args: { p_task_id: string }; Returns: Json }
      reorder_client_notes: {
        Args: { p_client_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_retention_claim_allocations: {
        Args: {
          p_allocation_ids: string[]
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_retention_claim_id: string
        }
        Returns: Json
      }
      reorder_retention_schedule_origins: {
        Args: { p_input: Json }
        Returns: Json
      }
      repair_project_quote_opportunity_lineage: {
        Args: { p_project_quote_id: string }
        Returns: {
          mirrored_cost_item_count: number
          repaired_line_count: number
        }[]
      }
      repair_project_quote_source_opportunity_lineage: {
        Args: { p_organization_id: string; p_quote_id: string }
        Returns: {
          id: string
          source_opportunity_id: string
        }[]
      }
      repair_project_source_opportunity_lineage: {
        Args: { p_project_id: string }
        Returns: string
      }
      repair_supplier_invoice_allocation_tax: {
        Args: {
          p_dry_run?: boolean
          p_expected_finance_hash: string
          p_organization_id: string
          p_resolutions: Json
          p_resolver_version: string
          p_supplier_invoice_id: string
        }
        Returns: Json
      }
      replace_organization_memory_provenance_links: {
        Args: {
          p_organization_id: string
          p_organization_memory_item_id: string
          p_records: Json
        }
        Returns: Json
      }
      replace_worksheet_memory_semantic_pool_events: {
        Args: {
          p_organization_id: string
          p_records: Json
          p_semantic_pool_id: string
        }
        Returns: Json
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
      resolve_cost_item_financial_routing_defaults: {
        Args: {
          p_amount?: number
          p_category?: string
          p_description?: string
          p_item_type?: string
          p_organization_id: string
          p_origin_kind?: string
          p_project_id: string
          p_section?: string
          p_source_document_kind: string
          p_source_line_table?: string
          p_title?: string
        }
        Returns: {
          accounting_mapping_id: string
          financial_routing_confidence: number
          financial_routing_source: string
          review_reason: string
          review_status: string
          tradesstack_cost_code: number
          tradesstack_cost_code_label: string
        }[]
      }
      resolve_default_tradesstack_accounting_mapping: {
        Args: {
          p_organization_id: string
          p_project_id?: string
          p_tradesstack_cost_code: number
        }
        Returns: string
      }
      resolve_mobile_project_member_context_v2: {
        Args: { p_project_id: string }
        Returns: {
          organization_id: string
          organization_member_id: string
        }[]
      }
      resolve_mobile_worker_project_context: {
        Args: { p_project_id: string }
        Returns: {
          organization_id: string
          organization_member_id: string
        }[]
      }
      resolve_retention_variance: { Args: { p_input: Json }; Returns: Json }
      restore_task: { Args: { p_task_id: string }; Returns: Json }
      retire_purchase_order_line_cost_item: {
        Args: { p_cost_item_id: string }
        Returns: undefined
      }
      retry_supplier_invoice_xero_bill_export: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: Json
      }
      reverse_supplier_invoice_actual_cost_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_reversal_note?: string
          p_reversal_reason?: string
          p_supplier_invoice_id: string
        }
        Returns: {
          original_event_id: string
          project_id: string
          reversal_event_id: string
          successor_allocation_id: string
          supplier_invoice_id: string
        }[]
      }
      rollup_supplier_invoice_status_from_matches: {
        Args: { p_organization_id: string; p_supplier_invoice_id: string }
        Returns: undefined
      }
      run_organization_memory_derivation: {
        Args: { p_input?: Json }
        Returns: Json
      }
      run_retention_variance_scan_batch: {
        Args: {
          p_after_project_id?: string
          p_correlation_id?: string
          p_limit?: number
          p_organization_id?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      save_commercial_quote_draft: {
        Args: {
          p_acceptance_notes?: string
          p_assumptions?: string
          p_clarifications?: string
          p_client_email?: string
          p_client_name?: string
          p_client_phone?: string
          p_company_name?: string
          p_contact_person?: string
          p_contingency_amount?: number
          p_discount_amount?: number
          p_expected_updated_at?: string
          p_expiry_date?: string
          p_gst_percent?: number
          p_lead_time?: string
          p_line_items?: Json
          p_margin_percent?: number
          p_optional_items_notes?: string
          p_organization_id: string
          p_originating_opportunity_id: string
          p_payment_terms?: string
          p_project_id?: string
          p_project_name?: string
          p_quote_date?: string
          p_quote_id?: string
          p_quote_number?: string
          p_quote_title?: string
          p_retention_percent_default?: number
          p_scope_exclusions?: string
          p_scope_notes?: string
          p_site_address?: string
          p_status?: string
          p_terms_exclusions?: string
          p_terms_inclusions?: string
          p_validity_period?: string
        }
        Returns: {
          gst_amount: number
          id: string
          optional_subtotal: number
          originating_opportunity_id: string
          project_id: string
          status: string
          subtotal: number
          total_quote_price: number
          updated_at: string
        }[]
      }
      save_opportunity_pricing_workbook_active_sheet: {
        Args: {
          p_extracted_pricing_data?: Json
          p_name?: string
          p_opportunity_id: string
          p_organization_id: string
          p_pricing_summary?: Json
          p_save_request_id?: string
          p_sheet_id?: string
          p_trade_package?: string
          p_user_id: string
          p_version?: number
          p_workbook_id?: string
          p_worksheet_data?: Json
        }
        Returns: Json
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
      save_pricing_workbook_active_sheet: {
        Args: {
          p_extracted_pricing_data?: Json
          p_name?: string
          p_opportunity_id: string
          p_organization_id: string
          p_pricing_summary?: Json
          p_project_id?: string
          p_quote_id?: string
          p_save_request_id?: string
          p_sheet_id?: string
          p_trade_package?: string
          p_user_id?: string
          p_variation_id?: string
          p_version?: number
          p_workbook_id?: string
          p_worksheet_data?: Json
        }
        Returns: Json
      }
      save_project_claim_draft: {
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
      save_project_quote_draft: {
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
      save_retention_claim_draft_document: {
        Args: {
          p_correlation_id?: string
          p_due_date: string
          p_expected_draft_revision: number
          p_expected_eligibility_state_hash: string
          p_expected_origin_set_hash: string
          p_expected_position_state_hash: string
          p_issue_date: string
          p_lines: Json
          p_reference: string
          p_retention_claim_id: string
          p_title: string
        }
        Returns: Json
      }
      save_supplier_invoice_capture: {
        Args: {
          p_create?: boolean
          p_currency: string
          p_due_date: string
          p_invoice_date: string
          p_invoice_id: string
          p_invoice_number: string
          p_lines?: Json
          p_notes: string
          p_source: string
          p_subtotal: number
          p_supplier_id: string
          p_supplier_po_reference: string
          p_tax_total: number
          p_total: number
        }
        Returns: string
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
      select_due_retention_reminders: {
        Args: { p_limit?: number; p_worker_id?: string }
        Returns: Json
      }
      set_organization_retention_capability: {
        Args: {
          p_correlation_id?: string
          p_enabled: boolean
          p_reason: string
        }
        Returns: {
          capability_key: string
          changed: boolean
          disabled_at: string
          disabled_by: string
          enabled: boolean
          enabled_at: string
          enabled_by: string
          error_code: string
          organization_id: string
          succeeded: boolean
          updated_at: string
        }[]
      }
      set_supplier_invoice_purchase_order_match: {
        Args: {
          p_purchase_order_id: string
          p_remove?: boolean
          p_supplier_invoice_id: string
        }
        Returns: string
      }
      snooze_retention_reminder: { Args: { p_input: Json }; Returns: Json }
      soft_delete_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: Json
      }
      submit_retention_claim: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_expected_eligibility_state_hash?: string
          p_expected_position_state_hash: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      submit_retention_claim_phase3_pre_schedule: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_expected_position_state_hash: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      submit_retention_claim_phase4_pre_variance: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_expected_eligibility_state_hash?: string
          p_expected_position_state_hash: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      submit_retention_claim_phase5_pre_legacy_reconciliation: {
        Args: {
          p_correlation_id?: string
          p_expected_draft_revision: number
          p_expected_eligibility_state_hash?: string
          p_expected_position_state_hash: string
          p_retention_claim_id: string
        }
        Returns: Json
      }
      submit_retention_legacy_reconciliation_case: {
        Args: { p_input: Json }
        Returns: Json
      }
      submit_supplier_invoice_for_site_review: {
        Args: { p_expected_finance_hash: string; p_supplier_invoice_id: string }
        Returns: string
      }
      supersede_previous_cost_items: {
        Args: {
          p_document_id: string
          p_document_kind: string
          p_source_revision_key: string
        }
        Returns: number
      }
      supplier_invoice_finance_version_hash: {
        Args: { p_invoice_id: string }
        Returns: string
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
      transition_ai_interaction_lifecycle: {
        Args: { p_input: Json }
        Returns: string
      }
      transition_project_retention_workflow_mode: {
        Args: {
          p_correlation_id?: string
          p_new_mode: string
          p_project_id: string
          p_reason: string
        }
        Returns: {
          changed: boolean
          changed_at: string
          changed_by: string
          error_code: string
          mode: string
          organization_id: string
          previous_mode: string
          project_id: string
          succeeded: boolean
          updated_at: string
        }[]
      }
      update_mobile_project_purchase_order_header_v2: {
        Args: {
          p_due_date: string
          p_expected_updated_at: string
          p_notes: string
          p_project_id: string
          p_purchase_order_id: string
          p_requested_by: string
          p_requested_date: string
        }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string
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
          requested_date: string
          status: string
          subtotal: number
          supplier_contact: string
          supplier_email_snapshot: string
          supplier_name_snapshot: string
          supplier_phone_snapshot: string
          total_purchase_order_price: number
          updated_at: string
        }[]
      }
      update_mobile_project_purchase_order_status_v2: {
        Args: {
          p_expected_updated_at: string
          p_project_id: string
          p_purchase_order_id: string
          p_status: string
        }
        Returns: {
          attachments: Json
          created_at: string
          due_date: string
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
          requested_date: string
          status: string
          subtotal: number
          supplier_contact: string
          supplier_email_snapshot: string
          supplier_name_snapshot: string
          supplier_phone_snapshot: string
          total_purchase_order_price: number
          updated_at: string
        }[]
      }
      update_organization_settings: {
        Args: {
          p_address_line_1?: string
          p_address_line_2?: string
          p_bank_account_details?: string
          p_brand_accent_color?: string
          p_brand_primary_color?: string
          p_business_number?: string
          p_city?: string
          p_construction_profile?: string
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
          bank_account_details: string | null
          construction_profile: string | null
          created_at: string
          created_by: string
          id: string
          logo_path: string | null
          name: string
          tax_registration_status: string
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
      update_organization_tax_registration_status: {
        Args: { p_organization_id: string; p_tax_registration_status: string }
        Returns: string
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
      update_retention_claim_allocation: {
        Args: {
          p_allocation_amount: number
          p_allocation_id: string
          p_correlation_id?: string
          p_expected_draft_revision: number
        }
        Returns: Json
      }
      update_retention_claim_draft: {
        Args: {
          p_correlation_id?: string
          p_due_date: string
          p_expected_draft_revision: number
          p_issue_date: string
          p_reference: string
          p_refresh_position?: boolean
          p_retention_claim_id: string
          p_title: string
        }
        Returns: Json
      }
      update_retention_legacy_release_allocation: {
        Args: { p_input: Json }
        Returns: Json
      }
      update_retention_release_schedule_draft: {
        Args: { p_input: Json }
        Returns: Json
      }
      update_retention_reminder: { Args: { p_input: Json }; Returns: Json }
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
      upsert_organization_memory_item: {
        Args: { p_input: Json }
        Returns: string
      }
      upsert_project_quote_cost_items_from_opportunity: {
        Args: {
          p_opportunity_quote_id: string
          p_organization_id: string
          p_project_quote_id: string
        }
        Returns: number
      }
      upsert_worksheet_pricing_pattern_shadow_candidate: {
        Args: { p_input: Json }
        Returns: Json
      }
      validate_commercial_item_locked_metadata_json: {
        Args: { p_locked_metadata: Json }
        Returns: boolean
      }
      validate_commercial_item_snapshot_json: {
        Args: { p_snapshot: Json }
        Returns: boolean
      }
      validate_commercial_item_source_link_json: {
        Args: { p_source_link: Json }
        Returns: boolean
      }
      write_correction_event: { Args: { p_input: Json }; Returns: string }
      write_intelligence_event: { Args: { p_input: Json }; Returns: string }
      write_intelligence_events: { Args: { p_events: Json }; Returns: Json }
      write_worksheet_mutation_outbox_intelligence_events: {
        Args: { p_events: Json }
        Returns: Json
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
