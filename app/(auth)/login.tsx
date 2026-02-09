import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import PillButton from "@/components/PillButton";
import TopBar from "@/components/TopBar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../providers/AuthProvider";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const emailError = useMemo(() => {
    if (!email) return null;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    return isValid ? null : "Enter a valid email address.";
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    return password.length >= 6 ? null : "Password must be at least 6 characters.";
  }, [password]);


  const handleEmailSignIn = async () => {
    if (emailError || passwordError || !email || !password) {
      setError(emailError ?? passwordError ?? "Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    router.replace("/(tabs)");
  };

  const handlePasswordReset = async () => {
    if (emailError || !email) {
      setError(emailError ?? "Enter your email to reset your password.");
      return;
    }
    setResetLoading(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setResetLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    Alert.alert("Check your inbox", "We sent you a password reset email.");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <TopBar
          title="TradesStack"
          subtitle="Admin for NZ sole traders"
          inverted
          actions={[{ label: "Close", onPress: () => router.back() }]}
        />

        <View style={styles.hero}>
          <View style={styles.sparkleOne} />
          <View style={styles.sparkleTwo} />
          <View style={styles.sparkleThree} />

          <Text style={styles.headline}>GET ADMIN DONE</Text>
          <Text style={styles.subtext}>
            Quotes, invoices, purchase orders, H&amp;S — sorted in minutes.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(15,23,42,0.45)"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(15,23,42,0.45)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PillButton
              label={loading ? "Signing in..." : "Sign in"}
              size="lg"
              onPress={handleEmailSignIn}
              disabled={loading}
              fullWidth
            />
            <Pressable
              onPress={handlePasswordReset}
              hitSlop={8}
              disabled={resetLoading}
              style={styles.resetLink}
            >
              <Text style={styles.resetLinkText}>
                {resetLoading ? "Sending reset link..." : "Forgot password?"}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(auth)/sign-up")} hitSlop={8} style={styles.linkRow}>
              <Text style={styles.link}>Need an account? Sign up</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy
  },
  container: {
    flex: 1,
    backgroundColor: colors.navy
  },
  hero: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    justifyContent: "center"
  },
  headline: {
    ...typography.heroTitle,
    color: colors.textOnNavy,
    fontSize: 48,
    lineHeight: 52,
    marginBottom: spacing.md
  },
  subtext: {
    ...typography.body,
    color: "rgba(255,255,255,0.9)",
    fontSize: 17,
    lineHeight: 24,
    marginBottom: spacing.lg
  },
  form: {
    marginTop: spacing.sm
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
  error: {
    ...typography.body,
    color: colors.danger ?? "#c00",
    marginBottom: spacing.sm
  },
  fieldError: {
    ...typography.body,
    color: colors.danger ?? "#c00",
    marginBottom: spacing.sm
  },
  linkRow: {
    alignItems: "center",
    marginTop: spacing.sm
  },
  link: {
    ...typography.body,
    color: colors.textOnNavy
  },
  resetLink: {
    alignItems: "center",
    marginTop: spacing.sm
  },
  resetLinkText: {
    ...typography.body,
    color: "rgba(255,255,255,0.8)"
  },
  sparkleOne: {
    position: "absolute",
    top: 90,
    right: 40,
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  sparkleTwo: {
    position: "absolute",
    top: 160,
    left: 48,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  sparkleThree: {
    position: "absolute",
    bottom: 160,
    right: 80,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(247,72,23,0.8)"
  }
});
