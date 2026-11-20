/** Keep iOS text selection in the same coordinate space as the visible dialog.
 * The keyboard may resize or pan the visual viewport independently of layout.
 */
export function scoreModalViewport(node: HTMLElement) {
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      node.style.setProperty('--score-modal-top', `${viewport?.offsetTop || 0}px`);
      node.style.setProperty('--score-modal-height', `${viewport?.height || window.innerHeight}px`);
    });
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();
  return { destroy() {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  } };
}
