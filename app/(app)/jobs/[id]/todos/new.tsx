import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import Card from "@/components/Card";
import PillButton from "@/components/PillButton";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function JobTodoCreateScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const jobId = typeof params.id === "string" ? params.id : "";

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const handlePickerChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }
    if (selected) {
      setDueDate(selected);
    }
  };

  const handleSave = async () => {
    if (!jobId) return;
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setError(sessionError.message);
      return;
    }
    if (!sessionData.session) {
      setError("You are not signed in.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .select("business_id")
        .eq("id", jobId)
        .single();
      if (jobError || !job) {
        throw new Error(jobError?.message ?? "Failed to load job.");
      }

      const { error: insertError } = await supabase.from("jobs_todos").insert({
        job_id: jobId,
        business_id: job.business_id,
        title: title.trim(),
        notes: notes.trim() || null,
        due_date: dueDate ? formatDate(dueDate) : null
      });
      if (insertError) throw new Error(insertError.message);

      router.replace({ pathname: "/jobs/[id]/todos", params: { id: jobId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create to-do.";
      console.error(err);
      setError(message);
      Alert.alert("To-dos", message);
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
              <Text style={styles.heroTitle}>To-Do</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={styles.heroAction}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.heroSubtitle}>Capture the next action.</Text>
          </View>
        </View>

        <Text style={styles.title}>New to-do</Text>
        <Text style={styles.subtitle}>Keep it short and concrete.</Text>

        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Site walkthrough with client"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional details or reminders"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <View style={styles.dueRow}>
            <Text style={styles.fieldLabel}>Due date</Text>
            {Platform.OS === "android" && dueDate ? (
              <Pressable onPress={() => setDueDate(null)}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
            <Text style={dueDate ? styles.inputValue : styles.placeholderText}>
              {dueDate ? formatDate(dueDate) : "YYYY-MM-DD (optional)"}
            </Text>
          </Pressable>
        </Card>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.ctaRow}>
          <PillButton label={saving ? "Saving..." : "Save"} size="lg" fullWidth onPress={handleSave} />
        </View>
      </ScrollView>

      {showPicker && Platform.OS === "android" ? (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Pressable onPress={() => setDueDate(null)}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
                <Pressable onPress={() => setShowPicker(false)}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={dueDate ?? new Date()}
                mode="date"
                display="spinner"
                onChange={handlePickerChange}
              />
            </View>
          </View>
        </Modal>
      ) : null}
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
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md
  },
  fieldLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    color: colors.text,
    ...typography.body
  },
  inputValue: {
    ...typography.body,
    color: colors.text
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  ctaRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xxl
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md
  },
  clearText: {
    ...typography.bodyBold,
    color: colors.textMuted
  },
  doneText: {
    ...typography.bodyBold,
    color: colors.primary
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)"
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  }
});
