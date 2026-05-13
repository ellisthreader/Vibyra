export const PHASER_PATCH_SCRIPT = `
function shouldPatchPhaserUrl(url) {
  var value = String(url || "");
  return !value
    || /^(?:data:|\\.\\.?\\/|\\/|[a-z0-9_-]+(?:\\.[a-z0-9]+)?$)/i.test(value)
    || /cdn\\.jsdelivr\\.net\\/gh\\/vibyra\\/assets@main\\//i.test(value);
}
function patchPhaser() {
  var plugin = window.Phaser && window.Phaser.Loader && window.Phaser.Loader.LoaderPlugin && window.Phaser.Loader.LoaderPlugin.prototype;
  if (!plugin || plugin.__vibyraImagePatched || !plugin.image) return;
  plugin.__vibyraImagePatched = true;
  var original = plugin.image;
  plugin.image = function (key, url) {
    if (shouldPatchPhaserUrl(url)) {
      reportResource("image", String(url || key), "using preview placeholder");
      var fallback = previewFallbackUrl(key);
      if (fallback) return original.call(this, key, fallback, arguments[2]);
    }
    return original.apply(this, arguments);
  };
}
var patchTimer = setInterval(function () {
  patchPhaser();
  if (window.Phaser && window.Phaser.Loader) clearInterval(patchTimer);
}, 40);
setTimeout(function () { clearInterval(patchTimer); }, 5000);
`;
