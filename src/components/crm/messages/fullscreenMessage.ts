import { tick } from 'svelte';

/** Lift composing above the admin navigation without changing its page state. */
export function fullscreenMessage(node: HTMLElement) {
  const previousOverflow = document.body.style.overflow;
  let active = true;
  document.body.style.overflow = 'hidden';
  void tick().then(() => { if (active) document.body.appendChild(node); });
  return { destroy() { active = false; node.remove(); document.body.style.overflow = previousOverflow; } };
}
