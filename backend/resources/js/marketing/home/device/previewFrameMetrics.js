// Keep the sample chassis geometry aligned with Desktop's previewFrameMetrics.ts.
export function previewFrameMetrics(device, width, height) {
    const bezel = device.kind === "phone" ? 10 : device.kind === "tablet" ? 22 : 13;
    const border = device.kind === "phone" || device.kind === "tablet" ? 2 : 3;
    const shellWidth = width + (bezel + border) * 2;
    const shellHeight = height + (bezel + border) * 2;
    const extraWidth = device.kind === "laptop" ? 74 : 0;
    const extraHeight = device.kind === "laptop" ? 38 : device.kind === "desktop" ? 82 : 0;
    return { bezel, shellWidth, shellHeight,
        outerWidth: shellWidth + extraWidth, outerHeight: shellHeight + extraHeight,
        offsetX: extraWidth / 2 };
}
