import { tick } from 'svelte';

/** Lift composing above the admin navigation without changing its page state. */
export function fullscreenMessage(node: HTMLElement) {
  const previousOverflow = document.body.style.overflow;
  let active = true;
  document.body.style.overflow = 'hidden';
  const host = node.closest('.crm-ui-shell-root') ?? document.body;
  void tick().then(() => { if (active) host.appendChild(node); });
  return { destroy() { active = false; node.remove(); document.body.style.overflow = previousOverflow; } };
}
