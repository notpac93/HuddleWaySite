const dialog = document.querySelector('[data-app-store-dialog]');
const triggers = document.querySelectorAll('[data-app-store-choice]');
const closers = document.querySelectorAll('[data-app-store-dialog-close]');

if (dialog instanceof HTMLDialogElement && triggers.length > 0) {
  const openDialog = (event) => {
    event.preventDefault();

    if (!dialog.open) {
      dialog.showModal();
    }
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', openDialog);
  });

  closers.forEach((closer) => {
    closer.addEventListener('click', () => {
      dialog.close();
    });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}