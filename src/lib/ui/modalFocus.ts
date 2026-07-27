export type ModalFocusOptions = {
  onEscape: () => void;
  initialFocusSelector?: string;
};

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(node: HTMLElement) {
  return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => {
      if (
        element.hasAttribute('hidden')
        || element.closest('[inert], [aria-hidden="true"]')
        || element.closest('fieldset[disabled]')
      ) {
        return false;
      }

      let current: HTMLElement | null = element;
      while (current && node.contains(current)) {
        const style = getComputedStyle(current);
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || style.visibility === 'collapse'
        ) {
          return false;
        }
        current = current.parentElement;
      }
      return true;
    });
}

/**
 * Gives every CRM dialog the same keyboard contract: initial focus remains
 * inside the panel, Tab wraps within it, Escape invokes the real close path,
 * and focus returns to the control that opened the dialog.
 */
export function modalFocus(node: HTMLElement, options: ModalFocusOptions) {
  let currentOptions = options;
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const focusInitialControl = () => {
    const requested = currentOptions.initialFocusSelector
      ? node.querySelector<HTMLElement>(currentOptions.initialFocusSelector)
      : null;
    const target = requested || focusableElements(node)[0] || node;
    target.focus();
  };

  const initialFocusFrame = requestAnimationFrame(focusInitialControl);

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      currentOptions.onEscape();
      return;
    }

    if (event.key !== 'Tab') return;
    const controls = focusableElements(node);
    if (controls.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', handleKeydown);

  return {
    update(nextOptions: ModalFocusOptions) {
      currentOptions = nextOptions;
    },
    destroy() {
      cancelAnimationFrame(initialFocusFrame);
      node.removeEventListener('keydown', handleKeydown);
      if (previousFocus?.isConnected) {
        requestAnimationFrame(() => previousFocus.focus());
      }
    },
  };
}
