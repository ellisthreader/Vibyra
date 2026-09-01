import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";

import { CloseIcon, FileIcon } from "../common/Icons";
import { useAgentAttachmentStore } from "../../state/agentAttachmentStore";

/**
 * Files attached to this chat.
 *
 * Every one is *copied* into the chat's own folder natively, and it is the
 * copy the provider is given. That is what lets a detached Chat Mode
 * conversation take a screenshot without quietly gaining read access to the
 * folder the screenshot came from — attaching a file must not undo detachment.
 *
 * The list is read from the chat rather than remembered by this component,
 * which is what makes it survive switching chats. Held here, it vanished the
 * first time someone opened another conversation, while the files stayed in
 * the folder and stayed on every following turn.
 */
export function ComposerAttachments({ chatId }: { chatId: string }) {
  const files = useAgentAttachmentStore((state) => state.byChat[chatId]);
  const error = useAgentAttachmentStore((state) => state.error);
  const load = useAgentAttachmentStore((state) => state.load);
  const add = useAgentAttachmentStore((state) => state.add);
  const remove = useAgentAttachmentStore((state) => state.remove);

  useEffect(() => {
    void load(chatId);
  }, [chatId, load]);

  const pick = async () => {
    const picked = await openDialog({ multiple: false, title: "Attach a file" }).catch(() => null);
    if (typeof picked !== "string" || !picked) return;
    await add(chatId, picked);
  };

  return (
    <div className="composer__attach">
      <button
        type="button"
        className="composer__attach-add"
        onClick={() => void pick()}
        title="Attach a file to this chat"
        aria-label="Attach a file to this chat"
      >
        <FileIcon size={13} />
      </button>
      {files && files.length > 0 && (
        <ul className="composer__attach-list">
          {files.map((file) => (
            <li key={file.id} title={file.original}>
              <span>{file.original.split("/").pop() || file.original}</span>
              <button
                type="button"
                aria-label={`Remove ${file.original}`}
                title="Remove from this chat"
                onClick={() => void remove(chatId, file.id)}
              >
                <CloseIcon size={9} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="composer__attach-error">{error}</span>}
    </div>
  );
}
