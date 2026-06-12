// ── 数据库表类型 ──

export interface Category {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Tag {
  id: string
  name: string
  slug: string
  created_at: string
}

export type PostStatus = 'draft' | 'published'

export interface Post {
  id: string
  title: string
  slug: string
  content: string
  excerpt: string
  cover_image: string | null
  category_id: string | null
  status: PostStatus
  published_at: string | null
  author_id: string
  created_at: string
  updated_at: string
  // 关联数据（JOIN 后填充）
  category?: Category | null
  tags?: Tag[]
}

export interface PostTag {
  post_id: string
  tag_id: string
}

export interface Comment {
  id: string
  post_id: string
  author_name: string
  author_email: string | null
  content: string
  created_at: string
}

// ── 日记 ──

export interface Diary {
  id: string
  title: string
  slug: string
  content: string
  author_id: string
  created_at: string
  updated_at: string
}

export interface DiaryFormData {
  title: string
  slug: string
  content: string
}

// ── 表单提交类型 ──

export interface CommentFormData {
  post_id: string
  author_name: string
  author_email: string
  content: string
}

export interface PostFormData {
  title: string
  slug: string
  content: string
  excerpt: string
  cover_image: string
  category_id: string | null
  tags: string[] // tag ids
  status: PostStatus
}

// ── API 响应类型 ──

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
