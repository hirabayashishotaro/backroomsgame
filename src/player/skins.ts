/** The player's outfits (pure: used by the settings). */
export type Skin = 'suit' | 'hoodie' | 'hawaiian' | 'researcher' | 'casual' | 'military';

export const SKINS: Array<[Skin, string]> = [
  ['suit', 'スーツ'],
  ['hoodie', 'フード'],
  ['hawaiian', 'ハワイアン'],
  ['researcher', '調査隊員'],
  ['casual', '私服'],
  ['military', '軍隊'],
];
