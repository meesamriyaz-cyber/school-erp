import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radius, spacing, typography } from '../theme/tokens';

export default function WelcomeScreen() {
  return (
    <AppScreen style={styles.screen}>
      <View style={styles.topLine}>
        <View style={styles.brandMark}>
          <Text style={styles.brandInitials}>SE</Text>
        </View>
        <Text style={styles.brandName}>SCHOOL ERP</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.eyebrow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrowText}>ONE CONNECTED SCHOOL</Text>
        </View>
        <Text style={styles.title}>A smarter way to stay connected.</Text>
        <Text style={styles.description}>
          Your school, your classroom and your learning journey — together in
          one secure place.
        </Text>
        <Link href="/(auth)/login" asChild>
          <PrimaryButton label="Continue to sign in" />
        </Link>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerRule} />
        <Text style={styles.footerText}>SCHOOL ERP · MOBILE</Text>
        <Text style={styles.footerCaption}>
          A connected experience for every school community.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brandInitials: {
    color: colors.white,
    fontSize: typography.md,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandName: {
    color: colors.ink,
    fontSize: typography.sm,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  hero: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  eyebrowText: {
    color: colors.primary,
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    maxWidth: 420,
    color: colors.ink,
    fontSize: typography.display,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  description: {
    maxWidth: 360,
    color: colors.muted,
    fontSize: typography.md,
    lineHeight: 27,
  },
  footer: {
    gap: spacing.sm,
  },
  footerRule: {
    width: 44,
    height: 3,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  footerText: {
    color: colors.ink,
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  footerCaption: {
    color: colors.muted,
    fontSize: typography.xs,
  },
});
