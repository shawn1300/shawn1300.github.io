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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
