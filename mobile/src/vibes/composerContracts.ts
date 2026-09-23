import type { ReactNode } from 'react';
import type { Integration } from '../integrations/types';
import type { Anchor } from './AttachMenu';
import type { Effort } from './types';
import type { Attached } from './useAttachments';

export interface ComposerEffort {
  open?: boolean;
  onClose?(): void;
  onCommit?(): void;
  ladder: Effort[];
  value: Effort | null;
  onChange(effort: Effort): void;
  automatic: boolean;
  onChooseModel(): void;
}
export interface ComposerInput {
  text: string;
  onChange(value: string): void;
  placeholder?: string;
  label?: string;
  maxLength?: number;
  mentions?: Integration[];
  knownMentions?: string[];
}
export interface ComposerModel {
  label: string;
  id?: string | null;
  chosenByAuto?: boolean;
  hint?: string;
  onOpen(): void;
  effort?: ComposerEffort;
  picker?: ReactNode;
  control?: ReactNode;
}
export interface ComposerAttachments {
  items: Attached[];
  onRemove(key: string): void;
  onAdd(anchor: Anchor): void;
  control?: ReactNode;
  notice?: string | null;
}
export interface ComposerSubmission {
  busy: boolean;
  disabled: boolean;
  voiceDisabled?: boolean;
  blocked?: string | null;
  onSend(): void;
  onStop(): void;
  quietGeneration?: boolean;
  trialRemaining?: number;
  maximum?: number;
}
export interface ComposerProps {
  input: ComposerInput;
  model: ComposerModel;
  attachments: ComposerAttachments;
  submission: ComposerSubmission;
  teammate?: boolean;
  accessory?: ReactNode;
}
