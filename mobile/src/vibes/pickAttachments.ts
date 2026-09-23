import * as DocumentPicker from 'expo-document-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { AttachmentSource } from './types';

/** The server's photo size, so the phone uploads no more than will be kept. */
const LONG_EDGE = 1280;
/** PHP's default upload limit on the server. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** What a chat can read: photos, PDFs and plain text or code. */
const FILE_TYPES = [
  'application/pdf',
  'text/*',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'public.source-code',
];

/** Picked files, or the sentence to show instead. Cancelling is neither. */
export type Picked = { sources: AttachmentSource[] } | { error: string } | null;

/**
 * Every photo is re-encoded as a JPEG at most 1280px on the long edge before it
 * leaves the phone: a full-size iPhone photo is several times the server's upload
 * limit, and re-encoding also bakes in the rotation the camera only recorded.
 */
async function shrink(
  asset: ImagePicker.ImagePickerAsset,
  index: number,
): Promise<AttachmentSource> {
  const scale = Math.min(
    1,
    LONG_EDGE / Math.max(asset.width || LONG_EDGE, asset.height || LONG_EDGE),
  );
  const resize =
    asset.width >= asset.height
      ? { width: Math.round(asset.width * scale) }
      : { height: Math.round(asset.height * scale) };
  const result = await manipulateAsync(asset.uri, scale < 1 ? [{ resize }] : [], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  const name = (asset.fileName?.replace(/\.[^.]+$/, '') || `photo-${index + 1}`) + '.jpg';
  return { uri: result.uri, name, mimeType: 'image/jpeg', file: await forWeb(result.uri) };
}

/** The browser uploads a Blob, not a path, so a manipulated photo is read back into one. */
async function forWeb(uri: string): Promise<Blob | undefined> {
  return Platform.OS === 'web' ? (await fetch(uri)).blob() : undefined;
}

export async function takePhoto(): Promise<Picked> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    return { error: 'Allow the camera for Vibyra in Settings to take a photo.' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : { sources: await Promise.all(result.assets.map(shrink)) };
}

export async function choosePhotos(limit: number): Promise<Picked> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  return result.canceled
    ? null
    : { sources: await Promise.all(result.assets.slice(0, limit).map(shrink)) };
}

export async function chooseFiles(limit: number): Promise<Picked> {
  const result = await DocumentPicker.getDocumentAsync({
    type: FILE_TYPES,
    multiple: limit > 1,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const assets = result.assets.slice(0, limit);
  const large = assets.find((asset) => (asset.size ?? 0) > MAX_FILE_BYTES);
  if (large) return { error: `${large.name} is over 2 MB. Attach a smaller file.` };
  return {
    sources: assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      file: asset.file ?? undefined,
    })),
  };
}
