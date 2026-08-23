import type { CommunityFilter, CommunityPost } from "../types";

export function filterCommunityPosts(posts: CommunityPost[], searchQuery: string, activeFilter: CommunityFilter) {
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = posts.filter((post) => {
    const searchable = [post.title, post.description, post.user, ...post.tags].join(" ").toLowerCase();
    return !q || searchable.includes(q);
  });
  if (activeFilter === "Popular") {
    return [...matchesSearch].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments));
  }
  if (activeFilter === "Featured") {
    const featured = matchesSearch.filter((post) => post.tag === "Featured" || post.tags.includes("Featured"));
    return featured.length > 0 ? featured : matchesSearch;
  }
  return matchesSearch;
}
