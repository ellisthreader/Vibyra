import type { ComponentProps } from 'react';
import { ConversationModelPicker } from './ConversationModelPicker';

/** A terminal model change always applies to the current computer session. */
export function ConversationPicker({ computer }: {
  computer: ComponentProps<typeof ConversationModelPicker>;
}) {
  return <ConversationModelPicker {...computer} />;
}
