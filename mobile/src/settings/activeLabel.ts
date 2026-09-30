const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a signed-in device was last used, in the words a list of devices wants:
 *  "Active now", "Active 3 hours ago", "Active yesterday", "Active 4 Sep". */
export function activeLabel(iso: string | null, now = Date.now()): string | null {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return null;
  const ago = Math.max(0, now - time);
  if (ago < 5 * minute) return 'Active now';
  if (ago < hour) return `Active ${Math.round(ago / minute)} minutes ago`;
  if (ago < day) {
    const hours = Math.round(ago / hour);
    return `Active ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (ago < 2 * day) return 'Active yesterday';
  if (ago < 7 * day) return `Active ${Math.floor(ago / day)} days ago`;
  const date = new Date(time);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `Active ${date.getDate()} ${months[date.getMonth()]}${year}`;
}
