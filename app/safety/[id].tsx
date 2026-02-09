import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import Card from "@/components/Card";
import ListRow from "@/components/ListRow";
import PillButton from "@/components/PillButton";
import { getJobById } from "@/lib/jobs";
import {
  deleteSafetyRecord,
  getSafetyRecordById,
  normalizeSafetyStatus,
  updateSafetyRecord
} from "@/lib/safety";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "../../providers/AuthProvider";

export default function SafetyDetailScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const safetyId = typeof params.id === "string" ? params.id : "";

  const [title, setTitle] = useState("");
  const [site, setSite] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [occurredOn, setOccurredOn] = useState("");
  const [jobName, setJobName] = useState("Job");
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRecord = async () => {
      if (!safetyId) {
        setError("Missing safety record.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const record = await getSafetyRecordById(safetyId);
        if (!isMounted) return;
        setTitle(record.title ?? "");
        setSite(record.site ?? "");
        setNotes(record.notes ?? "");
        setStatus(record.status ?? "draft");
        setOccurredOn(record.occurred_on ?? new Date().toISOString().slice(0, 10));
        setJobId(record.job_id ?? null);
        if (record.job_id) {
          const job = await getJobById(record.job_id);
          if (!isMounted) return;
          setJobName(job.name);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load safety record.";
        if (!isMounted) return;
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRecord();

    return () => {
      isMounted = false;
    };
  }, [safetyId]);

  const handleSave = async () => {
    if (!user) return;
    if (!safetyId) return;
    setSaving(true);
    setError(null);

    try {
      await updateSafetyRecord(safetyId, {
        title: title.trim() || "Safety record",
        site: site.trim() || "On site",
        notes: notes.trim() || null,
        status: normalizeSafetyStatus(status),
        occurred_on: occurredOn.trim() || new Date().toISOString().slice(0, 10)
      });
      router.replace("/safety");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update safety record.";
      const isRls = /row-level security|rls|permission denied/i.test(message);
      if (isRls) {
        console.log("safety-rls:user", user.id);
        console.log("safety-rls:record", safetyId);
        console.log("safety-rls:payload", {
          title: title.trim(),
          site: site.trim(),
          status: status.trim(),
          occurredOn: occurredOn.trim()
        });
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!safetyId) return;

    Alert.alert("Delete record", "This will permanently remove the safety record.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSafetyRecord(safetyId);
            router.replace("/safety");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete safety record.";
            setError(message);
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}> 
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <Text style={styles.heroTitle}>Safety</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Back</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Review and update your record.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <>
            <Text style={styles.title}>Safety record</Text>
            <Text style={styles.subtitle}>Keep it accurate and current.</Text>

            <Card style={styles.card}>
              <ListRow title="Job" subtitle={jobName} showDivider={false} />
              <View style={styles.cardButtonRow}>
                <PillButton
                  label="View Job"
                  onPress={() =>
                    jobId ? router.push({ pathname: "/jobs/[id]", params: { id: jobId } }) : null
                  }
                  disabled={!jobId}
                />
              </View>
            </Card>

            <Card style={styles.card}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} style={styles.input} />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Site</Text>
                <TextInput value={site} onChangeText={setSite} style={styles.input} />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Status</Text>
                <TextInput value={status} onChangeText={setStatus} style={styles.input} />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Occurred on</Text>
                <TextInput value={occurredOn} onChangeText={setOccurredOn} style={styles.input} />
              </View>
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.buttonStack}>
              <PillButton
                label={saving ? "Saving..." : "Save changes"}
                size="lg"
                fullWidth
                onPress={handleSave}
                disabled={saving}
              />
              <PillButton label="Delete record" variant="secondary" onPress={handleDelete} />
            </View>
          </>
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
  cardButtonRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md
  },
  fieldBlock: {
    marginTop: spacing.md
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
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  notesInput: {
    minHeight: 160,
    ...typography.body,
    color: colors.text,
    padding: spacing.md
  },
  buttonStack: {
    marginTop: spacing.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  }
});
