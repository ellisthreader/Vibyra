import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../../state/accountStore';
import { parseUpload, uploadProblem } from '../../../../mobile/src/agents/v2/overviewModel.ts';
import type { DraftAttachment } from '../../../../mobile/src/agents/v2/outputModel.ts';

/** Uploading stores owner-scoped bytes only; a separate reviewed draft revision chooses what to send. */
export async function uploadDraftFile(file: File, current: () => boolean): Promise<DraftAttachment> {
  const owner = useAccountStore.getState().snapshot.profile?.email;
  const valid = () => Boolean(owner) && owner === useAccountStore.getState().snapshot.profile?.email && current();
  if (!valid()) throw new Error('Sign in again before uploading a file.');
  const problem = uploadProblem(file.name, file.type, file.size);
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!valid()) throw new Error('Draft changed. Choose the file again.');
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const raw = await invoke('teammate_upload', { name: file.name, mime: file.type || 'application/octet-stream', data: btoa(binary), agentV2: true });
  const uploaded = parseUpload(raw);
  if (!valid()) throw new Error('Draft changed. The uploaded file was not attached.');
  if (!uploaded) throw new Error('The attachment upload could not be confirmed.');
  return { id: uploaded.id, name: uploaded.name, size: uploaded.bytes, mimeType: uploaded.mimeType };
}
