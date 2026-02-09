import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View
} from "react-native";

import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

type PillButtonVariant = "primary" | "secondary" | "ghost";

type PillButtonSize = "md" | "lg";

export interface PillButtonProps extends PressableProps {
  label: string;
  variant?: PillButtonVariant;
  size?: PillButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftSlot?: React.ReactNode;
}

export const PillButton: React.FC<PillButtonProps> = ({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  leftSlot,
  style,
  disabled,
  ...pressableProps
}) => {
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const isLarge = size === "lg";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => {
        const { pressed } = state;
        const styleOverride = typeof style === "function" ? style(state) : style;
        return [
          styles.base,
          isLarge ? styles.large : styles.medium,
          isPrimary && styles.primary,
          isSecondary && styles.secondary,
          variant === "ghost" && styles.ghost,
          fullWidth && styles.fullWidth,
          pressed && !disabled && !loading && styles.pressed,
          (disabled || loading) && styles.disabled,
          styleOverride
        ];
      }}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.textOnNavy : colors.primary} />
      ) : (
        <View style={styles.content}>
          {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}
          <Text
            style={[
              styles.label,
              isLarge ? styles.labelLarge : styles.labelMedium,
              isPrimary ? styles.labelPrimary : styles.labelSecondary,
              variant === "ghost" && styles.labelGhost
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent"
  },
  medium: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg
  },
  large: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl
  },
  primary: {
    backgroundColor: colors.primary
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: colors.border
  },
  fullWidth: {
    width: "100%"
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95
  },
  disabled: {
    opacity: 0.6
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  leftSlot: {
    marginRight: spacing.sm
  },
  label: {
    ...typography.bodyBold
  },
  labelMedium: {
    fontSize: 15
  },
  labelLarge: {
    fontSize: 16
  },
  labelPrimary: {
    color: colors.textOnNavy
  },
  labelSecondary: {
    color: colors.text
  },
  labelGhost: {
    color: colors.primary
  }
});

export default PillButton;
