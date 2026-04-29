import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const esmApi = await import('../dist/index.es.js').catch(() => null);

test('esm bundle can be imported', () => {
  assert.ok(esmApi);
});

if (esmApi) {
  test('esm exports SmokeLayer class', () => {
    assert.equal(typeof esmApi.SmokeLayer, 'function');
  });
}

const requireFromTest = createRequire(import.meta.url);
const cjsApi = (() => {
  try {
    return requireFromTest('../dist/index.cjs');
  } catch {
    return null;
  }
})();

test('cjs bundle can be required', () => {
  assert.ok(cjsApi);
});

if (cjsApi) {
  test('cjs exports SmokeLayer class', () => {
    const exported = cjsApi.SmokeLayer ?? cjsApi.default;
    assert.equal(typeof exported, 'function');
  });
}

test('umd bundle file exists', () => {
  const umdPath = resolve(projectRoot, 'dist/index.umd.js');
  assert.equal(existsSync(umdPath), true);
});

test('types file exists', () => {
  const typesPath = resolve(projectRoot, 'dist/index.d.ts');
  assert.equal(existsSync(typesPath), true);
});
