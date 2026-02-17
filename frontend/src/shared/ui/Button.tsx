// почти полностью переписал данный файл из-за багов, ошибок и устаревших элементов кода

import { forwardRef, type ComponentProps, type ComponentRef } from 'react';
import { Button as TamaguiButton, Text } from 'tamagui';

type Variant = 'primary' | 'secondary' | 'outline';
type Size = 'small' | 'medium' | 'large';
type TamaguiButtonProps = ComponentProps<typeof TamaguiButton>;
type TamaguiButtonRef = ComponentRef<typeof TamaguiButton>;

interface CustomButtonProps
  extends Omit<TamaguiButtonProps, 'children' | 'size' | 'disabled' | 'variant'> {
  title: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}

const sizeStyles: Record<Size, { height: '$3' | '$4' | '$5'; paddingHorizontal: '$4' | '$6' | '$8' }> = {
  small: { height: '$3', paddingHorizontal: '$4' },
  medium: { height: '$4', paddingHorizontal: '$6' },
  large: { height: '$5', paddingHorizontal: '$8' },
};

const variantStyles: Record<Variant, { backgroundColor: string; color: string; borderWidth?: number; borderColor?: string }> = {
  primary: {
    backgroundColor: '#2ECC71',
    color: '#FFFFFF',
  },
  secondary: {
    backgroundColor: '$gray4',
    color: '$gray12',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '$green10',
    color: '$green10',
  },
};

export const Button = forwardRef<TamaguiButtonRef, CustomButtonProps>(
  ({ title, variant = 'primary', size = 'medium', disabled = false, ...rest }, ref) => {
    const tone = variantStyles[variant];

    const styles = {
      borderRadius: '$4' as const,
      pressStyle: { scale: 0.97 },
      ...sizeStyles[size],
      ...tone,
      ...(disabled
        ? {
            backgroundColor: variant === 'outline' ? 'transparent' : '$gray8',
            borderColor: variant === 'outline' ? '$gray8' : tone.borderColor,
            color: '$gray8',
          }
        : null),
    };

    return (
      <TamaguiButton ref={ref} {...styles} disabled={disabled} {...rest}>
        <Text color={styles.color} fontWeight="600" fontSize="$4">
          {title}
        </Text>
      </TamaguiButton>
    );
  }
);

Button.displayName = 'Button';
