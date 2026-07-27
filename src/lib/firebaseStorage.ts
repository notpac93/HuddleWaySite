import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseApp } from './firebase';

let storageInstance: FirebaseStorage | null = null;

/**
 * Initializes Firebase Storage only when an upload-capable CRM module opens.
 *
 * Importing `firebaseApp` guarantees the core module has initialized App Check
 * before this getter can create the Storage service.
 */
export function getFirebaseStorage(): FirebaseStorage {
  storageInstance ??= getStorage(firebaseApp);
  return storageInstance;
}
