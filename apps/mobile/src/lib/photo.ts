import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export class PhotoPermissionError extends Error {}

const MAX_SIDE = 1280;

/**
 * Abre la cámara o la galería y devuelve la foto como JPEG reducido (≤ 1280 px,
 * calidad 0,7): menos datos móviles, subida rápida y suficiente para el análisis.
 * null si el usuario cancela.
 */
export async function pickFoodPhoto(source: 'camera' | 'library'): Promise<{ uri: string; base64: string } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PhotoPermissionError(
      source === 'camera' ? 'Sin permiso de cámara. Actívalo en los ajustes del teléfono para fotografiar tu comida.' : 'Sin permiso para ver tus fotos. Actívalo en los ajustes del teléfono.',
    );
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;

  const ctx = ImageManipulator.manipulate(res.assets[0].uri);
  const probe = await ctx.renderAsync();
  if (Math.max(probe.width, probe.height) > MAX_SIDE) {
    ctx.resize(probe.width >= probe.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('No se pudo procesar la foto.');
  return { uri: out.uri, base64: out.base64 };
}
