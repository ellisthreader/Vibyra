import React from "react";
import type { ChatComposerProps } from "./ChatComposerTypes";
import { ChatComposerView } from "./ChatComposerView";
import { useChatComposerController } from "./useChatComposerController";

export function ChatComposer(props: ChatComposerProps) {
  const controller = useChatComposerController(props);
  return <ChatComposerView controller={controller} props={props} />;
}
