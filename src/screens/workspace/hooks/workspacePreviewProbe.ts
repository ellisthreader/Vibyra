import { resolveRunnableDesktopPreviewUrl } from "../../../utils/previewUrls";

export async function desktopPreviewLooksRunnable(url: string) {
  return Boolean(await resolveRunnableDesktopPreviewUrl(url));
}
