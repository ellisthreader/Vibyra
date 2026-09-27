/** `/Users/ellis/Desktop/HKE` reads as `~/Desktop/HKE`; Windows homes fold the same way. */
export function homeRelative(root: string): string {
  return root
    .replace(/^\/(?:Users|home)\/[^/]+/, "~")
    .replace(/^[A-Za-z]:[\\/]Users[\\/][^\\/]+/, "~")
    .replace(/\\/g, "/");
}
