import { promptOption } from "../../lib/agentPrompt";
import { buttonLabel } from "../../lib/agentPromptIntent";
import type {
  AgentPromptOffer,
  AgentPromptOption,
  NotificationAction,
} from "../../notificationTypes";
import { CheckIcon, CloseIcon } from "../common/Icons";

export interface ToastPromptProps {
  offer: AgentPromptOffer;
  /** The toast's own action, drawn in the same row so there is one control bar. */
  action?: NotificationAction;
  onAnswer: (option: AgentPromptOption) => void;
  onAction: () => void;
}

/**
 * The command a prompt is asking about, and the two answers worth a button.
 *
 * Only `affirm` and `decline` are offered. The agent's own "don't ask again"
 * is parsed and deliberately left in the terminal: its scope was computed by
 * the agent, Vibyra cannot reproduce it, and a second permission list that
 * disagrees with the first is worse than one trip to the pane. When such an
 * option exists the trailing button says so.
 */
export function ToastPrompt({ offer, action, onAnswer, onAction }: ToastPromptProps) {
  const affirm = promptOption(offer, "affirm");
  const decline = promptOption(offer, "decline");
  const [head, ...rest] = offer.detail;
  const shown = (affirm ? 1 : 0) + (decline ? 1 : 0);
  const openLabel = offer.options.length > shown ? "More options" : action?.label;

  return (
    <>
      {head && (
        <div className="vprompt__cmd" title={offer.detail.join("\n")}>
          <span className="vprompt__sigil" aria-hidden="true">
            $
          </span>
          <code>{head}</code>
          {rest.length > 0 && (
            <span className="vprompt__more" title={`${rest.length} more lines`}>
              +{rest.length}
            </span>
          )}
        </div>
      )}

      <div className="vtoast__actions">
        {affirm && (
          <button
            type="button"
            className="chip vtoast__action vprompt__answer vprompt__answer--affirm"
            title={affirm.label}
            onClick={() => onAnswer(affirm)}
          >
            <CheckIcon size={11} />
            {buttonLabel(affirm.label)}
          </button>
        )}
        {decline && (
          <button
            type="button"
            className="chip vtoast__action vprompt__answer"
            title={decline.label}
            onClick={() => onAnswer(decline)}
          >
            <CloseIcon size={11} />
            {buttonLabel(decline.label)}
          </button>
        )}
        {action && openLabel && (
          <button type="button" className="vprompt__open" onClick={onAction}>
            {openLabel}
          </button>
        )}
      </div>
    </>
  );
}
