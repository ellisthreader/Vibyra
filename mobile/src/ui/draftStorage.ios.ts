import { Directory, File, Paths } from 'expo-file-system';

// App-private storage; no Files sharing or account/cloud upload. Only explicitly
// enabled live conversation drafts use this store. Trust keys remain in Keychain.
function file(scope: string) {
  const directory = new Directory(Paths.document, 'conversation-drafts');
  directory.create({ intermediates: true, idempotent: true });
  return new File(directory, `${encodeURIComponent(scope)}.json`);
}
export async function readDraft(scope: string): Promise<string | null> {
  const draft = file(scope);
  if (!draft.exists) return null;
  const value: unknown = JSON.parse(await draft.text());
  return typeof value === 'string' ? value : null;
}
export async function writeDraft(scope: string, value: string): Promise<void> {
  const draft = file(scope);
  if (!value) { if (draft.exists) draft.delete(); return; }
  draft.write(JSON.stringify(value));
}
