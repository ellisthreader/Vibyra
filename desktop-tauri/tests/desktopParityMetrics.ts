// The fixture reports its own geometry after its bundled fonts have settled.
// This is layout evidence, not a claim of cross-OS pixel identity.
export async function reportParityLayout() {
  await document.fonts.ready;
  await new Promise(resolve => setTimeout(resolve, 1500));
  const selectors = ['.chrome','.chrome__brand','.chrome__logo','.chrome__right','.product-mode-switch','.pstrip','.project-workspace','.terminal-grid','.settings-modal','.settings-nav','.settings-pane','.auth__bar','.login','.first-welcome','.teammates-main','.companion'];
  const geometry = Object.fromEntries(selectors.map(selector => {
    const element = document.querySelector(selector);
    if (!element) return [selector,null];
    const {x,y,width,height} = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return [selector,{x,y,width,height,fontFamily:style.fontFamily,background:style.backgroundColor}];
  }));
  const report = {platform:navigator.platform,query:location.search,width:innerWidth,height:innerHeight,
    overflow:document.documentElement.scrollWidth > innerWidth,geometry,
    controls:[...document.querySelectorAll('.window-controls button')].map(e => e.getAttribute('aria-label'))};
  Object.assign(window,{parityLayout:report});
  await fetch('/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
}
