import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import { useAuth } from "../../../providers/AuthProvider";
import { createClient, getActiveBusinessId } from "../../../lib/clients";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function NewClientScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }
    if (!businessId) {
      setError("We couldn't find your business yet. Please try again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null
      };
      console.log("create-client:user", user.id);
      console.log("create-client:business", businessId);
      console.log("create-client:payload", payload);
      await createClient(businessId, payload);
      router.replace("/clients");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create client.";
      if (message === "NO_BUSINESS") {
        router.replace("/(app)/onboarding");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={[styles.heroStrip, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>New client</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.heroAction}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>Add contact details for this client.</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.form}>
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
            label={loading ? "Saving..." : "Save client"}
            size="lg"
            fullWidth
            onPress={handleSave}
            disabled={loading || businessLoading}
          />
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
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  form: {
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
