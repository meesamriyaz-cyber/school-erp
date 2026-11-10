import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme/tokens';

export default function LoginPlaceholderScreen() {
  return (
    <View style={styles.screen}>
      <Link href="/" style={styles.backLink}>
        <Text style={styles.backText}>‹  Back</Text>
      </Link>

      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Text style={styles.brandInitials}>SE</Text>
        </View>
        <Text style={styles.kicker}>WELCOME BACK</Text>
        <Text style={styles.title}>Sign in to your school</Text>
        <Text style={styles.description}>
          Secure access for school administrators, teachers, students and
          parents.
        </Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Sign-in is the next batch</Text>
          <Text style={styles.noticeBody}>
            The authentication flow, school identification and secure session
            handling will be implemented in Mobile Batch M2.
          </Text>
        </View>
      </View>

      <Text style={styles.footer}>SCHOOL ERP · MOBILE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  backLink: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: {
    color: colors.primary,
    fontSize: typography.md,
    fontWeight: '700',
  },
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.sm,
  },
  brandInitials: {
    color: colors.white,
    fontSize: typography.md,
    fontWeight: '800',
  },
  kicker: {
    color: colors.accent,
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontSize: typography.xxl,
    lineHeight: 36,
    fontWeight: '800',
  },
  description: {
    color: colors.muted,
    fontSize: typography.md,
    lineHeight: 25,
  },
  notice: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: typography.md,
    fontWeight: '800',
  },
  noticeBody: {
    color: colors.muted,
    fontSize: typography.sm,
    lineHeight: 22,
  },
  footer: {
    color: colors.muted,
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
});
