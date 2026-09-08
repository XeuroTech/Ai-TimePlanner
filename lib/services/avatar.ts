/**
 * Profile picture picking + persistence.
 *
 * `expo-image-picker` hands back a cache URI that the OS can reclaim at any
 * time, so the chosen photo is copied into the app's document directory
 * (survives restarts/cache eviction) under a name that changes on every pick
 * — that way a stored `avatarUri` is never stale in an <Image> cache keyed by
 * URI. The previous avatar file is deleted so old copies don't pile up.
 */
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

import { reportError } from '@/lib/services/observability';

export type AvatarPickResult =
  | { ok: true; uri: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export async function pickAvatar(uid: string, previousUri?: string | null): Promise<AvatarPickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== 'granted') {
    return { ok: false, canceled: false, error: 'Photo library permission denied. Enable it from system settings.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  const picked = result.assets?.[0];
  if (result.canceled || !picked) return { ok: false, canceled: true };

  try {
    const ext = picked.uri.split('.').pop()?.toLowerCase();
    const safeExt = ext && ext.length <= 5 ? ext : 'jpg';
    const dest = new File(Paths.document, `avatar-${uid}-${Date.now()}.${safeExt}`);
    new File(picked.uri).copy(dest);

    if (previousUri) {
      try {
        const old = new File(previousUri);
        if (old.uri.startsWith(Paths.document.uri) && old.exists) old.delete();
      } catch {
        // Best-effort cleanup only — a leftover file is not worth failing the pick over.
      }
    }
    return { ok: true, uri: dest.uri };
  } catch (e) {
    reportError(e, 'avatar/pick');
    return { ok: false, canceled: false, error: 'Could not save the selected photo.' };
  }
}
