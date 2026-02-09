import React, { useEffect, useState } from "react";
import { Alert, ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import PillButton from "@/components/PillButton";
import TopBar from "@/components/TopBar";
import { getClientById, updateClient, deleteClient } from "../../../lib/clients";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadClient = async () => {
      try {
        const client = await getClientById(String(id));
        if (!isMounted) return;
        setName(client.name ?? "");
        setEmail(client.email ?? "");
        setPhone(client.phone ?? "");
        setAddress(client.address ?? "");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load client.";
        if (!isMounted) return;
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      loadClient();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateClient(String(id), {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null
      });
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save client.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete client?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteClient(String(id));
            router.replace("/clients");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete client.";
            setError(message);
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <TopBar
          title="Client"
          subtitle="Update contact details."
          actions={[{ label: "Close", onPress: () => router.back() }]}
        />

        <View style={styles.form}>
          {loading ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Client name *"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email (optional)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone (optional)"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <TextInput
                style={styles.input}
                placeholder="Address (optional)"
                placeholderTextColor={colors.textMuted}
                value={address}
                onChangeText={setAddress}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PillButton
                label={saving ? "Saving..." : "Save changes"}
                size="lg"
                fullWidth
                onPress={handleSave}
                disabled={saving}
              />
              <PillButton
                label="Delete client"
                variant="ghost"
                size="lg"
                fullWidth
                onPress={handleDelete}
              />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg
  },
  form: {
    flex: 1,
    paddingTop: spacing.lg
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.text
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginBottom: spacing.sm
  }
});
