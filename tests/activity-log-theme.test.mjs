import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../assets/css/pages.css', import.meta.url), 'utf8');
const activityCss = css.slice(css.indexOf('/* Activity audit center */'), css.indexOf('/* Arsip:'));

test('Activity Log surfaces use existing semantic theme tokens', () => {
  assert.match(activityCss, /\.activity-summary>div\{[^}]*background:var\(--panel-soft\)[^}]*border:1px solid var\(--line\)/);
  assert.match(activityCss, /\.activity-table th\{[^}]*background:var\(--panel-soft\)[^}]*color:var\(--muted\)/);
  assert.doesNotMatch(activityCss, /var\(--(?:card|border),#(?:fff|ffffff|e2e8f0)\)/i);
});

test('Activity Log controls and secondary actions retain themed surfaces in every state', () => {
  assert.match(activityCss, /\.activity-filters input,.activity-filters select\{background:var\(--panel\);color:var\(--text\);border-color:var\(--line\)\}/);
  assert.match(activityCss, /\.activity-filters input:focus,.activity-filters select:focus\{background:var\(--panel\);color:var\(--text\)\}/);
  assert.match(activityCss, /\.activity-panel \.btn-ghost\{background:var\(--panel-soft\);color:var\(--text\);border-color:var\(--line\)\}/);
  assert.match(activityCss, /html\[data-theme="dark"\] \.activity-filters input\[type="date"\]\{color-scheme:dark\}/);
});

test('Activity Log loading, errors, table and scrollbar cannot expose a light fallback', () => {
  assert.match(activityCss, /#activityLogApp>\.state[^}]*background:var\(--panel-soft\)/);
  assert.match(activityCss, /\.activity-table-wrap\{[^}]*background:var\(--panel\)[^}]*scrollbar-color:var\(--scroll-thumb\) var\(--scroll-track\)/);
  assert.match(activityCss, /\.activity-panel>\.state\.error\{background:color-mix\(in srgb,var\(--danger\) 10%,var\(--panel\)\)/);
});
