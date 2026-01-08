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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_logs: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_email: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_email: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          order_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          order_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          order_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          page_path: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          page_path?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          page_path?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      bundle_components: {
        Row: {
          bundle_product_id: string
          component_product_id: string
          created_at: string | null
          has_flavor_selection: boolean | null
          id: string
          quantity: number | null
          required_flavors: number | null
          total_units: number | null
          units_per_flavor: number | null
          updated_at: string | null
        }
        Insert: {
          bundle_product_id: string
          component_product_id: string
          created_at?: string | null
          has_flavor_selection?: boolean | null
          id?: string
          quantity?: number | null
          required_flavors?: number | null
          total_units?: number | null
          units_per_flavor?: number | null
          updated_at?: string | null
        }
        Update: {
          bundle_product_id?: string
          component_product_id?: string
          created_at?: string | null
          has_flavor_selection?: boolean | null
          id?: string
          quantity?: number | null
          required_flavors?: number | null
          total_units?: number | null
          units_per_flavor?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_components_bundle_product_id_fkey"
            columns: ["bundle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          last_order_date: string | null
          name: string
          phone: string | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_order_date?: string | null
          name: string
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_order_date?: string | null
          name?: string
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      delivery_photos: {
        Row: {
          created_at: string | null
          driver_id: string | null
          id: string
          image_url: string
          order_id: string
          photo_type: Database["public"]["Enums"]["delivery_photo_type"]
          taken_at: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id?: string | null
          id?: string
          image_url: string
          order_id: string
          photo_type: Database["public"]["Enums"]["delivery_photo_type"]
          taken_at?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string | null
          id?: string
          image_url?: string
          order_id?: string
          photo_type?: Database["public"]["Enums"]["delivery_photo_type"]
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_photos_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_earnings: {
        Row: {
          created_at: string | null
          delivery_fee: number
          distance_km: number | null
          driver_id: string
          id: string
          order_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_fee?: number
          distance_km?: number | null
          driver_id: string
          id?: string
          order_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_fee?: number
          distance_km?: number | null
          driver_id?: string
          id?: string
          order_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_earnings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          driver_id: string
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          order_id: string | null
          title: string
          type: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          driver_id: string
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          order_id?: string | null
          title: string
          type?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          driver_id?: string
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          order_id?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payment_info: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string | null
          created_at: string | null
          driver_id: string
          id: string
          is_default: boolean | null
          payment_method: string
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name?: string | null
          created_at?: string | null
          driver_id: string
          id?: string
          is_default?: boolean | null
          payment_method: string
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string | null
          created_at?: string | null
          driver_id?: string
          id?: string
          is_default?: boolean | null
          payment_method?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_payment_info_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payouts: {
        Row: {
          account_details: Json
          admin_notes: string | null
          amount: number
          created_at: string | null
          driver_id: string
          id: string
          payment_method: string
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          status: string
        }
        Insert: {
          account_details: Json
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          driver_id: string
          id?: string
          payment_method: string
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
        }
        Update: {
          account_details?: Json
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          driver_id?: string
          id?: string
          payment_method?: string
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payouts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          availability_status:
            | Database["public"]["Enums"]["driver_availability"]
            | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          phone: string
          profile_photo_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          availability_status?:
            | Database["public"]["Enums"]["driver_availability"]
            | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          phone: string
          profile_photo_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          availability_status?:
            | Database["public"]["Enums"]["driver_availability"]
            | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string
          profile_photo_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string | null
          email_id: string | null
          email_type: string | null
          event_data: Json | null
          event_type: string | null
          id: string
          order_id: string | null
          recipient_email: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email_id?: string | null
          email_type?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          recipient_email: string
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email_id?: string | null
          email_type?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      flavors: {
        Row: {
          archived_at: string | null
          created_at: string | null
          flavor_category: string | null
          flavor_type: Database["public"]["Enums"]["flavor_type"] | null
          id: string
          is_active: boolean | null
          is_available: boolean | null
          name: string
          sort_order: number | null
          surcharge: number | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          flavor_category?: string | null
          flavor_type?: Database["public"]["Enums"]["flavor_type"] | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          name: string
          sort_order?: number | null
          surcharge?: number | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          flavor_category?: string | null
          flavor_type?: Database["public"]["Enums"]["flavor_type"] | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          name?: string
          sort_order?: number | null
          surcharge?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          sort_order: number | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          content: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          section_key: string
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          section_key: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          section_key?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      order_item_flavors: {
        Row: {
          created_at: string | null
          flavor_id: string | null
          flavor_name: string
          id: string
          order_item_id: string
          quantity: number | null
          surcharge_applied: number | null
        }
        Insert: {
          created_at?: string | null
          flavor_id?: string | null
          flavor_name: string
          id?: string
          order_item_id: string
          quantity?: number | null
          surcharge_applied?: number | null
        }
        Update: {
          created_at?: string | null
          flavor_id?: string | null
          flavor_name?: string
          id?: string
          order_item_id?: string
          quantity?: number | null
          surcharge_applied?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_flavors_flavor_id_fkey"
            columns: ["flavor_id"]
            isOneToOne: false
            referencedRelation: "flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_flavors_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          flavor_surcharge_total: number | null
          id: string
          line_total: number | null
          order_id: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          flavor_surcharge_total?: number | null
          id?: string
          line_total?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          quantity?: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          flavor_surcharge_total?: number | null
          id?: string
          line_total?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          customer_id: string | null
          delivery_address: string | null
          delivery_distance_km: number | null
          delivery_fee: number | null
          driver_id: string | null
          id: string
          internal_notes: string | null
          is_refunded: boolean | null
          order_number: string | null
          order_type: Database["public"]["Enums"]["order_type"] | null
          payment_method: string | null
          pickup_date: string | null
          pickup_time: string | null
          refund_amount: number | null
          refund_proof_url: string | null
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          status_changed_at: string | null
          subtotal: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number | null
          driver_id?: string | null
          id?: string
          internal_notes?: string | null
          is_refunded?: boolean | null
          order_number?: string | null
          order_type?: Database["public"]["Enums"]["order_type"] | null
          payment_method?: string | null
          pickup_date?: string | null
          pickup_time?: string | null
          refund_amount?: number | null
          refund_proof_url?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          status_changed_at?: string | null
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number | null
          driver_id?: string | null
          id?: string
          internal_notes?: string | null
          is_refunded?: boolean | null
          order_number?: string | null
          order_type?: Database["public"]["Enums"]["order_type"] | null
          payment_method?: string | null
          pickup_date?: string | null
          pickup_time?: string | null
          refund_amount?: number | null
          refund_proof_url?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          status_changed_at?: string | null
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      page_seo: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          og_image_url: string | null
          page_path: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          og_image_url?: string | null
          page_path: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          og_image_url?: string | null
          page_path?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          id: string
          image_url: string
          order_id: string
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          id?: string
          image_url: string
          order_id: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          id?: string
          image_url?: string
          order_id?: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_flavor_rules: {
        Row: {
          allow_special_flavors: boolean | null
          created_at: string | null
          id: string
          max_flavors: number | null
          min_flavors: number | null
          product_id: string
          required_flavors: number | null
          special_flavor_surcharge: number | null
          total_units: number
          units_per_flavor: number
          updated_at: string | null
        }
        Insert: {
          allow_special_flavors?: boolean | null
          created_at?: string | null
          id?: string
          max_flavors?: number | null
          min_flavors?: number | null
          product_id: string
          required_flavors?: number | null
          special_flavor_surcharge?: number | null
          total_units: number
          units_per_flavor: number
          updated_at?: string | null
        }
        Update: {
          allow_special_flavors?: boolean | null
          created_at?: string | null
          id?: string
          max_flavors?: number | null
          min_flavors?: number | null
          product_id?: string
          required_flavors?: number | null
          special_flavor_surcharge?: number | null
          total_units?: number
          units_per_flavor?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_flavor_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          product_type: Database["public"]["Enums"]["product_type"] | null
          seo_description: string | null
          seo_title: string | null
          sku: string | null
          slug: string | null
          stock_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          seo_description?: string | null
          seo_title?: string | null
          sku?: string | null
          slug?: string | null
          stock_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          seo_description?: string | null
          seo_title?: string | null
          sku?: string | null
          slug?: string | null
          stock_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          customer_phone: string | null
          driver_id: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          customer_phone?: string | null
          driver_id?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id?: string | null
          user_type: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          customer_phone?: string | null
          driver_id?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      stock: {
        Row: {
          created_at: string | null
          current_stock: number | null
          id: string
          is_enabled: boolean | null
          low_stock_threshold: number | null
          product_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_stock?: number | null
          id?: string
          is_enabled?: boolean | null
          low_stock_threshold?: number | null
          product_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_stock?: number | null
          id?: string
          is_enabled?: boolean | null
          low_stock_threshold?: number | null
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          created_at: string | null
          id: string
          new_quantity: number
          notes: string | null
          order_id: string | null
          previous_quantity: number
          product_id: string | null
          quantity_change: number
          stock_id: string | null
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          created_at?: string | null
          id?: string
          new_quantity: number
          notes?: string | null
          order_id?: string | null
          previous_quantity: number
          product_id?: string | null
          quantity_change: number
          stock_id?: string | null
        }
        Update: {
          adjusted_by?: string | null
          adjustment_type?: Database["public"]["Enums"]["adjustment_type"]
          created_at?: string | null
          id?: string
          new_quantity?: number
          notes?: string | null
          order_id?: string | null
          previous_quantity?: number
          product_id?: string | null
          quantity_change?: number
          stock_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stock"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          is_super_owner: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_super_owner?: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_super_owner?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          sort_order: number | null
          thumbnail_url: string | null
          title: string | null
          video_type: string | null
          video_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string | null
          video_type?: string | null
          video_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string | null
          video_type?: string | null
          video_url?: string
        }
        Relationships: []
      }
      visitor_sessions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_seen_at: string | null
          page_path: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          page_path?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          page_path?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_checkout_customer: {
        Args: { p_email?: string; p_name: string; p_phone?: string }
        Returns: string
      }
      create_checkout_order:
        | {
            Args: {
              p_customer_id: string
              p_delivery_address?: string
              p_delivery_distance_km?: number
              p_delivery_fee?: number
              p_internal_notes?: string
              p_order_type: string
              p_pickup_date?: string
              p_pickup_time?: string
              p_subtotal: number
              p_total_amount: number
            }
            Returns: {
              id: string
              order_number: string
            }[]
          }
        | {
            Args: {
              p_customer_id: string
              p_delivery_address?: string
              p_delivery_distance_km?: number
              p_delivery_fee?: number
              p_internal_notes?: string
              p_order_type: string
              p_payment_method?: string
              p_pickup_date?: string
              p_pickup_time?: string
              p_subtotal: number
              p_total_amount: number
            }
            Returns: {
              id: string
              order_number: string
            }[]
          }
      create_checkout_order_item: {
        Args: {
          p_flavor_surcharge_total?: number
          p_order_id: string
          p_product_id: string
          p_product_name: string
          p_product_sku: string
          p_quantity: number
          p_subtotal: number
          p_unit_price: number
        }
        Returns: string
      }
      create_checkout_order_item_flavor: {
        Args: {
          p_flavor_id: string
          p_flavor_name: string
          p_order_item_id: string
          p_quantity: number
          p_surcharge_applied: number
        }
        Returns: string
      }
      generate_random_username: { Args: { role_name: string }; Returns: string }
      get_order_tracking: { Args: { p_order_id: string }; Returns: Json }
      get_orders_by_contact: {
        Args: { p_email?: string; p_phone?: string }
        Returns: Json
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      link_customer_to_user: {
        Args: { p_email: string; p_phone: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      adjustment_type:
        | "manual_add"
        | "manual_deduct"
        | "order_approved"
        | "order_cancelled"
      app_role: "owner" | "manager" | "cashier" | "driver"
      delivery_photo_type: "pickup" | "delivery" | "return"
      driver_availability: "offline" | "online" | "busy" | "unavailable"
      flavor_type: "all_time" | "special"
      order_status:
        | "pending"
        | "for_verification"
        | "approved"
        | "rejected"
        | "completed"
        | "preparing"
        | "ready_for_pickup"
        | "waiting_for_rider"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "cancelled"
      order_type: "dine_in" | "pickup" | "delivery"
      product_type: "simple" | "flavored" | "bundle" | "unlimited"
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
  public: {
    Enums: {
      adjustment_type: [
        "manual_add",
        "manual_deduct",
        "order_approved",
        "order_cancelled",
      ],
      app_role: ["owner", "manager", "cashier", "driver"],
      delivery_photo_type: ["pickup", "delivery", "return"],
      driver_availability: ["offline", "online", "busy", "unavailable"],
      flavor_type: ["all_time", "special"],
      order_status: [
        "pending",
        "for_verification",
        "approved",
        "rejected",
        "completed",
        "preparing",
        "ready_for_pickup",
        "waiting_for_rider",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      order_type: ["dine_in", "pickup", "delivery"],
      product_type: ["simple", "flavored", "bundle", "unlimited"],
    },
  },
} as const
