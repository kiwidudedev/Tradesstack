import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import TopBar from "@/components/TopBar";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function OnboardingScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <TopBar
          title="TradesStack"
          subtitle="Admin for NZ sole traders"
          inverted
          actions={[{ label: "Skip", onPress: () => router.replace("/(tabs)") }]}
        />

        <View style={styles.hero}>
          <View style={styles.sparkleOne} />
          <View style={styles.sparkleTwo} />
          <View style={styles.sparkleThree} />

          <Text style={styles.headline}>GET ADMIN DONE</Text>
          <Text style={styles.subtext}>
            Quotes, invoices, purchase orders, H&amp;S — sorted in minutes.
          </Text>

          <View style={styles.ctaRow}>
            <PillButton
              label="Sign in"
              variant="primary"
              size="lg"
              onPress={() => router.push("/(auth)/sign-in")}
              fullWidth
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy
  },
  container: {
    flex: 1,
    backgroundColor: colors.navy
  },
  hero: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    justifyContent: "center"
  },
  headline: {
    ...typography.heroTitle,
    color: colors.textOnNavy,
    fontSize: 48,
    lineHeight: 52,
    marginBottom: spacing.md
  },
  subtext: {
    ...typography.body,
    color: "rgba(255,255,255,0.9)",
    fontSize: 17,
    lineHeight: 24,
    marginBottom: spacing.xl
  },
  ctaRow: {
    marginBottom: spacing.md
  },
  sparkleOne: {
    position: "absolute",
    top: 90,
    right: 40,
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  sparkleTwo: {
    position: "absolute",
    top: 160,
    left: 48,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  sparkleThree: {
    position: "absolute",
    bottom: 160,
    right: 80,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(247,72,23,0.8)"
  }
});
