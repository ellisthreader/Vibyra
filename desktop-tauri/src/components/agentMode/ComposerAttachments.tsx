import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import type { ChatAttachment } from "../../agentTypes";
import { attachToChat } from "../../ipc/agentChats";
import { FileIcon } from "../common/Icons";

/**
 * Files attached to this chat.
 *
 * Every one is *copied* into the chat's own folder natively, and it is the
 * copy the provider is given. That is what lets a detached Chat Mode
 * conversation take a screenshot without quietly gaining read access to the
 * folder the screenshot came from — attaching a file must not undo detachment.
 */
export function ComposerAttachments({ chatId }: { chatId: string }) {
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const picked = await openDialog({ multiple: false, title: "Attach a file" }).catch(() => null);
    if (typeof picked !== "string" || !picked) return;
    try {
      const attachment = await attachToChat(chatId, picked);
      setFiles((current) => [...current, attachment]);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <div className="composer__attach">
      <button className="composer__attach-add" onClick={add} title="Attach a file to this chat">
        <FileIcon size={13} />
      </button>
      {files.length > 0 && (
        <ul className="composer__attach-list">
          {files.map((file) => (
            <li key={file.id} title={file.original}>
              {file.original}
            </li>
          ))}
        </ul>
      )}
      {error && <span className="composer__attach-error">{error}</span>}
    </div>
  );
}
