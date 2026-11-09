/** Sky presets (pure data, shared by level definitions and the sky dome). */

export type SkyKind = 'day' | 'dusk' | 'night' | 'dawn' | 'void' | 'overcast';

export interface SkyDef {
  kind: SkyKind;
  /** Draw a sea of clouds below the horizon (groundless levels). */
  cloudSea?: boolean;
}

export interface SkyColors {
  top: number;
  horizon: number;
  bottom: number;
  sun: number;
  sunDir: [number, number, number];
  sunSize: number;
  stars: number;
  clouds: number;
  cloudColor: number;
}

export const SKY_PRESETS: Record<SkyKind, SkyColors> = {
  day: { top: 0x3f86d8, horizon: 0xbfe2f6, bottom: 0x9fc4d8, sun: 0xfff8e0, sunDir: [0.3, 0.75, -0.6], sunSize: 0.02, stars: 0, clouds: 0.55, cloudColor: 0xffffff },
  dusk: { top: 0x2a3166, horizon: 0xf09a5a, bottom: 0x5a3a4a, sun: 0xffb070, sunDir: [-0.7, 0.08, -0.7], sunSize: 0.03, stars: 0.15, clouds: 0.5, cloudColor: 0xf3a27a },
  night: { top: 0x040818, horizon: 0x1a2440, bottom: 0x080a14, sun: 0xe8eeff, sunDir: [0.4, 0.55, -0.7], sunSize: 0.012, stars: 1, clouds: 0.2, cloudColor: 0x2a3550 },
  dawn: { top: 0x2b3f6e, horizon: 0xf2a782, bottom: 0x8a94a8, sun: 0xffd2a0, sunDir: [0.2, 0.06, -1], sunSize: 0.035, stars: 0.25, clouds: 0.7, cloudColor: 0xd8c0c8 },
  void: { top: 0x000000, horizon: 0x05060a, bottom: 0x000000, sun: 0x000000, sunDir: [0, 1, 0], sunSize: 0, stars: 0.35, clouds: 0, cloudColor: 0x000000 },
  overcast: { top: 0x7a8492, horizon: 0xb4bcc4, bottom: 0x8a929a, sun: 0xffffff, sunDir: [0, 1, 0], sunSize: 0, stars: 0, clouds: 0.9, cloudColor: 0xd0d6dc },
};

