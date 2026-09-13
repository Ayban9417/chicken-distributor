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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_prices: {
        Row: {
          active: boolean
          class_type_id: string | null
          code_id: string | null
          created_at: string
          customer_id: string
          id: string
          product_id: string
          selling_price_per_kg: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          class_type_id?: string | null
          code_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          product_id: string
          selling_price_per_kg: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          class_type_id?: string | null
          code_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          product_id?: string
          selling_price_per_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_prices_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          contact_person: string | null
          created_at: string
          credit_limit: number | null
          customer_type: string
          id: string
          mobile: string | null
          name: string
          organization_id: string
          payment_terms_days: number | null
          payment_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_type?: string
          id?: string
          mobile?: string | null
          name: string
          organization_id: string
          payment_terms_days?: number | null
          payment_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_type?: string
          id?: string
          mobile?: string | null
          name?: string
          organization_id?: string
          payment_terms_days?: number | null
          payment_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_cash_reports: {
        Row: {
          actual_cash_remittance: number
          bank_collected: number
          cash_collected: number
          cash_paid_expenses: number
          client_request_id: string
          created_at: string
          difference: number
          expected_cash_remittance: number
          explanation: string | null
          gcash_collected: number
          id: string
          locked_at: string | null
          organization_id: string
          report_date: string
          salesman_user_id: string
          source_snapshot: Json
          status: string
          submitted_at: string
        }
        Insert: {
          actual_cash_remittance: number
          bank_collected: number
          cash_collected: number
          cash_paid_expenses: number
          client_request_id: string
          created_at?: string
          difference: number
          expected_cash_remittance: number
          explanation?: string | null
          gcash_collected: number
          id?: string
          locked_at?: string | null
          organization_id: string
          report_date: string
          salesman_user_id: string
          source_snapshot: Json
          status?: string
          submitted_at?: string
        }
        Update: {
          actual_cash_remittance?: number
          bank_collected?: number
          cash_collected?: number
          cash_paid_expenses?: number
          client_request_id?: string
          created_at?: string
          difference?: number
          expected_cash_remittance?: number
          explanation?: string | null
          gcash_collected?: number
          id?: string
          locked_at?: string | null
          organization_id?: string
          report_date?: string
          salesman_user_id?: string
          source_snapshot?: Json
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_cash_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_cash_reports_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discrepancies: {
        Row: {
          amount_difference: number | null
          created_at: string
          description: string
          id: string
          organization_id: string
          quantity_difference: number | null
          related_entity_id: string | null
          related_entity_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          salesman_user_id: string | null
          severity: string
          status: string
          type: string
        }
        Insert: {
          amount_difference?: number | null
          created_at?: string
          description: string
          id?: string
          organization_id: string
          quantity_difference?: number | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          salesman_user_id?: string | null
          severity?: string
          status?: string
          type: string
        }
        Update: {
          amount_difference?: number | null
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          quantity_difference?: number | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          salesman_user_id?: string | null
          severity?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "discrepancies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approval_status: string
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
          organization_id: string
          payment_source: string
          salesman_user_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approval_status?: string
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date: string
          id?: string
          organization_id: string
          payment_source: string
          salesman_user_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_status?: string
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
          organization_id?: string
          payment_source?: string
          salesman_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          class_type_id: string | null
          code_id: string | null
          cost_per_kg: number
          created_at: string
          id: string
          organization_id: string
          original_quantity_kg: number
          plant_id: string
          product_id: string
          stock_trip_line_id: string
        }
        Insert: {
          class_type_id?: string | null
          code_id?: string | null
          cost_per_kg: number
          created_at?: string
          id?: string
          organization_id: string
          original_quantity_kg: number
          plant_id: string
          product_id: string
          stock_trip_line_id: string
        }
        Update: {
          class_type_id?: string | null
          code_id?: string | null
          cost_per_kg?: number
          created_at?: string
          id?: string
          organization_id?: string
          original_quantity_kg?: number
          plant_id?: string
          product_id?: string
          stock_trip_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_stock_trip_line_id_fkey"
            columns: ["stock_trip_line_id"]
            isOneToOne: true
            referencedRelation: "stock_trip_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string
          effective_date: string
          from_location_type: string
          from_salesman_user_id: string | null
          id: string
          inventory_lot_id: string
          movement_type: string
          notes: string | null
          organization_id: string
          quantity_kg: number
          reference_id: string
          reference_line_id: string
          reference_type: string
          to_location_type: string
          to_salesman_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_date: string
          from_location_type: string
          from_salesman_user_id?: string | null
          id?: string
          inventory_lot_id: string
          movement_type: string
          notes?: string | null
          organization_id: string
          quantity_kg: number
          reference_id: string
          reference_line_id: string
          reference_type: string
          to_location_type: string
          to_salesman_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_date?: string
          from_location_type?: string
          from_salesman_user_id?: string | null
          id?: string
          inventory_lot_id?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          quantity_kg?: number
          reference_id?: string
          reference_line_id?: string
          reference_type?: string
          to_location_type?: string
          to_salesman_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_from_salesman_user_id_fkey"
            columns: ["from_salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "company_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "salesman_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_to_salesman_user_id_fkey"
            columns: ["to_salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          active: boolean
          created_at: string
          id: string
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "collectibles"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_request_id: string
          created_at: string
          created_by: string
          customer_id: string
          id: string
          method: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_number: string
          reference_number: string | null
          salesman_user_id: string | null
          verification_status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          client_request_id: string
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
          method: string
          notes?: string | null
          organization_id: string
          payment_date: string
          payment_number: string
          reference_number?: string | null
          salesman_user_id?: string | null
          verification_status: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          client_request_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          method?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_number?: string
          reference_number?: string | null
          salesman_user_id?: string | null
          verification_status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          allowances: number
          base_pay: number
          created_at: string
          deductions: number
          gross_pay: number
          id: string
          net_pay: number
          overtime_minutes: number
          overtime_pay: number
          payroll_period_id: string
          regular_minutes: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowances?: number
          base_pay?: number
          created_at?: string
          deductions?: number
          gross_pay: number
          id?: string
          net_pay: number
          overtime_minutes?: number
          overtime_pay?: number
          payroll_period_id: string
          regular_minutes?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowances?: number
          base_pay?: number
          created_at?: string
          deductions?: number
          gross_pay?: number
          id?: string
          net_pay?: number
          overtime_minutes?: number
          overtime_pay?: number
          payroll_period_id?: string
          regular_minutes?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          created_by: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_product_class_types: {
        Row: {
          active: boolean
          class_type: string
          created_at: string
          display_name: string | null
          id: string
          plant_product_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          class_type: string
          created_at?: string
          display_name?: string | null
          id?: string
          plant_product_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          class_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          plant_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_product_class_types_plant_product_id_fkey"
            columns: ["plant_product_id"]
            isOneToOne: false
            referencedRelation: "plant_products"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_product_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_name: string | null
          id: string
          plant_product_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_name?: string | null
          id?: string
          plant_product_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_name?: string | null
          id?: string
          plant_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_product_codes_plant_product_id_fkey"
            columns: ["plant_product_id"]
            isOneToOne: false
            referencedRelation: "plant_products"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_products: {
        Row: {
          active: boolean
          allows_free_from_plant: boolean
          created_at: string
          id: string
          plant_id: string
          product_id: string
          updated_at: string
          uses_bags: boolean
          uses_class_types: boolean
          uses_head_count: boolean
          uses_size_codes: boolean
        }
        Insert: {
          active?: boolean
          allows_free_from_plant?: boolean
          created_at?: string
          id?: string
          plant_id: string
          product_id: string
          updated_at?: string
          uses_bags?: boolean
          uses_class_types?: boolean
          uses_head_count?: boolean
          uses_size_codes?: boolean
        }
        Update: {
          active?: boolean
          allows_free_from_plant?: boolean
          created_at?: string
          id?: string
          plant_id?: string
          product_id?: string
          updated_at?: string
          uses_bags?: boolean
          uses_class_types?: boolean
          uses_head_count?: boolean
          uses_size_codes?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plant_products_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      plants: {
        Row: {
          accent: string | null
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          short_code: string
          updated_at: string
        }
        Insert: {
          accent?: string | null
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          short_code: string
          updated_at?: string
        }
        Update: {
          accent?: string | null
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          short_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receiving_receipt_lines: {
        Row: {
          bags: number | null
          created_at: string
          head_count: number | null
          id: string
          inventory_lot_id: string
          quantity_kg: number
          receipt_id: string
        }
        Insert: {
          bags?: number | null
          created_at?: string
          head_count?: number | null
          id?: string
          inventory_lot_id: string
          quantity_kg: number
          receipt_id: string
        }
        Update: {
          bags?: number | null
          created_at?: string
          head_count?: number | null
          id?: string
          inventory_lot_id?: string
          quantity_kg?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "company_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "receiving_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "salesman_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "receiving_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "receiving_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receiving_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_receipts: {
        Row: {
          client_request_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          receipt_number: string
          salesman_user_id: string
        }
        Insert: {
          client_request_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          receipt_number: string
          salesman_user_id: string
        }
        Update: {
          client_request_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          receipt_number?: string
          salesman_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_receipts_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          acquisition_cost_per_kg: number
          class_type_id: string | null
          code_id: string | null
          created_at: string
          default_price: number | null
          id: string
          inventory_lot_id: string
          line_cogs: number
          line_gross_profit: number | null
          line_sales: number
          price_override: boolean
          product_id: string
          quantity_kg: number
          sale_id: string
          selling_price_per_kg: number
        }
        Insert: {
          acquisition_cost_per_kg: number
          class_type_id?: string | null
          code_id?: string | null
          created_at?: string
          default_price?: number | null
          id?: string
          inventory_lot_id: string
          line_cogs: number
          line_gross_profit?: number | null
          line_sales: number
          price_override?: boolean
          product_id: string
          quantity_kg: number
          sale_id: string
          selling_price_per_kg: number
        }
        Update: {
          acquisition_cost_per_kg?: number
          class_type_id?: string | null
          code_id?: string | null
          created_at?: string
          default_price?: number | null
          id?: string
          inventory_lot_id?: string
          line_cogs?: number
          line_gross_profit?: number | null
          line_sales?: number
          price_override?: boolean
          product_id?: string
          quantity_kg?: number
          sale_id?: string
          selling_price_per_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "company_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "salesman_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "sale_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "collectibles"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_request_id: string
          created_at: string
          created_by: string
          customer_id: string
          gross_profit: number | null
          gross_sales: number
          id: string
          net_sales: number
          notes: string | null
          organization_id: string
          sale_date: string
          sales_deductions: number
          salesman_user_id: string
          status: string
          subtotal: number
          total_cogs: number
          trust_receipt_number: string
          updated_at: string
        }
        Insert: {
          client_request_id: string
          created_at?: string
          created_by: string
          customer_id: string
          gross_profit?: number | null
          gross_sales: number
          id?: string
          net_sales: number
          notes?: string | null
          organization_id: string
          sale_date: string
          sales_deductions?: number
          salesman_user_id: string
          status?: string
          subtotal: number
          total_cogs: number
          trust_receipt_number: string
          updated_at?: string
        }
        Update: {
          client_request_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          gross_profit?: number | null
          gross_sales?: number
          id?: string
          net_sales?: number
          notes?: string | null
          organization_id?: string
          sale_date?: string
          sales_deductions?: number
          salesman_user_id?: string
          status?: string
          subtotal?: number
          total_cogs?: number
          trust_receipt_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_trip_lines: {
        Row: {
          acquisition_type: string
          bags: number | null
          class_type_id: string | null
          code_id: string | null
          cost_per_kg: number
          created_at: string
          head_count: number | null
          id: string
          plant_product_id: string
          quantity_kg: number
          stock_trip_id: string
          total_acquisition_cost: number | null
        }
        Insert: {
          acquisition_type: string
          bags?: number | null
          class_type_id?: string | null
          code_id?: string | null
          cost_per_kg: number
          created_at?: string
          head_count?: number | null
          id?: string
          plant_product_id: string
          quantity_kg: number
          stock_trip_id: string
          total_acquisition_cost?: number | null
        }
        Update: {
          acquisition_type?: string
          bags?: number | null
          class_type_id?: string | null
          code_id?: string | null
          cost_per_kg?: number
          created_at?: string
          head_count?: number | null
          id?: string
          plant_product_id?: string
          quantity_kg?: number
          stock_trip_id?: string
          total_acquisition_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_trip_lines_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trip_lines_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trip_lines_plant_product_id_fkey"
            columns: ["plant_product_id"]
            isOneToOne: false
            referencedRelation: "plant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trip_lines_stock_trip_id_fkey"
            columns: ["stock_trip_id"]
            isOneToOne: false
            referencedRelation: "company_stock_summary"
            referencedColumns: ["stock_trip_id"]
          },
          {
            foreignKeyName: "stock_trip_lines_stock_trip_id_fkey"
            columns: ["stock_trip_id"]
            isOneToOne: false
            referencedRelation: "salesman_stock_summary"
            referencedColumns: ["stock_trip_id"]
          },
          {
            foreignKeyName: "stock_trip_lines_stock_trip_id_fkey"
            columns: ["stock_trip_id"]
            isOneToOne: false
            referencedRelation: "stock_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trip_lines_stock_trip_id_fkey"
            columns: ["stock_trip_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_summary"
            referencedColumns: ["stock_trip_id"]
          },
        ]
      }
      stock_trips: {
        Row: {
          client_request_id: string
          created_at: string
          created_by: string
          delivery_note: string | null
          id: string
          notes: string | null
          organization_id: string
          plant_id: string
          reference_number: string | null
          status: string
          trip_date: string
          trip_number: string
          updated_at: string
        }
        Insert: {
          client_request_id: string
          created_at?: string
          created_by: string
          delivery_note?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          plant_id: string
          reference_number?: string | null
          status?: string
          trip_date: string
          trip_number: string
          updated_at?: string
        }
        Update: {
          client_request_id?: string
          created_at?: string
          created_by?: string
          delivery_note?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          plant_id?: string
          reference_number?: string | null
          status?: string
          trip_date?: string
          trip_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_trips_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          break_minutes: number
          created_at: string
          id: string
          organization_id: string
          time_in: string
          time_out: string | null
          total_minutes: number | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          id?: string
          organization_id: string
          time_in: string
          time_out?: string | null
          total_minutes?: number | null
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          break_minutes?: number
          created_at?: string
          id?: string
          organization_id?: string
          time_in?: string
          time_out?: string | null
          total_minutes?: number | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_receipt_lines: {
        Row: {
          bags: number | null
          created_at: string
          head_count: number | null
          id: string
          inventory_lot_id: string
          quantity_kg: number
          receipt_id: string
        }
        Insert: {
          bags?: number | null
          created_at?: string
          head_count?: number | null
          id?: string
          inventory_lot_id: string
          quantity_kg: number
          receipt_id: string
        }
        Update: {
          bags?: number | null
          created_at?: string
          head_count?: number | null
          id?: string
          inventory_lot_id?: string
          quantity_kg?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "company_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "transfer_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "salesman_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "transfer_receipt_lines_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock_summary"
            referencedColumns: ["inventory_lot_id"]
          },
          {
            foreignKeyName: "transfer_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "transfer_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_receipts: {
        Row: {
          client_request_id: string
          created_at: string
          created_by: string
          from_salesman_user_id: string
          id: string
          notes: string | null
          organization_id: string
          receipt_number: string
          to_salesman_user_id: string
        }
        Insert: {
          client_request_id: string
          created_at?: string
          created_by: string
          from_salesman_user_id: string
          id?: string
          notes?: string | null
          organization_id: string
          receipt_number: string
          to_salesman_user_id: string
        }
        Update: {
          client_request_id?: string
          created_at?: string
          created_by?: string
          from_salesman_user_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          receipt_number?: string
          to_salesman_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_receipts_from_salesman_user_id_fkey"
            columns: ["from_salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_receipts_to_salesman_user_id_fkey"
            columns: ["to_salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_maintenance: {
        Row: {
          created_at: string
          created_by: string
          id: string
          maintenance_type: string
          mileage: number
          next_due_date: string | null
          next_due_mileage: number | null
          notes: string | null
          service_date: string
          truck_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          maintenance_type: string
          mileage: number
          next_due_date?: string | null
          next_due_mileage?: number | null
          notes?: string | null
          service_date: string
          truck_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          maintenance_type?: string
          mileage?: number
          next_due_date?: string | null
          next_due_mileage?: number | null
          notes?: string | null
          service_date?: string
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_maintenance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_maintenance_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_renewals: {
        Row: {
          created_at: string
          created_by: string
          id: string
          next_renewal_date: string
          notes: string | null
          renewal_date: string
          truck_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          next_renewal_date: string
          notes?: string | null
          renewal_date: string
          truck_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          next_renewal_date?: string
          notes?: string | null
          renewal_date?: string
          truck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_renewals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_renewals_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trucks: {
        Row: {
          active: boolean
          created_at: string
          current_mileage: number
          id: string
          lto_registration_expiry: string | null
          make_model: string
          organization_id: string
          plate_number: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_mileage?: number
          id?: string
          lto_registration_expiry?: string | null
          make_model: string
          organization_id: string
          plate_number: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          current_mileage?: number
          id?: string
          lto_registration_expiry?: string | null
          make_model?: string
          organization_id?: string
          plate_number?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trucks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      collectibles: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          net_sales: number | null
          organization_id: string | null
          outstanding_balance: number | null
          payment_terms_days: number | null
          sale_date: string | null
          sale_id: string | null
          salesman_user_id: string | null
          trust_receipt_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_stock_summary: {
        Row: {
          available_quantity_kg: number | null
          class_type_id: string | null
          code_id: string | null
          cost_per_kg: number | null
          inventory_cost_value: number | null
          inventory_lot_id: string | null
          organization_id: string | null
          plant_id: string | null
          plant_name: string | null
          product_id: string | null
          product_name: string | null
          stock_trip_id: string | null
          trip_date: string | null
          trip_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_balances: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          organization_id: string | null
          outstanding_balance: number | null
          total_payments: number | null
          total_sales: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger_entries: {
        Row: {
          created_at: string | null
          credit: number | null
          customer_id: string | null
          debit: number | null
          entry_date: string | null
          entry_id: string | null
          entry_type: string | null
          organization_id: string | null
          reference_number: string | null
        }
        Relationships: []
      }
      daily_payment_summary: {
        Row: {
          bank: number | null
          cash: number | null
          gcash: number | null
          organization_id: string | null
          payment_count: number | null
          payment_date: string | null
          salesman_user_id: string | null
          total_payments: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summary: {
        Row: {
          cogs: number | null
          gross_profit: number | null
          gross_sales: number | null
          net_sales: number | null
          organization_id: string | null
          sale_count: number | null
          sale_date: string | null
          sales_deductions: number | null
          salesman_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_salesman_user_id_fkey"
            columns: ["salesman_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profitability_by_plant: {
        Row: {
          cogs: number | null
          gross_margin_percent: number | null
          gross_profit: number | null
          net_sales: number | null
          organization_id: string | null
          plant_id: string | null
          plant_name: string | null
          quantity_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profitability_by_product: {
        Row: {
          cogs: number | null
          gross_margin_percent: number | null
          gross_profit: number | null
          net_sales: number | null
          organization_id: string | null
          product_id: string | null
          product_name: string | null
          quantity_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_by_plant: {
        Row: {
          cogs: number | null
          gross_profit: number | null
          gross_sales: number | null
          organization_id: string | null
          plant_id: string | null
          plant_name: string | null
          quantity_kg: number | null
          sale_count: number | null
          sale_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_by_product: {
        Row: {
          cogs: number | null
          gross_profit: number | null
          gross_sales: number | null
          organization_id: string | null
          product_id: string | null
          product_name: string | null
          quantity_kg: number | null
          sale_count: number | null
          sale_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      salesman_stock_summary: {
        Row: {
          available_quantity_kg: number | null
          category: string | null
          class_type: string | null
          class_type_id: string | null
          code_id: string | null
          cost_per_kg: number | null
          inventory_cost_value: number | null
          inventory_lot_id: string | null
          organization_id: string | null
          plant_id: string | null
          plant_name: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          salesman_name: string | null
          salesman_user_id: string | null
          stock_trip_id: string | null
          trip_date: string | null
          trip_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock_summary: {
        Row: {
          available_quantity_kg: number | null
          category: string | null
          class_type: string | null
          class_type_id: string | null
          code_id: string | null
          cost_per_kg: number | null
          inventory_cost_value: number | null
          inventory_lot_id: string | null
          organization_id: string | null
          original_quantity_kg: number | null
          plant_id: string | null
          plant_name: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          stock_trip_id: string | null
          trip_date: string | null
          trip_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "plant_product_class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "plant_product_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_sale: {
        Args: {
          p_client_request_id: string
          p_customer_id: string
          p_initial_payment?: Json
          p_lines: Json
          p_notes?: string
          p_organization_id: string
          p_sale_date: string
          p_sales_deductions?: number
          p_salesman_user_id: string
          p_trust_receipt_number: string
        }
        Returns: Json
      }
      create_stock_trip: {
        Args: {
          p_client_request_id: string
          p_delivery_note?: string
          p_lines: Json
          p_notes?: string
          p_organization_id: string
          p_plant_id: string
          p_reference_number?: string
          p_trip_date: string
        }
        Returns: Json
      }
      record_payment: {
        Args: {
          p_amount: number
          p_client_request_id: string
          p_customer_id: string
          p_method: string
          p_notes?: string
          p_organization_id: string
          p_payment_date: string
          p_reference_number?: string
          p_salesman_user_id?: string
          p_target_sale_id?: string
        }
        Returns: Json
      }
      submit_dcr: {
        Args: {
          p_actual_cash_remittance: number
          p_client_request_id: string
          p_explanation?: string
          p_organization_id: string
          p_report_date: string
          p_salesman_user_id: string
        }
        Returns: Json
      }
      transfer_salesman_to_salesman: {
        Args: {
          p_client_request_id: string
          p_effective_date: string
          p_from_salesman_user_id: string
          p_lines: Json
          p_notes?: string
          p_organization_id: string
          p_to_salesman_user_id: string
        }
        Returns: Json
      }
      transfer_warehouse_to_salesman: {
        Args: {
          p_client_request_id: string
          p_effective_date: string
          p_lines: Json
          p_notes?: string
          p_organization_id: string
          p_salesman_user_id: string
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
