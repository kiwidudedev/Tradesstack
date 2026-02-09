import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";

import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";

interface CardProps extends ViewProps {
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ padded = true, style, ...props }) => {
  return <View style={[styles.card, padded && styles.padded, style]} {...props} />;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  padded: {
    padding: spacing.lg
  }
});

export default Card;
