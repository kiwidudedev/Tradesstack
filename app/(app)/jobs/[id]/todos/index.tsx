import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import Card from "@/components/Card";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { BOTTOM_BAR_CONTENT_HEIGHT } from "@/components/navigation/BottomNavBar";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

type Filter = "all" | "todo" | "done";

export default function JobTodosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const jobId = typeof params.id === "string" ? params.id : "";

  const [jobName, setJobName] = useState<string>("Job");
  const [todos, setTodos] = useState<Array<{
    id: string;
    job_id: string;
    title: string;
    notes: string | null;
    due_date: string | null;
    is_done: boolean;
    created_at?: string | null;
  }>>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!jobId) return;
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const { data: job, error: jobError } = await supabase
          .from("jobs")
          .select("name")
          .eq("id", jobId)
          .single();
        if (jobError) throw new Error(jobError.message);

        const primaryQuery = await supabase
          .from("jobs_todos")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });

        if (primaryQuery.error) {
          const fallbackQuery = await supabase
            .from("jobs_todos")
            .select("*")
            .eq("job_id", jobId)
            .order("id", { ascending: false });
          if (fallbackQuery.error) throw new Error(fallbackQuery.error.message);
          setTodos(fallbackQuery.data ?? []);
        } else {
          setTodos(primaryQuery.data ?? []);
        }

        setJobName(job?.name ?? "Job");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load to-dos.";
        console.error(err);
        setError(message);
        Alert.alert("To-dos", message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobId]
  );

  useFocusEffect(
    useCallback(() => {
      loadTodos();
    }, [loadTodos])
  );

  const filtered = useMemo(() => {
    if (filter === "todo") return todos.filter((todo) => !todo.is_done);
    if (filter === "done") return todos.filter((todo) => todo.is_done);
    return todos;
  }, [filter, todos]);

  const handleToggle = async (todo: (typeof todos)[number]) => {
    try {
      const next = !todo.is_done;
      setTodos((prev) => prev.map((row) => (row.id === todo.id ? { ...row, is_done: next } : row)));
      const { error: updateError } = await supabase
        .from("jobs_todos")
        .update({ is_done: next })
        .eq("id", todo.id);
      if (updateError) throw new Error(updateError.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update to-do.";
      console.error(err);
      setError(message);
      Alert.alert("To-dos", message);
      setTodos((prev) => prev.map((row) => (row.id === todo.id ? todo : row)));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Todos</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.heroAction}>Back</Text>
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>{jobName}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadTodos("refresh")} />
        }
      >
        <View style={styles.segmentedWrap}>
          {[
            { key: "all" as const, label: "All" },
            { key: "todo" as const, label: "To do" },
            { key: "done" as const, label: "Done" }
          ].map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setFilter(item.key)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>No to-dos yet — add your first one.</Text>
        ) : (
          <Card>
            {filtered.map((todo, index) => {
              const subtitleParts = [
                todo.due_date ? `Due ${todo.due_date}` : null,
                todo.notes?.trim() ? todo.notes.trim().split("\n")[0] : null
              ].filter(Boolean);
              const subtitle = subtitleParts.join(" • ");
              return (
                <View key={todo.id} style={[styles.row, index < filtered.length - 1 && styles.divider]}>
                  <Pressable onPress={() => handleToggle(todo)} hitSlop={6} style={styles.checkboxButton}>
                    <FontAwesome5
                      name={todo.is_done ? "check-square" : "square"}
                      size={18}
                      color={todo.is_done ? colors.primary : colors.textMuted}
                      solid={todo.is_done}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() =>
                      router.push({
                        pathname: "/jobs/[id]/todos/[todoId]",
                        params: { id: jobId, todoId: todo.id }
                      })
                    }
                  >
                    <Text style={styles.rowTitle}>{todo.title}</Text>
                    {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/jobs/[id]/todos/[todoId]",
                        params: { id: jobId, todoId: todo.id }
                      })
                    }
                    hitSlop={6}
                  >
                    <Text style={styles.rowAction}>Open</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + BOTTOM_BAR_CONTENT_HEIGHT + spacing.md }]}
        onPress={() => router.push({ pathname: "/jobs/[id]/todos/new", params: { id: jobId } })}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
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
  heroAction: {
    ...typography.bodyBold,
    color: colors.textOnNavy
  },
  heroSubtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.85)"
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  segmentedWrap: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.lg
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: colors.primary
  },
  segmentLabel: {
    ...typography.bodyBold,
    color: colors.textMuted
  },
  segmentLabelActive: {
    color: colors.textOnNavy
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted
  },
  errorText: {
    ...typography.body,
    color: colors.danger
  },
  row: {
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center"
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  checkboxButton: {
    paddingRight: spacing.sm
  },
  rowMain: {
    flex: 1,
    paddingRight: spacing.md
  },
  rowTitle: {
    ...typography.bodyBold,
    color: colors.text
  },
  rowSubtitle: {
    marginTop: 4,
    ...typography.body,
    color: colors.textMuted
  },
  rowAction: {
    ...typography.bodyBold,
    color: colors.primary
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  fabText: {
    ...typography.screenTitle,
    color: colors.textOnNavy,
    marginTop: -2
  }
});
