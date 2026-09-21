import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PhotoSource = 'camera' | 'library';
const SIDE = 512;

/**
 * A profile photo, ready to send: square where the picker can crop (iOS and
 * Android), then shrunk so its short side is 512 and saved as a JPEG. The server
 * crops, resizes and re-encodes again whatever arrives, so this is about the upload,
 * not the result: a full-size camera photo is several megabytes, and PHP turns away
 * anything over 2 MB before Vibyra sees it. Null means the person backed out.
 */
export async function pickProfilePhoto(source: PhotoSource): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error(permission.canAskAgain
      ? 'Allow the camera to take a profile photo.' : 'Turn on camera access for Vibyra in the Settings app to take a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  // Shrink by the short side, so a landscape photo still covers the 512 square the
  // server cuts from its middle; never enlarge one that is already small.
  if (asset.width && asset.height && Math.min(asset.width, asset.height) > SIDE)
    context.resize(asset.width <= asset.height ? { width: SIDE } : { height: SIDE });
  const image = await context.renderAsync();
  return (await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri;
}
