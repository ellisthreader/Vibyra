import { phoneAnswer, phoneSetPreviewAuto, phoneStatus, type PhoneStatus } from "../ipc/phone";

/** Pairing approval is asynchronous: trust and the live socket arrive after the reply. */
export async function approvePhone(id: string, approve: boolean, previewAuto: boolean | undefined,
  current: () => boolean): Promise<PhoneStatus> {
  if (!current()) throw new Error("Your account changed. Connect again from your phone.");
  await phoneAnswer(id, approve);
  if (!current()) throw new Error("Your account changed. Connect again from your phone.");
  if (!approve) return phoneStatus();
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const status = await phoneStatus();
    if (!current()) throw new Error("Your account changed. Connect again from your phone.");
    if (!status.enabled) throw new Error("iPhone connection was turned off.");
    if (status.active.includes(id) && status.devices.some((device) => device.id === id)) {
      return previewAuto === undefined ? status : phoneSetPreviewAuto(id, previewAuto);
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error("Your iPhone hasn't connected yet. Try connecting again from your phone.");
}
