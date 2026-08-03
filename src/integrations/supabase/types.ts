export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      assigned_tasks: {
        Row: {
          assigned_by: string | null;
          assigned_to: string;
          created_at: string;
          due_time: string;
          group_name: string;
          id: string;
          note: string | null;
          scheduled_date: string;
          sector_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_by?: string | null;
          assigned_to: string;
          created_at?: string;
          due_time: string;
          group_name?: string;
          id?: string;
          note?: string | null;
          scheduled_date: string;
          sector_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_by?: string | null;
          assigned_to?: string;
          created_at?: string;
          due_time?: string;
          group_name?: string;
          id?: string;
          note?: string | null;
          scheduled_date?: string;
          sector_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assigned_tasks_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      daily_checklists: {
        Row: {
          checklist_date: string;
          completed_tasks: number;
          created_at: string;
          id: string;
          sector_id: string;
          status: string;
          supervisor_name: string;
          total_tasks: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          checklist_date: string;
          completed_tasks?: number;
          created_at?: string;
          id?: string;
          sector_id: string;
          status?: string;
          supervisor_name?: string;
          total_tasks?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          checklist_date?: string;
          completed_tasks?: number;
          created_at?: string;
          id?: string;
          sector_id?: string;
          status?: string;
          supervisor_name?: string;
          total_tasks?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_checklists_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_task_records: {
        Row: {
          assigned_task_id: string | null;
          checklist_id: string;
          completed_at: string | null;
          created_at: string;
          group_name: string;
          id: string;
          note: string | null;
          scheduled_date: string;
          scheduled_time: string;
          sector_id: string;
          status: Database["public"]["Enums"]["task_status"];
          supervisor_name: string;
          task_template_id: string | null;
          title: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          assigned_task_id?: string | null;
          checklist_id: string;
          completed_at?: string | null;
          created_at?: string;
          group_name?: string;
          id?: string;
          note?: string | null;
          scheduled_date: string;
          scheduled_time: string;
          sector_id: string;
          status?: Database["public"]["Enums"]["task_status"];
          supervisor_name?: string;
          task_template_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          assigned_task_id?: string | null;
          checklist_id?: string;
          completed_at?: string | null;
          created_at?: string;
          group_name?: string;
          id?: string;
          note?: string | null;
          scheduled_date?: string;
          scheduled_time?: string;
          sector_id?: string;
          status?: Database["public"]["Enums"]["task_status"];
          supervisor_name?: string;
          task_template_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_task_records_assigned_task_id_fkey";
            columns: ["assigned_task_id"];
            isOneToOne: false;
            referencedRelation: "assigned_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_task_records_checklist_id_fkey";
            columns: ["checklist_id"];
            isOneToOne: false;
            referencedRelation: "daily_checklists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_task_records_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_task_records_task_template_id_fkey";
            columns: ["task_template_id"];
            isOneToOne: false;
            referencedRelation: "task_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          entity_id: string | null;
          id: string;
          message: string;
          metadata: Json;
          read_at: string | null;
          recipient_id: string;
          title: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          entity_id?: string | null;
          id?: string;
          message: string;
          metadata?: Json;
          read_at?: string | null;
          recipient_id: string;
          title: string;
          type: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string | null;
          id?: string;
          message?: string;
          metadata?: Json;
          read_at?: string | null;
          recipient_id?: string;
          title?: string;
          type?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          sector_id: string | null;
          status: Database["public"]["Enums"]["user_status"];
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          sector_id?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          sector_id?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      sectors: {
        Row: {
          code: string;
          color: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
          subtitle: string;
        };
        Insert: {
          code: string;
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          subtitle?: string;
        };
        Update: {
          code?: string;
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          subtitle?: string;
        };
        Relationships: [];
      };
      task_templates: {
        Row: {
          code: string | null;
          created_at: string;
          due_time: string;
          group_name: string;
          id: string;
          is_active: boolean;
          sector_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
          weekdays: number[];
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          due_time: string;
          group_name?: string;
          id?: string;
          is_active?: boolean;
          sector_id: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
          weekdays?: number[];
        };
        Update: {
          code?: string | null;
          created_at?: string;
          due_time?: string;
          group_name?: string;
          id?: string;
          is_active?: boolean;
          sector_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          weekdays?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "task_templates_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_active_user: { Args: { _uid: string }; Returns: boolean };
      is_admin: { Args: { _uid: string }; Returns: boolean };
      user_sector: { Args: { _uid: string }; Returns: string };
    };
    Enums: {
      app_role: "supervisor" | "admin";
      task_status: "pending" | "completed" | "reopened";
      user_status: "pending" | "active" | "rejected" | "inactive";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["supervisor", "admin"],
      task_status: ["pending", "completed", "reopened"],
      user_status: ["pending", "active", "rejected", "inactive"],
    },
  },
} as const;
