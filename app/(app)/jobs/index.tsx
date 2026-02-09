import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { getActiveBusinessId } from "@/lib/clients";
import { listJobs, type Job } from "@/lib/jobs";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../../providers/AuthProvider";

const formatStatus = (status?: string | null) => {
  if (!status) return "Draft";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
};

export default function JobsListScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user) return;
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const businessId = await getActiveBusinessId(user.id);
        const rows = await listJobs(businessId);
        setJobs(rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load jobs.";
        if (message === "NO_BUSINESS") {
          router.replace("/(app)/onboarding");
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, user]
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadJobs("refresh")} />}
      >
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}> 
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Jobs</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Back</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Every record starts with a job.</Text>
          </View>
        </View>

        <View style={styles.ctaRow}>
          <PillButton label="+ New Job" size="lg" fullWidth onPress={() => router.push("/jobs/new")} />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.loadingText}>Loading jobs…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : jobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No jobs yet</Text>
            <Text style={styles.emptySubtitle}>Create your first job to start quoting.</Text>
          </View>
        ) : (
          <Card style={styles.card}>
            {jobs.map((job, index) => (
              <ListRow
                key={job.id}
                title={job.name}
                subtitle={job.site_address ?? "No site address"}
                rightText={formatStatus(job.status)}
                showDivider={index < jobs.length - 1}
                onPress={() => router.push({ pathname: "/jobs/[id]", params: { id: job.id } })}
              />
            ))}
          </Card>
        )}
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
  heroAction: {
    ...typography.bodyBold,
    color: colors.textOnNavy
  },
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  ctaRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  },
  card: {
    marginHorizontal: spacing.lg
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  emptyTitle: {
    ...typography.cardTitle,
    color: colors.text
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    paddingHorizontal: spacing.lg
  }
});
