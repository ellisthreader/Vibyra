import { createHash } from "node:crypto";
import { PROVIDER_PIXEL_LOGOS, PROVIDER_PIXEL_LOGO_SOURCES } from "../../desktop/assets/provider-logos/generated.mjs";
import { registeredProviderFamilies } from "../../desktop/lib/aiTerminalVibyraAgentBranding.mjs";
import { PROVIDER_LOGO_SOURCES } from "./manifest.mjs";

const expected = Object.keys(PROVIDER_LOGO_SOURCES);
assertSameKeys("branding registry", registeredProviderFamilies(), expected);
assertSameKeys("pixel logos", expected, Object.keys(PROVIDER_PIXEL_LOGOS));
assertSameKeys("source metadata", expected, Object.keys(PROVIDER_PIXEL_LOGO_SOURCES));

for (const provider of expected) {
  const logo = PROVIDER_PIXEL_LOGOS[provider];
  if (logo.width !== 64 || logo.height !== 64 || logo.encoding !== "rgba-rle-v1") {
    throw new Error(`${provider}: invalid generated logo contract`);
  }
  const rgba = decodeRgbaRle(Buffer.from(logo.rgbaRleBase64, "base64"));
  if (rgba.length !== logo.width * logo.height * 4) throw new Error(`${provider}: invalid RGBA length`);
  let visible = 0;
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if (rgba[offset] > 0) visible += 1;
  }
  if (visible < 64) throw new Error(`${provider}: generated logo is effectively blank`);
  const sha256 = createHash("sha256").update(rgba).digest("hex");
  if (sha256 !== logo.rgbaSha256) throw new Error(`${provider}: RGBA checksum mismatch`);
  if (!PROVIDER_PIXEL_LOGO_SOURCES[provider].assetUrl) throw new Error(`${provider}: missing source URL`);
}

console.log(`Validated ${expected.length} provider pixel logos.`);

function decodeRgbaRle(encoded) {
  const pixels = [];
  for (let offset = 0; offset < encoded.length; offset += 6) {
    if (offset + 6 > encoded.length) throw new Error("Truncated rgba-rle-v1 data");
    const run = encoded.readUInt16LE(offset);
    if (!run) throw new Error("Zero-length rgba-rle-v1 run");
    const pixel = encoded.subarray(offset + 2, offset + 6);
    for (let count = 0; count < run; count += 1) pixels.push(pixel);
  }
  return Buffer.concat(pixels);
}

function assertSameKeys(label, expected, actual) {
  if (expected.join("\n") !== actual.join("\n")) {
    throw new Error(`${label}: canonical provider keys or order differ`);
  }
}
