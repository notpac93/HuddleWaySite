export type GlassAppearance = {
  style: 'standard' | 'layered' | 'quiet' | 'pearl';
  tintColor: string;
  tintStrength: number;
  photoBlur: number;
};

export function normalizeGlassAppearance(value?: Partial<GlassAppearance>): GlassAppearance {
  return {
    style: value?.style ?? 'pearl',
    tintColor: value?.tintColor ?? '#238B93',
    tintStrength: value?.tintStrength ?? 0.18,
    photoBlur: value?.photoBlur ?? 0,
  };
}

export function validGlassAppearance(value?: GlassAppearance) {
  const v = normalizeGlassAppearance(value);
  return ['standard', 'layered', 'quiet', 'pearl'].includes(v.style)
    && /^#[0-9a-f]{6}$/i.test(v.tintColor)
    && Number.isFinite(v.tintStrength) && v.tintStrength >= 0 && v.tintStrength <= 0.55
    && Number.isFinite(v.photoBlur) && v.photoBlur >= 0 && v.photoBlur <= 6;
}
