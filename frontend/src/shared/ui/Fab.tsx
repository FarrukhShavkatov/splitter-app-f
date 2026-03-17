// src/shared/ui/Fab.tsx
import { Button } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';

type Props = { onPress: () => void };

export default function Fab({ onPress }: Props) {
  return (
    <Button
      onPress={onPress}
      w={44}
      h={44}
      borderRadius={22}
      backgroundColor="$primary"
      pressStyle={{ backgroundColor: '$primaryHover' }}
      icon={<Plus size={24} color="white" />}
      position="absolute"
      bottom={24}
      right={16}
      elevation={4}
      shadowColor="#000"
      shadowOpacity={0.2}
      shadowRadius={4}
      shadowOffset={{ width: 0, height: 2 }}
      aria-label="Add Friend"
    />
  );
}