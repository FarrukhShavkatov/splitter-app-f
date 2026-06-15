import React from 'react';
import { XStack, YStack, Text, Button, Spinner } from 'tamagui';
import { Share2, RotateCcw } from '@tamagui/lucide-icons';

type Props = {
  onShare: () => void;
  onRepeat?: () => void;
  shareLabel: string;
  repeatLabel: string;
  hint?: string;
  busy?: 'share' | 'repeat' | null;
  repeatDisabled?: boolean;
};

export function SessionActionsBar({
  onShare,
  onRepeat,
  shareLabel,
  repeatLabel,
  hint,
  busy,
  repeatDisabled,
}: Props) {
  return (
    <YStack w="100%" gap="$2">
      {hint ? (
        <Text fontSize={12} color="$gray10" lineHeight={18}>
          {hint}
        </Text>
      ) : null}
      <XStack gap="$2" w="100%">
        <Button
          f={1}
          unstyled
          h={44}
          borderRadius={10}
          borderWidth={1}
          borderColor="$primary"
          bg="rgba(46,204,113,0.08)"
          ai="center"
          jc="center"
          onPress={onShare}
          disabled={busy === 'share'}
          opacity={busy === 'share' ? 0.7 : 1}
          pressStyle={{ opacity: 0.85 }}
        >
          <XStack ai="center" gap="$2">
            {busy === 'share' ? (
              <Spinner size="small" color="$primary" />
            ) : (
              <Share2 size={18} color="$primary" />
            )}
            <Text fontSize={14} fontWeight="700" color="$primary">
              {shareLabel}
            </Text>
          </XStack>
        </Button>
        {onRepeat ? (
          <Button
            f={1}
            unstyled
            h={44}
            borderRadius={10}
            bg="$primary"
            ai="center"
            jc="center"
            onPress={onRepeat}
            disabled={repeatDisabled || busy === 'repeat'}
            opacity={repeatDisabled || busy === 'repeat' ? 0.7 : 1}
            pressStyle={{ opacity: 0.9 }}
          >
            <XStack ai="center" gap="$2">
              {busy === 'repeat' ? (
                <Spinner size="small" color="white" />
              ) : (
                <RotateCcw size={18} color="white" />
              )}
              <Text fontSize={14} fontWeight="700" color="white">
                {repeatLabel}
              </Text>
            </XStack>
          </Button>
        ) : null}
      </XStack>
    </YStack>
  );
}
