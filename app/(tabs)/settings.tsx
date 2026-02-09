import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import Card from "@/components/Card";
import PillButton from "@/components/PillButton";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [gstRegistered, setGstRegistered] = useState(true);
  const [gstRate, setGstRate] = useState("15");
  const [accRate, setAccRate] = useState("1.6");

  const handleSignOut = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      router.replace("/onboarding");
    } catch (error) {
      console.error(error);
      Alert.alert("Sign out failed", "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle}>Settings</Text>
            <Text style={styles.heroSubtitle}>Keep the defaults honest.</Text>
          </View>
        </View>

        <Text style={styles.title}>Business settings</Text>
        <Text style={styles.subtitle}>These feed totals across quotes, invoices, and money.</Text>

        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>GST registered</Text>
              <Text style={styles.rowHint}>Toggle GST on totals and summaries.</Text>
            </View>
            <Switch value={gstRegistered} onValueChange={setGstRegistered} />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>GST rate (%)</Text>
            <TextInput
              value={gstRate}
              onChangeText={setGstRate}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>ACC rate (%)</Text>
            <TextInput
              value={accRate}
              onChangeText={setAccRate}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
        </Card>

        <PillButton label="Sign out" variant="ghost" onPress={handleSignOut} style={styles.signOut} />
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
  },
  card: {
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg
  },
  rowText: {
    flex: 1,
    paddingRight: spacing.md
  },
  rowTitle: {
    ...typography.cardTitle,
    color: colors.text,
    marginBottom: 4
  },
  rowHint: {
    ...typography.body,
    color: colors.textMuted
  },
  fieldBlock: {
    marginBottom: spacing.md
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text
  },
  signOut: {
    marginHorizontal: spacing.lg
  }
});
