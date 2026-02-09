import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function CreateScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle}>Create</Text>
            <Text style={styles.heroSubtitle}>One screen. One tap.</Text>
          </View>
        </View>

        <Text style={styles.title}>Create</Text>
        <Text style={styles.subtitle}>Pick a document and move fast.</Text>

        <View style={styles.buttonStack}>
          <PillButton label="Quote" size="lg" fullWidth onPress={() => router.push("/quotes/new")} />
          <PillButton
            label="Invoice"
            size="lg"
            fullWidth
            onPress={() => router.push("/invoices/new")}
          />
          <PillButton
            label="Purchase Order"
            size="lg"
            fullWidth
            onPress={() => router.push("/pos/new")}
          />
          <PillButton
            label="Safety Record"
            size="lg"
            fullWidth
            onPress={() => router.push("/safety/new")}
          />
        </View>
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
    paddingHorizontal: spacing.xl,
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
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xs
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl
  },
  buttonStack: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl
  }
});
