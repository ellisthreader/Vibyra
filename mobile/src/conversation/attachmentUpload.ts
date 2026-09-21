export interface ConversationAttachment { id: string; name: string; mime: string; hash: string; complete: boolean }
export async function uploadAttachment(request: (params: Record<string, unknown>) => Promise<ConversationAttachment>,
  id: string, name: string, mime: string, content: string) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'text/plain'].includes(mime)) throw new Error('Choose a PNG, JPEG, WebP or plain text file.');
  if (content.length > (mime === 'text/plain' ? 180000 : 2800000)) throw new Error('Use an image under 2 MB or text under 128 KB.');
  let result: ConversationAttachment | undefined;
  for (let offset = 0; offset < content.length; offset += 16384) {
    result = await request({ attachmentId: id, name, mime, offset, content: content.slice(offset, offset + 16384), complete: offset + 16384 >= content.length });
  }
  if (!result?.complete || !result.hash) throw new Error('The computer has not acknowledged this attachment.');
  return result;
}
