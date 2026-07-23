// Hand-authored bundle entry for the design-sync converter (claude.ai/design).
//
// Why this file exists and lives here (not under .design-sync/): every
// component in src/components/ uses `export default X` with no named/barrel
// export. The converter's built-in synth-entry fallback (no dist/, no .d.ts)
// emits `export * from "<file>"` per source file, but `export *` never
// forwards a module's default export (ES module spec) — so that fallback
// alone would produce an empty window.<globalName> object. This file
// re-exports each component under its real name so the bundle actually
// carries them. It must live inside frontend/ (not .design-sync/) because
// package-build.mjs derives PKG_DIR by walking up from --entry's directory
// to the nearest package.json with a "name" field — frontend/package.json
// is that anchor; walking up from repo root (which has no package.json)
// would resolve PKG_DIR to the wrong place.
export { default as AIMessage } from './src/components/AIMessage.jsx';
export { default as AdminHeader } from './src/components/AdminHeader.jsx';
export { default as EmpathyCoachSummary } from './src/components/EmpathyCoachSummary.jsx';
export { default as FileManagement } from './src/components/FileManagement.jsx';
export { default as InstructorHeader } from './src/components/InstructorHeader.jsx';
export { default as NovaVisualizer } from './src/components/NovaVisualizer.jsx';
export { default as Session } from './src/components/Session.jsx';
export { default as StudentHeader } from './src/components/StudentHeader.jsx';
export { default as StudentMessage } from './src/components/StudentMessage.jsx';
export { default as VoiceConversation } from './src/components/VoiceConversation.jsx';
