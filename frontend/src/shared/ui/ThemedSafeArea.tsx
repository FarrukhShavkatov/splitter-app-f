import React from 'react'
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context'
import { useTheme } from 'tamagui'

export function ThemedSafeArea({ style, ...props }: SafeAreaViewProps) {
  const theme = useTheme()
  const bg = theme.background?.val ?? '#121212'

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: bg }, style]} {...props} />
  )
}
