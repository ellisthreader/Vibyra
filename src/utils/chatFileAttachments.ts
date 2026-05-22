import type { ChatFileAttachment, ChatImageAttachment } from "../types/chatTools";
import type { ProjectFileContext } from "../context/agentContextPayload";

type PickedDocumentAsset = {
  mimeType?: string | null;
  name?: string | null;
  size?: number | null;
  uri?: string | null;
};

const MAX_ATTACHMENT_TEXT_CHARS = 12000;

export async function createChatFileAttachment(asset: PickedDocumentAsset): Promise<ChatFileAttachment | null> {
  if (!asset.name) return null;
  const readable = isTextLikeAttachment(asset);
  const textContent = readable ? await readAttachmentText(asset) : undefined;
  return {
    id: `file-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    mimeType: asset.mimeType ?? undefined,
    name: asset.name,
    readStatus: textContent?.trim() ? "loaded" : readable ? "failed" : "unsupported",
    size: asset.size ?? undefined,
    textContent,
    uri: asset.uri ?? undefined
  };
}

export function fileAttachmentsToProjectFiles(attachments: ChatFileAttachment[]): ProjectFileContext[] {
  return attachments.map((attachment) => ({
    language: languageForAttachment(attachment),
    loaded: Boolean(attachment.textContent?.trim()),
    path: `Attached/${attachment.name}`,
    ...(attachment.textContent?.trim() ? { snippet: attachment.textContent.trim().slice(0, 1200) } : {})
  }));
}

export function imageAttachmentsToApi(attachments: ChatImageAttachment[]) {
  return attachments.slice(0, 3).map((attachment) => ({
    url: attachment.dataUrl,
    name: attachment.name,
    mimeType: attachment.mimeType,
    ...(attachment.width ? { width: attachment.width } : {}),
    ...(attachment.height ? { height: attachment.height } : {})
  }));
}

async function readAttachmentText(asset: PickedDocumentAsset) {
  if (!asset.uri) return undefined;
  try {
    const response = await fetch(asset.uri);
    const text = await response.text();
    return text.slice(0, MAX_ATTACHMENT_TEXT_CHARS);
  } catch {
    return undefined;
  }
}

function isTextLikeAttachment(asset: PickedDocumentAsset) {
  const mime = (asset.mimeType ?? "").toLowerCase();
  const name = (asset.name ?? "").toLowerCase();
  return mime.startsWith("text/")
    || /\b(json|javascript|typescript|xml|csv|yaml|markdown|html|css|svg)\b/.test(mime)
    || /\.(txt|md|markdown|json|jsonl|js|jsx|ts|tsx|mjs|cjs|css|scss|sass|less|html|htm|xml|svg|csv|yml|yaml|toml|ini|env|php|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|sql|sh|bash|zsh|ps1|log)$/i.test(name);
}

function languageForAttachment(attachment: ChatFileAttachment) {
  const name = attachment.name.toLowerCase();
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "yml" || ext === "yaml") return "yaml";
  if (ext) return ext;
  return attachment.mimeType?.split("/").pop() ?? "";
}
