import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import PillButton from "@/components/PillButton";
import { getActiveBusinessId, listClients } from "@/lib/clients";
import { listJobs, type Job } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../providers/AuthProvider";

const formatStatus = (status?: string | null) => {
  if (!status) return "Draft";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
};

const getStatusStyles = (status?: string | null) => {
  const normalized = status?.toLowerCase() ?? "draft";

  switch (normalized) {
    case "quoted":
    case "quote_sent":
      return { backgroundColor: colors.warning, textColor: colors.navyDark };
    case "active":
      return { backgroundColor: colors.primary, textColor: colors.textOnNavy };
    case "invoiced":
      return { backgroundColor: colors.navyDark, textColor: colors.textOnNavy };
    case "completed":
      return { backgroundColor: colors.success, textColor: colors.textOnNavy };
    case "draft":
    default:
      return { backgroundColor: colors.border, textColor: colors.textMuted };
  }
};

export default function HomeJobsListScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});
  const [todayTodos, setTodayTodos] = useState<Array<{
    id: string;
    job_id: string;
    title: string;
    notes: string | null;
    due_date: string | null;
    is_done: boolean;
    jobName?: string;
  }>>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHomeData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!user) {
      setLoading(false);
      setLoadingToday(false);
      return;
    }
    setLoading(true);
    setLoadingToday(true);
    if (!silent) setError(null);

    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const todosQuery = supabase
        .from("jobs_todos")
        .select("id, job_id, title, notes, due_date, is_done")
        .eq("due_date", todayStr)
        .eq("is_done", false)
        .order("created_at", { ascending: false });

      const businessId = await getActiveBusinessId(user.id);
      const [jobRows, clientRows, todosResponse] = await Promise.all([
        listJobs(businessId),
        listClients(businessId),
        todosQuery
      ]);

      const clientLookup = clientRows.reduce<Record<string, string>>((acc, client) => {
        acc[client.id] = client.name;
        return acc;
      }, {});

      setClientsById(clientLookup);
      setJobs(jobRows);

      if (todosResponse.error) {
        throw new Error(todosResponse.error.message);
      }

      const todos = (todosResponse.data ?? []) as Array<{
        id: string;
        job_id: string;
        title: string;
        notes: string | null;
        due_date: string | null;
        is_done: boolean;
      }>;

      const jobIds = Array.from(new Set(todos.map((todo) => todo.job_id)));
      if (jobIds.length > 0) {
        const { data: jobNames, error: jobNamesError } = await supabase
          .from("jobs")
          .select("id, name")
          .in("id", jobIds);
        if (jobNamesError) {
          throw new Error(jobNamesError.message);
        }
        const nameLookup = (jobNames ?? []).reduce<Record<string, string>>((acc, job) => {
          acc[job.id] = job.name;
          return acc;
        }, {});
        setTodayTodos(
          todos.map((todo) => ({
            ...todo,
            jobName: nameLookup[todo.job_id]
          }))
        );
      } else {
        setTodayTodos([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load jobs.";
      if (message === "NO_BUSINESS") {
        router.replace("/(app)/onboarding");
        return;
      }
      if (silent) {
        console.warn("Failed to refresh jobs", err);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setLoadingToday(false);
    }
  }, [user]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHomeData({ silent: true });
    setRefreshing(false);
  }, [loadHomeData]);

  const rows = useMemo(() => {
    return jobs.map((job) => {
      const clientName = job.client_id ? clientsById[job.client_id] : null;
      return {
        job,
        clientName,
        statusLabel: formatStatus(job.status),
        statusStyles: getStatusStyles(job.status)
      };
    });
  }, [clientsById, jobs]);

  const header = (
    <>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroTitle}>Home</Text>
              <Text style={styles.heroSubtitle}>Jobs list</Text>
            </View>
            <Pressable style={styles.newJobButton} onPress={() => router.push("/jobs/new")}>
              <Text style={styles.newJobText}>+ New Job</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today</Text>
        <Text style={styles.sectionSubtitle}>Due today across your jobs.</Text>
      </View>

      {loadingToday ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.navy} />
          <Text style={styles.loadingText}>Loading today’s to-dos…</Text>
        </View>
      ) : todayTodos.length === 0 ? (
        <View style={styles.todayEmptyCard}>
          <Text style={styles.todayEmptyTitle}>No to-dos due today 🎉</Text>
        </View>
      ) : (
        <View style={styles.todayCard}>
          {todayTodos.map((todo, index) => (
            <View key={todo.id} style={[styles.todayRow, index < todayTodos.length - 1 && styles.todayDivider]}>
              <Pressable
                style={styles.todayCheckbox}
                onPress={async () => {
                  const { error: updateError } = await supabase
                    .from("jobs_todos")
                    .update({ is_done: true })
                    .eq("id", todo.id);
                  if (!updateError) {
                    setTodayTodos((prev) => prev.filter((row) => row.id !== todo.id));
                  }
                }}
              >
                <FontAwesome5 name="square" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                style={styles.todayMain}
                onPress={() =>
                  router.push({
                    pathname: "/jobs/[id]/todos/[todoId]",
                    params: { id: todo.job_id, todoId: todo.id }
                  })
                }
              >
                <Text style={styles.todayTitle}>{todo.title}</Text>
                <Text style={styles.todaySubtitle}>{todo.jobName ?? "Job"}</Text>
              </Pressable>
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>Today</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Current jobs</Text>
        <Text style={styles.sectionSubtitle}>Tap a job to open its dashboard.</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.job.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <CardRow
            job={item.job}
            clientName={item.clientName}
            statusLabel={item.statusLabel}
            statusStyles={item.statusStyles}
            onPress={() => router.push(`/jobs/${item.job.id}`)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.navy} />
              <Text style={styles.loadingText}>Loading jobs…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{error}</Text>
              <PillButton label="Retry" variant="secondary" onPress={loadJobs} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No jobs yet</Text>
              <Text style={styles.emptySubtitle}>Create your first job to get started.</Text>
              <PillButton
                label="Create your first job"
                size="lg"
                fullWidth
                onPress={() => router.push("/jobs/new")}
              />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function CardRow({
  job,
  clientName,
  statusLabel,
  statusStyles,
  onPress
}: {
  job: Job;
  clientName: string | null;
  statusLabel: string;
  statusStyles: { backgroundColor: string; textColor: string };
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <Text style={styles.jobName}>{job.name}</Text>
          {clientName ? (
            <Text style={styles.jobClient}>{clientName}</Text>
          ) : (
            <Text style={styles.jobClientMuted}>No client yet</Text>
          )}
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.statusPill, { backgroundColor: statusStyles.backgroundColor }]}>
            <Text style={[styles.statusText, { color: statusStyles.textColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
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
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  newJobButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  newJobText: {
    ...typography.bodyBold,
    color: colors.textOnNavy
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.xs
  },
  sectionSubtitle: {
    ...typography.body,
    color: colors.textMuted
  },
  jobMain: {
    flex: 1,
    paddingRight: spacing.md
  },
  jobName: {
    ...typography.bodyBold,
    color: colors.text
  },
  jobClient: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 4
  },
  jobClientMuted: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 4
  },
  jobMeta: {
    alignItems: "flex-end"
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  statusText: {
    ...typography.bodyBold,
    fontSize: 12
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
    paddingHorizontal: spacing.lg
  },
  emptyTitle: {
    ...typography.cardTitle,
    color: colors.text
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  errorState: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  errorText: {
    ...typography.body,
    color: colors.danger
  },
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md
  },
  todayDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  todayCheckbox: {
    paddingRight: spacing.sm
  },
  todayMain: {
    flex: 1,
    paddingRight: spacing.md
  },
  todayTitle: {
    ...typography.bodyBold,
    color: colors.text
  },
  todaySubtitle: {
    marginTop: 2,
    ...typography.body,
    color: colors.textMuted
  },
  todayBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  todayBadgeText: {
    ...typography.bodyBold,
    fontSize: 12,
    color: colors.textMuted
  },
  todayEmptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  todayEmptyTitle: {
    ...typography.body,
    color: colors.textMuted
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardLeft: {
    flex: 1,
    paddingRight: spacing.md
  },
  cardRight: {
    alignItems: "flex-end"
  }
});
