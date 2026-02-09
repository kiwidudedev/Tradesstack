import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const unpaidInvoices = [
  { id: "inv-101", client: "Kauri Homes", amount: "$3,450", due: "Due in 3 days" },
  { id: "inv-102", client: "Harper Build", amount: "$1,280", due: "Overdue" },
  { id: "inv-103", client: "Mason & Co", amount: "$820", due: "Due tomorrow" }
];

const activeJobs = [
  { id: "job-201", title: "Deck rebuild — Ponsonby", meta: "Quote sent" },
  { id: "job-202", title: "Bathroom fit-out — Grey Lynn", meta: "Materials ordered" },
  { id: "job-203", title: "Fence repair — Mt Eden", meta: "On site today" }
];

export default function LegacyHomeDashboard() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Today</Text>
            </View>
            <Text style={styles.heroSubtitle}>Keep cash moving and sites safe.</Text>
          </View>
        </View>

        <View style={styles.quickActions}>
          <PillButton label="Jobs" variant="primary" onPress={() => router.push("/jobs")} />
          <PillButton label="Quotes" variant="primary" onPress={() => router.push("/quotes")} />
          <PillButton label="Invoices" variant="primary" onPress={() => router.push("/invoices")} />
          <PillButton label="POs" variant="primary" onPress={() => router.push("/pos")} />
          <PillButton label="Safety" variant="primary" onPress={() => router.push("/safety")} />
          <PillButton label="Clients" variant="primary" onPress={() => router.push("/clients")} />
        </View>

        <Text style={styles.sectionTitle}>Unpaid invoices</Text>
        <Card>
          {unpaidInvoices.map((invoice, index) => (
            <ListRow
              key={invoice.id}
              title={invoice.client}
              subtitle={invoice.due}
              rightText={invoice.amount}
              showDivider={index < unpaidInvoices.length - 1}
            />
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Active jobs</Text>
        <Card>
          {activeJobs.map((job, index) => (
            <ListRow
              key={job.id}
              title={job.title}
              subtitle={job.meta}
              rightText="Open"
              showDivider={index < activeJobs.length - 1}
              onPress={() => router.push({ pathname: "/jobs/[id]", params: { id: job.id } })}
            />
          ))}
        </Card>
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
    paddingTop: spacing.md
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
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
  quickActions: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm
  }
});
