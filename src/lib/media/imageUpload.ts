import type { CrmImageUploadPurpose } from '../api/BackendApi';

export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;

const supportedImageTypes = new Set(
  IMAGE_FILE_ACCEPT.split(','),
);

export function validateImageFile(file: File | null): string {
  if (!file) return '';
  if (!supportedImageTypes.has(String(file.type || '').toLowerCase())) {
    return 'Choose a PNG, JPG, GIF, or WebP image.';
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1) {
    return 'The selected image is empty.';
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return 'Choose an image that is 10 MB or smaller.';
  }
  return '';
}

export function imageUploadPurposeLabel(purpose: CrmImageUploadPurpose) {
  if (purpose === 'branding-logo') return 'organization logo';
  if (purpose === 'season-banner') return 'season banner';
  return 'event cover';
}
