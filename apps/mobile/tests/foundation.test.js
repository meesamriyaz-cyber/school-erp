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
  assert.match(api, /"X-Client-Type": "mobile"/);
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
  for (const endpoint of ['/announcements', '/teacher-assignments?status=active', '/academic-years', '"/announcements/"+item._id+"/"+action']) {
    assert.ok(announcements.includes(endpoint), 'teacher announcements should use ' + endpoint);
  }
  assert.match(announcements, /audienceType/);
  assert.match(announcements, /method:\s*"POST"/);
  assert.match(announcements, /"publish"/);
  assert.match(announcements, /"archive"/);
  assert.match(workspace, /TeacherAnnouncementsScreen/);
  assert.match(workspace, /\["announcements","Announcements"\]/);
});

test('platform admin has a dedicated mobile workspace for cross-school directories', async () => {
  const screen = await readFile(new URL('../src/components/PlatformAdminScreen.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/(app)/index.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ PlatformAdminScreen \}/);
  assert.match(app, /if \(isPlatformAdministrator\) return <PlatformAdminScreen/);
  assert.ok(screen.includes('"/platform/schools"') || screen.includes('"/platform/users"'));
  assert.match(screen, /School directory/);
  assert.match(screen, /User directory/);
  assert.match(screen, /URLSearchParams/);
  assert.match(screen, /pagination/);
  assert.match(screen, /\/platform\/schools\//);
  assert.match(screen, /\/subscription/);
  assert.match(screen, /School details/);
  assert.match(screen, /Start 30-day free trial/);
  assert.match(screen, /Activate school/);
  assert.match(screen, /Suspend school/);
  assert.match(screen, /Reactivate school/);
  assert.match(screen, /suspensionReason/);
  assert.match(screen, /System audit/);
  assert.match(screen, /Commercial audit/);
  assert.match(screen, /User details/);
  assert.match(screen, /EDIT PROFILE/);
  assert.match(screen, /ROLE MANAGEMENT/);
  assert.match(screen, /ACCOUNT ACCESS/);
  assert.match(screen, /\/platform\/users\//);
  assert.match(screen, /Save profile/);
  assert.match(screen, /Save role/);
  assert.match(screen, /Activate user/);
  assert.match(screen, /Suspend user/);
  assert.match(screen, /Reactivate user/);
  assert.match(screen, /Create school user/);
  assert.match(screen, /Create user/);
  assert.match(screen, /\/platform\/users/);
  assert.match(screen, /ROLE FILTER/);
  assert.match(screen, /STATUS FILTER/);
  assert.match(screen, /SCHOOL FILTER/);
  assert.match(screen, /tenantId/);
  assert.match(screen, /userRoleFilter/);
  assert.match(screen, /userStatusFilter/);
  assert.match(screen, /accountant.*librarian.*transport_manager/);
  assert.match(screen, /unsupported in this release/);
  assert.match(screen, /You cannot change your own role/);
  assert.match(screen, /String\(userDetails.id\) === String\(user\?\.id \|\| user\?\._id\)/);
  assert.match(screen, /createUserMessage \? <Text/);
  for (const section of ["plans", "billing", "audit"]) {
  assert.ok(
    screen.includes(`"${section}"`),
    "platform admin mobile should expose " + section
  );
}
});


test('school administrator mobile overview exposes the same core school operations as its navigation', async () => {
  const app = await readFile(new URL('../src/app/(app)/index.js', import.meta.url), 'utf8');
  assert.match(app, /\["school_admin", "principal"\]\.includes\(user\?\.role\)/);
  assert.match(app, /label="Net fee collection"/);
  assert.match(app, /\["students", "attendance", "timetable", "staff"\]\.includes\(tab\.key\)/);
  assert.match(app, /Active students/);
  assert.match(app, /Attendance trend/);
  assert.match(app, /Academic performance/);
});


test('teacher mobile retry actions reload the currently selected teaching workflow', async () => {
  const workspace = await readFile(new URL('../src/components/TeacherWorkspaceScreen.js', import.meta.url), 'utf8');
  const announcements = await readFile(new URL('../src/components/TeacherAnnouncementsScreen.js', import.meta.url), 'utf8');
  const timetable = await readFile(new URL('../src/components/TimetableScreen.js', import.meta.url), 'utf8');
  assert.match(workspace, /if\(tab==="homework"\)return activeHomework\?loadSubmissions\(activeHomework\):loadBase\(\)/);
  assert.match(workspace, /if\(tab==="exams"\)return selectedExam\?loadExamRoster\(selectedExam\):loadBase\(\)/);
  assert.match(workspace, /if\(tab==="reports"\)return runReport\(\)/);
  assert.match(workspace, /onPress=\{retryCurrentTab\}/);
  assert.match(announcements, /onPress=\{load\}/);
  assert.match(timetable, /const params = isTeacher \? \{\}/);
  assert.match(timetable, /getTimetable\(params\)/);
});

test('teacher mobile attendance reports support an explicit date range', async () => {
  const workspace = await readFile(new URL('../src/components/TeacherWorkspaceScreen.js', import.meta.url), 'utf8');
  assert.match(workspace, /const \[reportFrom,setReportFrom\]=useState\(""\)/);
  assert.match(workspace, /const \[reportTo,setReportTo\]=useState\(""\)/);
  assert.match(workspace, /const from=reportFrom\|\|/);
  assert.match(workspace, /const to=reportTo\|\|/);
  assert.match(workspace, /from>to/);
  assert.match(workspace, /From date \(YYYY-MM-DD\)/);
  assert.match(workspace, /To date \(YYYY-MM-DD\)/);
});

test('student section refresh reports partial failures deterministically', async () => {
  const workspace = await readFile(new URL('../src/components/StudentWorkspaceScreen.js', import.meta.url), 'utf8');
  assert.match(workspace, /const updates = \{\}/);
  assert.match(workspace, /else failed\.push\(name\)/);
  assert.match(workspace, /if \(Object\.keys\(updates\)\.length\) setData/);
  assert.match(workspace, /setPartialErrors\(\(previous\) => .*failed/);
  assert.match(workspace, /Previously loaded information has been kept/);
});

test('teacher mobile workspace preserves separate subject assignments within the same class', async () => {
  const workspace = await readFile(new URL('../src/components/TeacherWorkspaceScreen.js', import.meta.url), 'utf8');
  assert.match(workspace, /id\(a\.subjectId\)\|\|"all"/);
  assert.match(workspace, /\[\["attendance","Attendance"\],\["students","My students"\],\["homework","Homework"\],\["exams","Exams"\]/);
  assert.match(workspace, /\["announcements","Announcements"\],\["messages","Parent messages"\]/);
  assert.match(workspace, /\/teacher-assignments\?status=active/);
});
