import QRCode from "qrcode";
import { connectionUrls, PAIR_CODE } from "./state.mjs";

export function pairingDeepLink(code = PAIR_CODE, urls = connectionUrls()) {
  const desktopUrl = urls.find((value) => /^https?:\/\//i.test(String(value || "")));
  const pairCode = String(code || "").trim().toUpperCase();
  if (!desktopUrl || !/^[A-Z2-9]{4,12}$/.test(pairCode)) return "";
  const link = new URL("vibyra://pair");
  link.searchParams.set("code", pairCode);
  link.searchParams.set("url", desktopUrl);
  return link.toString();
}

export async function pairingQrSvg() {
  const link = pairingDeepLink();
  if (!link) return "";
  return QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#11111A", light: "#FFFFFF" }
  });
}
