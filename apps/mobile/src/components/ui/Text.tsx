import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, typography, type ColorToken, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
};

/** Texto tipográfico de la app. Siempre usar este en lugar de <Text> de React Native. */
export function Text({ variant = 'body', color = 'text', align, style, ...rest }: TextProps) {
  const base = typography[variant];
  return (
    <RNText
      {...rest}
      style={[
        base as TextStyle,
        { color: colors[color], textAlign: align },
        variant === 'label' && { textTransform: 'uppercase' },
        style,
      ]}
    />
  );
}
