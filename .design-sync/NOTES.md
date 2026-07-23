# design-sync notes — Empathetic Communication frontend

This repo is an application, not a dedicated design-system package. There is
no Storybook, no TypeScript, no `dist/` build that exports a component
library, and no barrel/index file — every component in
`frontend/src/components/` is a plain `.jsx` file with a single
`export default`. The sync treats `frontend/src/components/` as the "design
system": 10 components (an 11th file, `EmpathyCoachSummary.jsx.new`, is a
stray backup and is intentionally excluded — it doesn't match
`componentSrcMap` and isn't a real export).

## Required build sequence (every rebuild/re-sync)

1. `cd frontend && npm run build` (refreshes the compiled Tailwind CSS —
   see "cssEntry hash" below).
2. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./frontend/node_modules --out ./ds-bundle`
3. **`node .design-sync/fix-toesm.mjs ./ds-bundle`** — mandatory, see below.
   Skipping this step ships a bundle where every component that renders a
   `@mui/icons-material/*` icon directly (AdminHeader, InstructorHeader,
   StudentHeader, VoiceConversation) crashes with "Element type is invalid
   ... got: object".
4. `node .ds-sync/package-validate.mjs ./ds-bundle`

## Why `.ds-entry.mjs` lives in `frontend/`, not `.design-sync/`

Every component here is `export default X` with no named/barrel export.
`package-build.mjs`'s synth-entry fallback (no dist/no .d.ts) emits
`export * from "<file>"` per source file, but `export *` never forwards a
module's default export (ES module spec) — that fallback alone produces an
empty `window.EmpathAI`. `frontend/.ds-entry.mjs` hand-re-exports each
component under its real name (`export { default as AIMessage } from
'./src/components/AIMessage.jsx'`, etc.) and is wired via `cfg.entry`.

It must live **inside** `frontend/`, not under `.design-sync/`: `--entry`'s
directory is walked upward to find the nearest `package.json` with a `name`
field, and that becomes `PKG_DIR` (the root every other path in config —
`componentSrcMap`, `cssEntry`, `srcDir` — resolves against). This repo has
no root `package.json`; only `frontend/package.json` exists. An entry file
under `.design-sync/` would walk up past the repo looking for any
`package.json`, resolving `PKG_DIR` to the wrong place (or the `.design-sync`
dir itself, per the walk's fallback).

## The `__toESM(..., 1)` icon bug — root cause, verified

`AdminHeader.jsx`'s `import SettingsIcon from "@mui/icons-material/Settings"`
(and the equivalent icon imports in InstructorHeader/StudentHeader/
VoiceConversation) compile to `__toESM(require_Settings(), 1)`. The `1`
("isNodeMode") argument to esbuild's `__toESM` helper unconditionally forces
`target.default = mod` **even when `mod.__esModule` is already true** — and
`@mui/icons-material`'s icon modules do have `__esModule: true` with their
own real `.default` (the memo-wrapped icon component). The result is a
double-wrapped `{default: {default: RealIcon, __esModule: true},
__esModule: true}` object; the component code reads `import_Settings.default`
(still the inner wrapper, not the icon), and React rejects it: "Element type
is invalid ... got: object".

Verified empirically (see the session that produced this repo's first sync):
isolated a single-component bundle, reproduced the crash, then confirmed
that manually stripping the literal `, 1)` from the `__toESM(...)` call
fixes it — the icon renders correctly (`SettingsIcon` SVG, `MuiSvgIcon-root`
classes, real gear path). `lib/bundle.mjs` is one of the two files this
skill says never to fork (`lib/emit.mjs`/`lib/bundle.mjs` "define the output
contract with the app's self-check"), and there's no `cfg.*` field for this,
so the fix is `.design-sync/fix-toesm.mjs`, a post-build patch run between
`package-build.mjs` and `package-validate.mjs`. It's a global textual
patch (strip `, 1)` from every `__toESM(...)` call), not scoped to MUI —
confirmed safe in general: the `isNodeMode` flag only changes behavior when
`mod.__esModule` is already true (for modules that lack it, the fallback
condition `!mod.__esModule` still forces the correct wrap regardless of the
flag), so this can only ever fix the double-wrap case, never break a
legitimately-forced case. The script also re-stamps `_ds_sync.json`'s
`styleSha`/`bundleSha12` (the package shape's styleSha hashes the bundle
body) so the verification anchor matches the patched bytes — everything
else in the sidecar (renderHashes, sourceKeys, sourceHashes from the
unchanged first-line header) is untouched, since only wrapper code changed,
not which files/components are included.

## Known render warns (confirmed benign — checked against this list on re-sync)

- **`AdminHeader` — `[RENDER]` "root empty"**: false positive. Confirmed via
  direct screenshot inspection (renders correctly: gear icon, "Administrator"
  title, "Sign Out" button, all Tailwind classes applied) and an isolated
  playwright re-render with zero console/page errors. The render-checker's
  height/text measurement reports `maxHeight: 0` / empty `texts` for this
  specific component even though the paint is fully correct — tried wrapping
  the preview in an explicit-width `<div>` (no change) and ruled out the
  MUI-icon bug (verified zero remaining `__toESM(..., 1)` occurrences in the
  patched bundle). InstructorHeader and StudentHeader (structurally similar
  headers, one with a context read, one with state+effects) do NOT trip
  this, so it isn't simply "stateless/effect-free component" either — best
  guess is a timing/measurement quirk in `package-validate.mjs`'s own
  harness for this specific DOM shape, not a defect in the component, the
  config, or the preview. Accepted; validate will keep reporting this as
  1 error unless the checker itself changes.
- **`NovaVisualizer` — "variants render identically"**: false positive.
  NovaVisualizer renders to a `<canvas>` via p5; the two authored stories
  (`ActiveWaveform`, `QuietWaveform`) are visually distinct (a wavy blob vs.
  a near-perfect circle — confirmed by reading the actual screenshot), but
  the checker's variant-comparison is text-content-based and canvas content
  has no text, so any two canvas-only stories read as "identical" to it.
- p5.js (imported by NovaVisualizer) patches several `window` globals at
  module-evaluation time as part of its "friendly error system" (functions
  like `helpForMisusedAtTopLevelCode`). This can throw a benign, non-blocking
  page error on pages that never touch p5, because the whole DS ships as one
  bundled `_ds_bundle.js` (all 10 components load together, unlike the real
  app where NovaVisualizer's chunk only loads on the voice call screen). It
  has not affected any component's actual rendered output in testing.

## Accepted preview limitations

- **`VoiceConversation`** only has one authored story (`Open`). It's an
  overlay that dials a real WebSocket voice service on mount
  (`connectToVoiceService()`); `isConnected`/`isRecording`/`isSpeaking` are
  internal `useState`, reachable only after a live backend connection —
  there's no prop to compose those states from outside, and faking them
  would mean editing the real component. The static preview shows the
  dialog's genuine "Connecting to voice service..." state
  (`cardMode: "single"`, since it's a modal/overlay).
- **`StudentHeader`**'s title (`{name}'s Dashboard`) never renders in the
  preview: `name` is only set by an async `fetchAuthSession()` call that
  fails in the sandbox (no Amplify backend), same as in any environment
  without a real Cognito session. This matches real "not yet loaded" app
  behavior, not a preview defect.
- Global `cfg.provider` (`UserContext.Provider`, `isInstructorAsStudent:
  false`) is fixed for the whole build — there's no per-story way to flip it,
  so StudentHeader's "Instructor View" button (shown only when
  `isInstructorAsStudent` is true) never appears in the preview.

## `cssEntry` hash — re-sync risk

`cfg.cssEntry` is pinned to `dist/assets/index-DSTe9S5t.css` — Vite content-
hashes this filename on every `npm run build`. Before re-running the
converter after a rebuild, re-glob `frontend/dist/assets/*.css` and update
`cfg.cssEntry` to the current filename, or validate will report
`[CSS_IMPORT_MISSING]`.

There is no dedicated component-library stylesheet in this repo — `cssEntry`
points at the **whole compiled app's** CSS (Tailwind + any statically
imported CSS, e.g. `react-toastify/dist/ReactToastify.css`). This is why
`[TOKENS_MISSING]` flags a handful of `@aws-amplify/ui-react` theme
variables (`--amplify-components-link-*`, `--amplify-components-radio-*`):
they're artifacts of the whole app's stylesheet, not anything these 10
components actually use — confirmed non-blocking, no component reads them.

## Re-syncing: don't use `resync.mjs` directly

The normal driver (`node .ds-sync/resync.mjs ...`) chains
build → remote-diff → validate → capture as one process, with no hook to run
`fix-toesm.mjs` between build and validate. Using it as-is would validate the
**unpatched** bundle (MUI icon double-wrap bug back in effect) and report
false render failures on AdminHeader/InstructorHeader/StudentHeader/
VoiceConversation. Until this repo's mandatory-extra-step problem has a real
driver hook, re-sync manually with the 4-command sequence at the top of this
file (build → `fix-toesm.mjs` → validate → capture), not the driver. There
is no previously-uploaded anchor issue this loses for a first sync anyway
(remote-diff has nothing to diff against yet); on a *later* re-sync, fetch
`_ds_sync.json` from the project first and compare it by hand against the
fresh build's `_ds_sync.json` if you need the changed/unchanged partition
`remote-diff` would otherwise compute.

## Re-sync risks (read before any future sync)

- `dtsPropsFor` for all 10 components is **hand-written from reading each
  component's `PropTypes` block / destructured params**, not auto-extracted
  (there is no TypeScript in this repo at all). If a component's props
  change, `dtsPropsFor` will silently go stale — there's no compiler to
  catch the drift. Re-check `dtsPropsFor` against the component's actual
  props on every re-sync where the component's source changed.
- `frontend/.ds-entry.mjs` must be kept in sync by hand whenever a component
  is added, removed, or renamed under `frontend/src/components/` — nothing
  regenerates it automatically.
- `.design-sync/fix-toesm.mjs` assumes esbuild keeps generating
  `__toESM(mod, 1)` for CJS modules with `__esModule: true`. If a future
  esbuild version changes this codegen, the patch becomes a silent no-op
  (harmless) rather than a failure — if the MUI icon bug ever reappears,
  re-verify with the isolated-bundle test described above before assuming
  the patch script still applies.
- The Amplify/Cognito calls in AdminHeader/InstructorHeader/StudentHeader/
  Session/StudentHeader (`signOut`, `fetchAuthSession`, `fetchUserAttributes`)
  all fail silently in the preview sandbox (no real backend) — this is
  expected and doesn't affect rendering, since every call site catches its
  own rejection.
