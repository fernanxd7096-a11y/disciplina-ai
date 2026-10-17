type Picker = { result: unknown; granted: boolean };

/** Cámara/galería falsas: define qué devuelve la próxima foto y si hay permiso. */
export function setPicker(p: Partial<Picker>) {
  // Carga el mock (crea globalThis.__picker) antes de modificarlo.
  jest.requireMock('expo-image-picker');
  Object.assign((globalThis as unknown as { __picker: Picker }).__picker, p);
}

export function photoAsset(width = 3000, height = 2000) {
  return { canceled: false, assets: [{ uri: 'file:///foto.jpg', width, height }] };
}
