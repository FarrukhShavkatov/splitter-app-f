// tamagui.config.ts
import { createTamagui } from '@tamagui/core'
import { config } from '@tamagui/config/v3'

const DARK_BG = '#121212'
const DARK_SURFACE = '#1E1E1E'
const DARK_SURFACE_ALT = '#2A2A2A'
const DARK_BORDER = '#333333'
const DARK_TEXT = '#F5F5F5'
const DARK_TEXT_MUTED = '#A3A3A3'

const appConfig = createTamagui({
  ...config,
  themes: {
    ...config.themes,
    light: {
      ...config.themes.light,
      primary: '#2ECC71',
      primaryHover: '#27AE60',
      success: '#2ECC71',
      error: '#F44336',
      warning: '#FF9800',
    },
    dark: {
      ...config.themes.dark,
      background: DARK_BG,
      backgroundHover: '#1A1A1A',
      backgroundPress: DARK_SURFACE,
      backgroundFocus: DARK_SURFACE,
      backgroundStrong: DARK_SURFACE_ALT,
      color: DARK_TEXT,
      colorHover: '#FFFFFF',
      colorPress: '#E8E8E8',
      colorFocus: DARK_TEXT,
      colorTransparent: 'rgba(255,255,255,0)',
      borderColor: DARK_BORDER,
      borderColorHover: '#404040',
      borderColorFocus: '#4A4A4A',
      borderColorPress: '#3A3A3A',
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowColorHover: 'rgba(0,0,0,0.7)',
      shadowColorPress: 'rgba(0,0,0,0.5)',
      shadowColorFocus: 'rgba(0,0,0,0.6)',
      primary: '#2ECC71',
      primaryHover: '#58D68D',
      success: '#2ECC71',
      error: '#EF5350',
      warning: '#FFB74D',
      // Elevated surfaces (list rows, cards)
      color1: DARK_SURFACE,
      color2: DARK_SURFACE_ALT,
      color3: '#333333',
      color4: '#3D3D3D',
      color5: '#484848',
      color6: '#525252',
      color7: '#5C5C5C',
      color8: '#666666',
      color9: DARK_TEXT_MUTED,
      color10: '#B0B0B0',
      color11: '#D4D4D4',
      color12: DARK_TEXT,
    },
  },
})

export default appConfig

export type Conf = typeof appConfig

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends Conf {}
}
