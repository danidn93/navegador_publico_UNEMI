// src/integrations/supabase/types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      buildings: {
        Row: {
          address: string | null;
          building_code: string | null;
          created_at: string;
          description: string | null;
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          total_floors: number;
          updated_at: string;
          state: string;
        };
        Insert: {
          address?: string | null;
          building_code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          latitude: number;
          longitude: number;
          name: string;
          total_floors?: number;
          updated_at?: string;
          state: string;
        };
        Update: {
          address?: string | null;
          building_code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          latitude?: number;
          longitude?: number;
          name?: string;
          total_floors?: number;
          updated_at?: string;
          state: string;
        };
        Relationships: [];
      };

      floors: {
        Row: {
          building_id: string;
          created_at: string;
          description: string | null;
          floor_name: string | null;
          floor_number: number;
          id: string;
          updated_at: string;
        };
        Insert: {
          building_id: string;
          created_at?: string;
          description?: string | null;
          floor_name?: string | null;
          floor_number: number;
          id?: string;
          updated_at?: string;
        };
        Update: {
          building_id?: string;
          created_at?: string;
          description?: string | null;
          floor_name?: string | null;
          floor_number?: number;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "floors_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          }
        ];
      };

      room_types: {
        Row: {
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      footways: {
        Row: {
          id: string;
          name: string | null;
          // GeoJSON LineString
          geom: { type: "LineString"; coordinates: [number, number][] };
          created_at: string;
          updated_at: string;
          state: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          geom: { type: "LineString"; coordinates: [number, number][] };
          created_at?: string;
          updated_at?: string;
          state: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          geom?: { type: "LineString"; coordinates: [number, number][] };
          created_at?: string;
          updated_at?: string;
          state: string;
        };
        Relationships: [];
      };

      entrances: {
        Row: {
          id: string;
          building_id: string;
          name: string | null;
          type: "pedestrian" | "vehicular" | "both";
          location: { type: "Point"; coordinates: [number, number] };
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          name?: string | null;
          type: "pedestrian" | "vehicular" | "both";
          location: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          building_id?: string;
          name?: string | null;
          type?: "pedestrian" | "vehicular" | "both";
          location?: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entrances_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          }
        ];
      };

      parkings: {
        Row: {
          id: string;
          building_id: string | null;
          name: string | null;
          type: "car" | "motorcycle" | "disabled" | "mixed";
          capacity: number | null;
          location: { type: "Point"; coordinates: [number, number] };
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id?: string | null;
          name?: string | null;
          type: "car" | "motorcycle" | "disabled" | "mixed";
          capacity?: number | null;
          location: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          building_id?: string | null;
          name?: string | null;
          type?: "car" | "motorcycle" | "disabled" | "mixed";
          capacity?: number | null;
          location?: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parkings_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          }
        ];
      };

      landmarks: {
        Row: {
          id: string;
          name: string | null;
          type: "plazoleta" | "bar" | "corredor" | "otro";
          location: { type: "Point"; coordinates: [number, number] };
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          type: "plazoleta" | "bar" | "corredor" | "otro";
          location: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          type?: "plazoleta" | "bar" | "corredor" | "otro";
          location?: { type: "Point"; coordinates: [number, number] };
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      rooms: {
        Row: {
          capacity: number | null;
          created_at: string;
          description: string | null;
          directions: string | null;
          equipment: string[] | null;
          floor_id: string;
          id: string;
          keywords: string[] | null;
          name: string;
          room_number: string | null;
          room_type_id: string;
          updated_at: string;
          actividades: string[];
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          description?: string | null;
          directions?: string | null;
          equipment?: string[] | null;
          floor_id: string;
          id?: string;
          keywords?: string[] | null;
          name: string;
          room_number?: string | null;
          room_type_id: string;
          updated_at?: string;
          actividades: string[];
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          description?: string | null;
          directions?: string | null;
          equipment?: string[] | null;
          floor_id?: string;
          id?: string;
          keywords?: string[] | null;
          name?: string;
          room_number?: string | null;
          room_type_id?: string;
          updated_at?: string;
          actividades: string[];
        };
        Relationships: [
          {
            foreignKeyName: "rooms_floor_id_fkey";
            columns: ["floor_id"];
            isOneToOne: false;
            referencedRelation: "floors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rooms_room_type_id_fkey";
            columns: ["room_type_id"];
            isOneToOne: false;
            referencedRelation: "room_types";
            referencedColumns: ["id"];
          }
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      // 👇 agrega esto
      get_app_role: {
        Args: Record<string, never>; // no recibe argumentos
        Returns: string;            // devuelve 'admin' | 'student' | 'public' (texto)
      };
    };

    Enums: {
      entrance_type: "pedestrian" | "vehicular" | "both";
      parking_type: "car" | "motorcycle" | "disabled" | "mixed";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
