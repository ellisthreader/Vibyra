import { useEffect, useState } from "react";
import type { PhoneDevice } from "../../ipc/phone";
import { useAccountStore } from "../../state/accountStore";
import { usePhoneStore } from "../../state/phoneStore";
import { PhoneConnectionDialog } from "./PhoneConnectionDialog";

/** Retain the accepted request until its live connection has been acknowledged. */
export function PhoneApprovalModal() {
  const pending = usePhoneStore((s) => s.status?.pending[0]);
  const account = useAccountStore((s) => s.snapshot.profile?.welcomeKey);
  const [held, setHeld] = useState<PhoneDevice | null>(null);
  const [generation, setGeneration] = useState(0);
  const request = held ?? pending;
  useEffect(() => { setHeld(null); }, [account]);
  if (!request) return null;
  return <PhoneConnectionDialog key={`${account}:${request.id}:${generation}`} request={request}
    hold={() => setHeld(request)} close={() => {
      setHeld(null);
      // A fresh request may reuse the device id before we observe an empty queue.
      setGeneration((value) => value + 1);
    }} />;
}
