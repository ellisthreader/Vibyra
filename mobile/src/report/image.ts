import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** A legible, bounded image for the report's 8 MB upload limit. */
export async function pickReportImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  const image = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width || 0, asset.height || 0);
  if (longest > 2400) {
    if (asset.width >= asset.height) image.resize({ width: 2400 });
    else image.resize({ height: 2400 });
  }
  const rendered = await image.renderAsync();
  return (await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG })).uri;
}
