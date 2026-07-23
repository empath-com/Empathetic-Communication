#!/usr/bin/env node
// Post-build patch, required after every package-build.mjs run in this repo
// (see .design-sync/NOTES.md).
//
// Root cause: esbuild emits `__toESM(require_X(), 1)` for a handful of CJS
// imports in this bundle (verified: every @mui/icons-material/<Icon> default
// import used directly as a component, e.g. AdminHeader's SettingsIcon,
// InstructorHeader/StudentHeader/VoiceConversation's icons). The `1`
// ("isNodeMode") argument unconditionally forces `target.default = mod`
// even though `mod` already has `__esModule: true` and its own `.default`
// (the real memo-wrapped icon component) — producing a DOUBLE-WRAPPED
// `{default: {default: RealComponent, __esModule: true}, __esModule: true}`
// object. React then rejects it with "Element type is invalid ... got:
// object", because the code consumes it as `import_X.default`, which is
// still the inner wrapper, not the component.
//
// __toESM's own logic (lib/bundle.mjs is not something this repo forks —
// see the file header there): the `isNodeMode` flag only changes behavior
// when `mod.__esModule` is already true; for modules that never set
// __esModule (plain CommonJS), the fallback condition `!mod.__esModule`
// still forces the correct wrap regardless of this flag. So stripping the
// literal `, 1)` from every `__toESM(...)` call in this bundle is a
// no-op for every already-correct case and only fixes the __esModule-true
// double-wrap bug. Verified empirically (see NOTES.md) before adopting.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node fix-toesm.mjs <ds-bundle-dir>'); process.exit(1); }
const p = join(OUT, '_ds_bundle.js');
const src = readFileSync(p, 'utf8');
const patched = src.replace(/__toESM\(([^,()]*\([^)]*\)), 1\)/g, '__toESM($1)');
const n = (src.match(/__toESM\([^,()]*\([^)]*\), 1\)/g) ?? []).length;
writeFileSync(p, patched);
console.error(`[fix-toesm] patched ${n} __toESM(..., 1) call(s) in ${p}`);

// Patching _ds_bundle.js's bytes invalidates two fields _ds_sync.json stamped
// from the pre-patch bundle: styleSha (package shape hashes the bundle body
// into the styling surface) and bundleSha12 (raw bundle hash). Everything
// else in the sidecar (renderHashes, sourceKeys, sourceHashes from the
// unchanged first-line header, auxSha) is untouched by this patch — only
// __toESM wrapper code changed, not which files/components are included —
// so re-derive just those two fields via the SAME recipe package-build.mjs
// uses (lib/sync-hashes.mjs), never a hand-rolled hash.
const sidecarPath = join(OUT, '_ds_sync.json');
if (n > 0 && existsSync(sidecarPath)) {
  const dsSyncLib = new URL('../.ds-sync/lib/sync-hashes.mjs', import.meta.url);
  const { styleShaFor } = await import(dsSyncLib.href).catch(() => ({}));
  if (styleShaFor) {
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    sidecar.styleSha = styleShaFor(OUT, { includeBundleBody: sidecar.shape !== 'storybook' });
    sidecar.bundleSha12 = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
    writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
    console.error('[fix-toesm] re-stamped styleSha + bundleSha12 in _ds_sync.json to match the patched bundle');
  } else {
    console.error('[fix-toesm] WARNING: could not load lib/sync-hashes.mjs to re-stamp _ds_sync.json — run from the repo root with .ds-sync/ staged, or re-stamp manually before upload');
  }
}
