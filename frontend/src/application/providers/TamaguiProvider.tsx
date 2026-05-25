// src/application/providers/TamaguiProvider.tsx
import React from 'react'
import { useColorScheme } from 'react-native'  // dark-mode colors
import { TamaguiProvider as Provider, Theme } from '@tamagui/core'
import { PortalProvider } from '@tamagui/portal'
import { useFonts } from 'expo-font'
import config from '../../../tamagui.config'
import { useAppStore } from '@/shared/lib/stores/app-store'

interface TamaguiProviderProps {
  children: React.ReactNode
}

export const TamaguiProvider: React.FC<TamaguiProviderProps> = ({ children }) => {
  const [fontsLoaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  const themeSetting = useAppStore((s) => s.theme)
  const systemScheme = useColorScheme()

  const resolvedTheme =
    themeSetting === 'system'
      ? (systemScheme === 'dark' ? 'dark' : 'light')
      : themeSetting

  if (!fontsLoaded) {
    return null
  }

  return (
    <Provider config={config} defaultTheme={resolvedTheme}>
      <Theme name={resolvedTheme}>
        <PortalProvider>
          {children}
        </PortalProvider>
      </Theme>
    </Provider>
  )
}