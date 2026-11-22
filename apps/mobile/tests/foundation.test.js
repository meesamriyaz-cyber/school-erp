import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { colors, radius, spacing, typography } from '../src/theme/tokens.js';

const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));

test('mobile app uses the Expo Router entry point and SDK-compatible dependencies', async () => {
  const packageJson = await readJson(new URL('../package.json', import.meta.url));

  assert.equal(packageJson.main, 'expo-router/entry');
  assert.equal(packageJson.dependencies.expo, '~57.0.27');
  assert.equal(packageJson.dependencies['expo-router'], '~57.0.25');
  assert.equal(packageJson.dependencies['react-native-safe-area-context'], '5.7.0');
  assert.equal(packageJson.dependencies['react-native-screens'], '4.26.2');
});

test('Expo config registers the router plugin and a stable deep-link scheme', async () => {
  const appConfig = await readJson(new URL('../app.json', import.meta.url));

  assert.ok(appConfig.expo.plugins.includes('expo-router'));
  assert.equal(appConfig.expo.scheme, 'schoolerp');
  assert.equal(appConfig.expo.name, 'School ERP');
});

test('foundation route files exist for welcome and authentication navigation', async () => {
  const paths = [
    '../src/app/_layout.js',
    '../src/app/index.js',
    '../src/app/(auth)/_layout.js',
    '../src/app/(auth)/login.js',
    '../src/components/AppScreen.js',
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.ok(source.length > 0, path + ' should not be empty');
  }
});

test('design tokens expose valid palette, spacing, radius and typography scales', () => {
  assert.match(colors.primary, /^#[0-9A-F]{6}$/i);
  assert.match(colors.background, /^#[0-9A-F]{6}$/i);
  assert.ok(spacing.xxl > spacing.xl && spacing.xl > spacing.lg);
  assert.ok(radius.pill > radius.lg);
  assert.ok(typography.display > typography.xxl);
});
