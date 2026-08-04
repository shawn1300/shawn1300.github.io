// Supabase Database 类型定义
// 与 SQL 迁移文件 001_initial.sql 中的表结构一致
// 后续可通过 `npx supabase gen types typescript` 自动生成覆盖此文件

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          title: string
          slug: string
          content: string
          excerpt: string
          cover_image: string | null
          category_id: string | null
          status: 'draft' | 'published'
          published_at: string | null
          author_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug: string
          content?: string
          excerpt?: string
          cover_image?: string | null
          category_id?: string | null
          status?: 'draft' | 'published'
          published_at?: string | null
          author_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          content?: string
          excerpt?: string
          cover_image?: string | null
          category_id?: string | null
          status?: 'draft' | 'published'
          published_at?: string | null
          author_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
      }
      comments: {
        Row: {
          id: string
          post_id: string
          author_name: string
          author_email: string | null
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          author_name?: string
          author_email?: string | null
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          author_name?: string
          author_email?: string | null
          content?: string
          created_at?: string
        }
      }
      environment_locations: {
        Row: {
          id: string
          slug: string
          name_zh: string
          name_en: string
          name_ja: string
          timezone: string
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name_zh: string
          name_en: string
          name_ja: string
          timezone: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name_zh?: string
          name_en?: string
          name_ja?: string
          timezone?: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      environment_sensors: {
        Row: {
          id: string
          location_id: string
          role: 'indoor' | 'outdoor'
          name_zh: string
          name_en: string
          name_ja: string
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          role: 'indoor' | 'outdoor'
          name_zh: string
          name_en: string
          name_ja: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          role?: 'indoor' | 'outdoor'
          name_zh?: string
          name_en?: string
          name_ja?: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'environment_sensors_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'environment_locations'
            referencedColumns: ['id']
          },
        ]
      }
      environment_readings: {
        Row: {
          id: string
          sensor_id: string
          temperature_c: number
          humidity_percent: number
          battery_percent: number | null
          source_updated_at: string
          collected_at: string
          idempotency_key: string
        }
        Insert: {
          id?: string
          sensor_id: string
          temperature_c: number
          humidity_percent: number
          battery_percent?: number | null
          source_updated_at: string
          collected_at?: string
          idempotency_key: string
        }
        Update: {
          id?: string
          sensor_id?: string
          temperature_c?: number
          humidity_percent?: number
          battery_percent?: number | null
          source_updated_at?: string
          collected_at?: string
          idempotency_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'environment_readings_sensor_id_fkey'
            columns: ['sensor_id']
            isOneToOne: false
            referencedRelation: 'environment_sensors'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      cleanup_environment_readings: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
