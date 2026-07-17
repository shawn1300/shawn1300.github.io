"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { SearchIcon, FileText, BookOpen, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchPost {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  published_at: string | null;
  created_at: string;
}

interface SearchDiary {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  created_at: string;
}

interface SearchResult {
  posts: SearchPost[];
  diaries: SearchDiary[];
}

type SearchItem = (SearchPost & { type: "post" }) | (SearchDiary & { type: "diary" });

/**
 * 将文本中的关键词高亮包裹，返回 React 节点
 */
function highlightSnippet(snippet: string, keyword: string) {
  if (!keyword.trim() || !snippet) return snippet;
  // 转义正则特殊字符
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = snippet.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.trim().toLowerCase() ? (
      <mark key={i} className="bg-yellow-400/30 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 合并结果列表用于键盘导航
  const allResults: SearchItem[] = [
    ...(results?.posts.map((p) => ({ ...p, type: "post" as const })) || []),
    ...(results?.diaries.map((d) => ({ ...d, type: "diary" as const })) || []),
  ];

  // 切换搜索弹窗
  const toggleSearch = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // 监听自定义事件（Header 按钮触发）
  useEffect(() => {
    document.addEventListener("search:toggle", toggleSearch);
    return () => document.removeEventListener("search:toggle", toggleSearch);
  }, [toggleSearch]);

  // 全局快捷键 Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSearch();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggleSearch]);

  // 打开时聚焦输入框、重置状态
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults(null);
      setSelectedIndex(-1);
      setSearched(false);
    }
  }, [open]);

  // 执行搜索
  const doSearch = useCallback(async (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;

    setLoading(true);
    setSearched(true);
    setSelectedIndex(-1);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // 跳转
  const navigate = useCallback(
    (item: SearchItem) => {
      const path =
        item.type === "post"
          ? `/posts/${item.slug}`
          : `/diaries/${item.slug}`;
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-search-panel]")) return;
      setOpen(false);
    };
    // 延迟绑定避免触发打开事件时立即关闭
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      // 如果有选中项，跳转；否则执行搜索
      if (selectedIndex >= 0) {
        e.preventDefault();
        const item = allResults[selectedIndex];
        if (item) navigate(item);
      } else {
        e.preventDefault();
        doSearch();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < allResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : allResults.length - 1
      );
    }
  };

  const totalPosts = results?.posts.length || 0;
  const totalDiaries = results?.diaries.length || 0;
  const hasResults = totalPosts + totalDiaries > 0;

  if (!open) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
    >
      <div
        data-search-panel
        className="pointer-events-auto w-full max-w-2xl mx-4 mt-4"
      >
        <div className="bg-popover/95 backdrop-blur rounded-xl ring-1 ring-foreground/10 shadow-2xl overflow-hidden">
          {/* 搜索输入行 */}
          <div className="flex items-center gap-3 px-4 h-12">
            <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearched(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="搜索文章或日记…（回车搜索）"
              className="flex-1 border-0 bg-transparent h-auto px-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults(null);
                  setSearched(false);
                  inputRef.current?.focus();
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground/50 bg-muted/50 rounded px-1.5 py-0.5 shrink-0">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>

          {/* 结果区 */}
          {(loading || searched) && (
            <div className="border-t border-border/40 max-h-[50vh] overflow-y-auto">
              {loading && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  搜索中...
                </div>
              )}

              {!loading && searched && !hasResults && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  未找到相关内容
                </div>
              )}

              {!loading && hasResults && (
                <div className="py-2">
                  {/* 文章 */}
                  {totalPosts > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] text-muted-foreground/70 tracking-wider">
                        <FileText className="h-3 w-3" />
                        文章 · {totalPosts} 篇
                      </div>
                      {results!.posts.map((post, idx) => (
                        <button
                          key={post.id}
                          onClick={() => navigate({ ...post, type: "post" })}
                          className={cn(
                            "w-full text-left px-4 py-2.5 transition-colors",
                            selectedIndex === idx
                              ? "bg-muted"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <div className="text-sm text-foreground leading-snug line-clamp-1">
                            {post.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            <span>{formatDate(
                              post.published_at || post.created_at,
                              "yyyy-MM-dd"
                            )}</span>
                          </div>
                          {post.snippet && (
                            <div className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-snug">
                              {highlightSnippet(post.snippet, query)}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 日记 */}
                  {totalDiaries > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] text-muted-foreground/70 tracking-wider mt-1">
                        <BookOpen className="h-3 w-3" />
                        日记 · {totalDiaries} 篇
                      </div>
                      {results!.diaries.map((diary, idx) => {
                        const globalIdx = totalPosts + idx;
                        return (
                          <button
                            key={diary.id}
                            onClick={() =>
                              navigate({
                                ...diary,
                                type: "diary",
                              })
                            }
                            className={cn(
                              "w-full text-left px-4 py-2.5 transition-colors",
                              selectedIndex === globalIdx
                                ? "bg-muted"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <div className="text-sm text-foreground leading-snug line-clamp-1">
                              {diary.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              <span>{formatDate(diary.created_at, "yyyy-MM-dd")}</span>
                            </div>
                            {diary.snippet && (
                              <div className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-snug">
                                {highlightSnippet(diary.snippet, query)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
