/** Keep transient feedback outside scroll panels and modal stacking contexts. */
export function toast(node: HTMLElement, options: { persistent?: boolean; dismiss?: () => void } = {}) {
  let region = document.querySelector<HTMLElement>('[data-crm-toast-region]');
  if (!region) {
    region = document.createElement('div');
    region.dataset.crmToastRegion = '';
    region.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 16px);right:16px;width:min(380px,calc(100vw - 32px));z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;font-family:Roboto,Arial,sans-serif';
    document.body.append(region);
  }
  const host = region;
  const marker = document.createComment('notification');
  node.before(marker);
  host.append(node);
  node.dataset.crmToast = '';
  const style = document.createElement('style');
  style.textContent = `[data-crm-toast]{position:relative!important;inset:auto!important;z-index:auto!important;width:100%!important;max-width:100%!important;box-sizing:border-box;margin:0!important;padding:14px 48px 14px 16px!important;border-radius:14px!important;box-shadow:0 8px 28px #071d3b26!important;pointer-events:auto;font-size:14px!important;line-height:1.45!important;background-color:#fff;color:#17314d;overflow-wrap:anywhere}[data-crm-toast] h3,[data-crm-toast] p{font-size:14px!important;line-height:1.45!important;margin-top:4px!important;margin-bottom:0!important}[data-crm-toast] h3{margin-top:0!important}[data-crm-toast] button{font-size:14px!important}[data-crm-toast] .toast-close{position:absolute;right:4px;top:4px;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:inherit;font-size:24px!important;cursor:pointer}[data-crm-toast][hidden]{display:none!important}`;
  host.append(style);
  let timer: ReturnType<typeof setTimeout>;
  let paused = false;
  let signature = '';
  function dismiss() { clearTimeout(timer); node.hidden = true; options.dismiss?.(); }
  const existingDismiss = Array.from(node.querySelectorAll('button')).find(button => /dismiss/i.test(button.textContent || button.getAttribute('aria-label') || ''));
  const hide = () => { clearTimeout(timer); node.hidden = true; };
  existingDismiss?.addEventListener('click', hide);
  if (existingDismiss) {
    existingDismiss.setAttribute('aria-label', existingDismiss.getAttribute('aria-label') || 'Dismiss notification');
    existingDismiss.classList.add('toast-close');
    existingDismiss.textContent = '×';
  }
  let close: HTMLButtonElement | undefined;
  if (!existingDismiss) {
    close = document.createElement('button');
    close.type = 'button'; close.className = 'toast-close'; close.setAttribute('aria-label', 'Dismiss notification'); close.textContent = '×';
    close.addEventListener('click', dismiss); node.append(close);
  }
  function pause() { paused = true; clearTimeout(timer); }
  function resume() {
    paused = false; clearTimeout(timer);
    const actionable = Array.from(node.querySelectorAll('button,a')).some(element => element !== close && element !== existingDismiss);
    if (!options.persistent && !actionable && node.getAttribute('role') !== 'alert') timer = setTimeout(dismiss, 5000);
  }
  const observer = new MutationObserver(() => {
    const next = node.textContent || '';
    if (next !== signature) { signature = next; node.hidden = false; if (!paused) resume(); }
  });
  signature = node.textContent || '';
  observer.observe(node, { childList: true, subtree: true, characterData: true });
  node.addEventListener('mouseenter', pause); node.addEventListener('mouseleave', resume);
  node.addEventListener('focusin', pause); node.addEventListener('focusout', resume);
  resume();
  return { update(next: typeof options) { options = next; if (!paused) resume(); }, destroy() {
    clearTimeout(timer); observer.disconnect();
    node.removeEventListener('mouseenter', pause); node.removeEventListener('mouseleave', resume);
    node.removeEventListener('focusin', pause); node.removeEventListener('focusout', resume);
    close?.removeEventListener('click', dismiss);
    existingDismiss?.removeEventListener('click', hide);
    node.remove(); marker.remove(); style.remove();
    if (!host.querySelector('[data-crm-toast]')) host.remove();
  } };
}
