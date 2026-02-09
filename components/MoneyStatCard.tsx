import React from "react";
import { StyleSheet, Text, View } from "react-native";

import Card from "@/components/Card";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

interface MoneyStatCardProps {
  label: string;
  value: string;
  hint: string;
}

export const MoneyStatCard: React.FC<MoneyStatCardProps> = ({ label, value, hint }) => {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md
  },
  label: {
    ...typography.label,
    color: colors.textMuted
  },
  valueRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs
  },
  value: {
    ...typography.statNumber,
    color: colors.text
  },
  hint: {
    ...typography.body,
    color: colors.textMuted
  }
});

export default MoneyStatCard;
