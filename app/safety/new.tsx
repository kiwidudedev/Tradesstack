import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import Card from "@/components/Card";
import PillButton from "@/components/PillButton";
import { getActiveBusinessId } from "@/lib/clients";
import { listJobs, type Job } from "@/lib/jobs";
import { createSafetyRecord, normalizeSafetyStatus } from "@/lib/safety";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../providers/AuthProvider";

type SafetyType = "toolbox_talk" | "checklist";

const baseChecklist = [
  { id: "c-1", label: "Site induction complete", completed: true },
  { id: "c-2", label: "PPE worn and checked", completed: true },
  { id: "c-3", label: "Hazards identified", completed: false },
  { id: "c-4", label: "Controls in place", completed: false }
];

export default function SafetyRecordScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<SafetyType>("toolbox_talk");
  const [notes, setNotes] = useState(
    "Discussed ladder safety, power tool checks, and housekeeping."
  );
  const [checklist, setChecklist] = useState(baseChecklist);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobIndex, setJobIndex] = useState(-1);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const typeOptions = useMemo(
    () => [
      { key: "toolbox_talk" as const, label: "Toolbox talk" },
      { key: "checklist" as const, label: "Checklist" }
    ],
    []
  );

  const toggleItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const job = jobIndex >= 0 ? jobs[jobIndex] : null;

  React.useEffect(() => {
    let isMounted = true;

    const loadBusiness = async () => {
      if (!user) return;
      setBusinessLoading(true);
      setError(null);
      try {
        const activeId = await getActiveBusinessId(user.id);
        if (!isMounted) return;
        setBusinessId(activeId);
        const jobRows = await listJobs(activeId);
        if (!isMounted) return;
        setJobs(jobRows);
        setJobIndex(-1);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve business.";
        if (!isMounted) return;
        if (message === "NO_BUSINESS") {
          router.replace("/(app)/onboarding");
          return;
        }
        setError(message);
      } finally {
        if (isMounted) setBusinessLoading(false);
      }
    };

    loadBusiness();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const cycleJob = () => {
    if (jobs.length === 0) {
      router.push("/jobs/new");
      return;
    }
    setJobIndex((prev) => (prev < 0 ? 0 : (prev + 1) % jobs.length));
    setJobError(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setError(null);

    if (!businessId) {
      setError("We couldn't find your business yet. Please try again.");
      return;
    }

    if (!job) {
      setJobError("Select a job to continue");
      return;
    }

    setSaving(true);

    try {
      const title = type === "toolbox_talk" ? "Toolbox talk" : "Checklist";
      const site = "On site";
      const checklistSummary = checklist
        .map((item) => `${item.completed ? "✓" : "•"} ${item.label}`)
        .join("\n");
      const fullNotes = [notes.trim(), checklistSummary].filter(Boolean).join("\n\n");

      await createSafetyRecord(businessId, user.id, job.id, {
        title,
        site,
        notes: fullNotes,
        status: normalizeSafetyStatus("draft"),
        occurred_on: new Date().toISOString().slice(0, 10)
      });

      router.replace("/safety");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create safety record.";
      const isRls = /row-level security|rls|permission denied/i.test(message);
      if (isRls) {
        console.log("safety-rls:user", user.id);
        console.log("safety-rls:business", businessId);
        console.log("safety-rls:payload", {
          type,
          notes: notes.trim()
        });
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Safety</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Log it while it is fresh</Text>
          </View>
        </View>

        <Text style={styles.title}>Safety record</Text>
        <Text style={styles.subtitle}>Short, honest notes. Tick the basics.</Text>

        <Card style={styles.card}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Job</Text>
            <View style={styles.requiredPill}>
              <Text style={styles.requiredPillText}>Required</Text>
            </View>
          </View>
          <Pressable
            style={[styles.selector, !job && styles.selectorRequired]}
            onPress={cycleJob}
            disabled={businessLoading}
          >
            <View>
              <Text style={styles.selectorValue}>
                {businessLoading ? "Loading jobs..." : job?.name ?? "Select a job"}
              </Text>
              <Text style={styles.selectorHint}>
                {jobs.length === 0 ? "Tap to add a job" : "Tap to change"}
              </Text>
            </View>
            <Text style={styles.selectorAction}>{jobs.length === 0 ? "Add" : "Change"}</Text>
          </Pressable>
          <View style={styles.inlineActionRow}>
            <PillButton
              label="+ New Job"
              variant="secondary"
              onPress={() => router.push("/jobs/new")}
            />
          </View>
          {jobError ? <Text style={styles.inlineError}>{jobError}</Text> : null}

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.segmentedWrap}>
            {typeOptions.map((option) => {
              const active = option.key === type;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setType(option.key)}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Checklist</Text>
        <Card>
          {checklist.map((item, index) => (
            <View key={item.id} style={[styles.checkRow, index < checklist.length - 1 && styles.divider]}>
              <View style={styles.checkText}>
                <Text style={styles.checkLabel}>{item.label}</Text>
                <Text style={styles.checkHint}>{item.completed ? "Done" : "Needs attention"}</Text>
              </View>
              <Switch value={item.completed} onValueChange={() => toggleItem(item.id)} />
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Notes</Text>
        <Card>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            style={styles.notesInput}
          />
        </Card>

        <View style={styles.buttonStack}>
          <PillButton
            label="Add photo"
            variant="secondary"
            onPress={() => Alert.alert("TODO", "Add camera / upload via Supabase Storage.")}
          />
          <PillButton
            label={saving ? "Saving..." : "Save record"}
            size="lg"
            fullWidth
            onPress={handleSave}
            disabled={saving || businessLoading || !job}
          />
        </View>
        {businessLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.navy} />
            <Text style={styles.loadingText}>Loading business…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  requiredPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt
  },
  requiredPillText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm
  },
  selectorRequired: {
    borderColor: colors.danger
  },
  inlineActionRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  selectorValue: {
    ...typography.bodyBold,
    color: colors.text
  },
  selectorHint: {
    marginTop: 2,
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13
  },
  selectorAction: {
    ...typography.bodyBold,
    color: colors.primary
  },
  inlineError: {
    ...typography.body,
    color: colors.danger,
    marginBottom: spacing.sm
  },
  segmentedWrap: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center"
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
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  checkRow: {
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  checkText: {
    flex: 1,
    paddingRight: spacing.md
  },
  checkLabel: {
    ...typography.bodyBold,
    color: colors.text
  },
  checkHint: {
    marginTop: 4,
    ...typography.body,
    color: colors.textMuted
  },
  notesInput: {
    minHeight: 140,
    ...typography.body,
    color: colors.text,
    padding: 0
  },
  buttonStack: {
    marginTop: spacing.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg
  }
});
