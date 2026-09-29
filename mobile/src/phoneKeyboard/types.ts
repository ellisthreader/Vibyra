export interface TextSelection { start: number; end: number }
export interface FocusedTextTarget {
  id: string;
  fieldId: string;
  label: string;
  context: string;
  text: string;
  selection: TextSelection;
  revision: number;
  maxLength: number;
  multiline: boolean;
}
export interface FocusedTextReply { target: FocusedTextTarget | null; lease?: string }
export type FocusedTextMethod = 'snapshot' | 'claim' | 'edit' | 'release';
export type FocusedTextRequest = (method: FocusedTextMethod, params?: Record<string, unknown>) => Promise<FocusedTextReply>;
