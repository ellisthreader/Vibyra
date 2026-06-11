# Provider Pixel Logos

Run the reproducible asset pipeline from the repository root:

```bash
node scripts/provider-logo-assets/build.mjs
```

The pipeline downloads pinned SVG sources, records their URLs and SHA-256
checksums, rasterizes transparent 64x64 RGBA pixels with the repository's
Electron runtime, and writes compact `rgba-rle-v1` data to `generated.mjs`.
The key order intentionally matches `registeredProviderFamilies()`.
Monochrome vectors are rendered white so their original alpha masks remain
visible on dark terminal backgrounds; multicolor vectors retain their colors.

`source-metadata.json` distinguishes the pinned vector source from each
provider's official brand or model-family page. A `fallback` value of `true`
means the intended family mark was unavailable and a substitute was used.
