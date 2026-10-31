import Swal from 'sweetalert2';

/*
 * SweetAlert2 ships its own palette, so the QuakeStudio look is applied in two
 * places: `buttonsStyling: false` hands the buttons back to us, and the
 * `.qs-swal*` rules in index.css set the popup, type and icon colours from the
 * design tokens. Colours passed here are tokens too, never literals.
 */
type ConfirmTone = 'danger' | 'primary';

const sharedOptions = {
  background: 'var(--surface)',
  color: 'var(--text)',
  buttonsStyling: false,
  customClass: {
    popup: 'qs-swal',
    title: 'qs-swal-title',
    htmlContainer: 'qs-swal-text',
    actions: 'qs-swal-actions',
  },
} as const;

export function swalConfirm(options: {
  title: string;
  text: string;
  confirmLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
}): void {
  const tone = options.tone ?? 'danger';

  Swal.fire({
    ...sharedOptions,
    title: options.title,
    text: options.text,
    icon: 'warning',
    iconColor: 'var(--warning)',
    showCancelButton: true,
    confirmButtonText: options.confirmLabel ?? 'Confirm',
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      ...sharedOptions.customClass,
      confirmButton: `qs-swal-confirm qs-swal-confirm--${tone}`,
      cancelButton: 'qs-swal-cancel',
    },
  }).then((result) => {
    if (result.isConfirmed) options.onConfirm();
  });
}

export function swalAlert(options: {
  title: string;
  text: string;
  icon?: 'success' | 'error' | 'warning' | 'info';
}): void {
  const icon = options.icon ?? 'info';
  const iconColor =
    icon === 'error' ? 'var(--danger)' : icon === 'warning' ? 'var(--warning)' : 'var(--primary)';

  Swal.fire({
    ...sharedOptions,
    title: options.title,
    text: options.text,
    icon,
    iconColor,
    confirmButtonText: 'OK',
    customClass: {
      ...sharedOptions.customClass,
      confirmButton: 'qs-swal-confirm qs-swal-confirm--primary',
    },
  });
}
