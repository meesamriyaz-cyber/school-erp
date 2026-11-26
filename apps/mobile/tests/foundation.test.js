import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { colors, radius, spacing, typography } from '../src/theme/tokens.js';

const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));

test('mobile app uses Expo Router and SDK-compatible dependencies', async () => {
  const packageJson = await readJson(new URL('../package.json', import.meta.url));
  assert.equal(packageJson.main, 'expo-router/entry');
  assert.equal(packageJson.dependencies.expo, '~57.0.27');
  assert.equal(packageJson.dependencies['expo-router'], '~57.0.25');
  assert.equal(packageJson.dependencies['expo-secure-store'], '~57.0.4');
  assert.equal(packageJson.dependencies['react-native-safe-area-context'], '5.7.0');
  assert.equal(packageJson.dependencies['react-native-screens'], '4.26.2');
});

test('Expo config registers Router and SecureStore with a stable deep-link scheme', async () => {
  const config = await readJson(new URL('../app.json', import.meta.url));
  assert.ok(config.expo.plugins.includes('expo-router'));
  assert.ok(config.expo.plugins.includes('expo-secure-store'));
  assert.equal(config.expo.scheme, 'schoolerp');
  assert.equal(config.expo.name, 'School ERP');
});

test('auth infrastructure and protected routes are present', async () => {
  const paths = [
    '../src/app/_layout.js',
    '../src/app/index.js',
    '../src/app/(auth)/_layout.js',
    '../src/app/(auth)/login.js',
    '../src/app/(app)/_layout.js',
    '../src/app/(app)/index.js',
    '../src/auth/AuthProvider.js',
    '../src/auth/secureStorage.js',
    '../src/services/apiClient.js',
    '../src/services/authService.js',
    '../src/config/environment.js',
    '../src/components/AppScreen.js',
    '../src/components/ParentMessagingScreen.js',
    '../src/components/TeacherMessagingScreen.js',
    '../src/components/TeacherAnnouncementsScreen.js',
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.ok(source.length > 0, path + ' should not be empty');
  }
});

test('mobile auth implementation uses secure refresh storage and mobile client type', async () => {
  const storage = await readFile(new URL('../src/auth/secureStorage.js', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../src/services/authService.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/services/apiClient.js', import.meta.url), 'utf8');
  assert.match(storage, /expo-secure-store/);
  assert.match(auth, /clientType: "mobile"/);
  assert.ok(api.includes("Authorization:"));
  assert.ok(api.includes("Bearer"));
  assert.match(api, /refreshInFlight/);
});

test('design tokens expose valid palette and scales', () => {
  assert.match(colors.primary, /^#[0-9A-F]{6}$/i);
  assert.match(colors.background, /^#[0-9A-F]{6}$/i);
  assert.ok(spacing.xxl > spacing.xl && spacing.xl > spacing.lg);
  assert.ok(radius.pill > radius.lg);
  assert.ok(typography.display > typography.xxl);
});


test('parent family workspace exposes the same teacher messaging API as web', async () => {
  const messaging = await readFile(new URL('../src/components/ParentMessagingScreen.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/(app)/index.js', import.meta.url), 'utf8');
  for (const endpoint of [
    '/messaging/contacts',
    '/messaging/conversations',
    '/messaging/conversations/${conversation._id}/messages',
    '/messaging/conversations/${conversation._id}/read',
  ]) {
    assert.ok(messaging.includes(endpoint), 'parent messaging should use ' + endpoint);
  }
  assert.match(messaging, /method: "POST"/);
  assert.match(messaging, /teacherId/);
  assert.match(messaging, /studentId/);
  assert.match(app, /ParentMessagingScreen/);
  assert.match(app, /\["notices","Notices"\].*\["notifications","Notifications"\].*\["messages","Messages"\]/s);
});


test('teacher mobile workspace supports scoped parent conversation replies', async () => {
  const messaging = await readFile(new URL('../src/components/TeacherMessagingScreen.js', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../src/components/TeacherWorkspaceScreen.js', import.meta.url), 'utf8');
  for (const endpoint of [
    '/messaging/conversations',
    '/messaging/conversations/${conversation._id}/messages',
    '/messaging/conversations/${conversation._id}/read',
    '/messaging/conversations/${active._id}/close',
  ]) {
    assert.ok(messaging.includes(endpoint), 'teacher messaging should use ' + endpoint);
  }
  assert.match(messaging, /method: "POST"/);
  assert.match(messaging, /teacherUnreadCount/);
  assert.match(workspace, /TeacherMessagingScreen/);
  assert.match(workspace, /\["messages","Parent messages"\]/);
});


test('teacher mobile announcements match the web announcement API and workspace', async () => {
  const announcements = await readFile(new URL('../src/components/TeacherAnnouncementsScreen.js', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../src/components/TeacherWorkspaceScreen.js', import.meta.url), 'utf8');
  for (const endpoint of ['/announcements', '/teacher-assignments?status=active', '/academic-years', '/announcements/${item._id}/${action}']) {
    assert.ok(announcements.includes(endpoint), 'teacher announcements should use ' + endpoint);
  }
  assert.match(announcements, /audienceType/);
  assert.match(announcements, /method: "POST"/);
  assert.match(announcements, /"publish"/);
  assert.match(announcements, /"archive"/);
  assert.match(workspace, /TeacherAnnouncementsScreen/);
  assert.match(workspace, /\["announcements","Announcements"\]/);
});
