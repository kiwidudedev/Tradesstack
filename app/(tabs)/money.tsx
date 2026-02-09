import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import MoneyStatCard from "@/components/MoneyStatCard";
import { computeAccEstimate } from "@/lib/money";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0
  }).format(value);

export default function MoneyScreen() {
  const insets = useSafeAreaInsets();
  const stats = useMemo(() => {
    const gstCollected = 12480;
    const gstPaid = 4320;
    const gstToPutAside = Math.max(gstCollected - gstPaid, 0);
    const accEstimate = computeAccEstimate(86500, 1.6);

    return [
      {
        label: "GST collected",
        value: formatCurrency(gstCollected),
        hint: "From invoices marked sent or paid."
      },
      {
        label: "GST paid",
        value: formatCurrency(gstPaid),
        hint: "From purchase orders and expenses."
      },
      {
        label: "GST to put aside",
        value: formatCurrency(gstToPutAside),
        hint: "Collected minus paid. Park it early."
      },
      {
        label: "ACC estimate",
        value: formatCurrency(accEstimate),
        hint: "Rough cut using your ACC rate."
      }
    ];
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle}>Money</Text>
            <Text style={styles.heroSubtitle}>Simple numbers. Clear calls.</Text>
          </View>
        </View>

        <Text style={styles.title}>Keep it tidy</Text>
        <Text style={styles.subtitle}>No charts. Just what to do next.</Text>

        {stats.map((stat) => (
          <MoneyStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
  },
  content: {
    paddingBottom: spacing.xxl
  },
  heroStrip: {
    backgroundColor: colors.navy,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: spacing.lg
  },
  heroInner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  heroTitle: {
    ...typography.screenTitle,
    color: colors.textOnNavy,
    marginBottom: 4
  },
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  title: {
    ...typography.screenTitle,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  }
});
