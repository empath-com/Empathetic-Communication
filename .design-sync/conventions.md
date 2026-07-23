## What this is

These are the 10 real, hand-written UI components from the Empathetic
Communication app (`frontend/src/components/`) — chat bubbles, page headers,
a file manager, an empathy-scoring summary, a voice-call dialog, and a p5
audio visualizer. This is not a curated design-system package: there are no
shared design tokens, no theme file, and no component library build — each
component is a standalone `.jsx` file styled inline with Tailwind utility
classes and, for richer widgets, plain MUI components on MUI's **default**
theme (no custom `ThemeProvider` exists anywhere in this app).

## Wrapping and setup

Most components need no wrapper at all — mount them directly. Two
exceptions read a shared React context for instructor/student view
switching: `InstructorHeader` and `StudentHeader` both call
`useContext(UserContext)`. If composing either, wrap the tree in the
bundle's exported `UserContext.Provider`:

```jsx
<UserContext.Provider value={{ isInstructorAsStudent: false, setIsInstructorAsStudent: () => {} }}>
  <StudentHeader />
</UserContext.Provider>
```

`isInstructorAsStudent: true` reveals StudentHeader's "Instructor View"
button; `false` (or omitted) is the common case.

Several components (`AdminHeader`, `InstructorHeader`, `StudentHeader`,
`Session`) call `aws-amplify/auth` functions (`signOut`, `fetchAuthSession`)
on click or on mount. Outside a real Cognito-configured app these calls
reject and are caught silently by the component itself — no provider needed,
nothing to configure, the UI still renders and functions normally.

## Styling idiom — two systems side by side, never mixed within one component

- **Tailwind utility classes** for layout/chrome: headers, chat bubbles, and
  the session list use real Tailwind classes directly in `className` —
  `bg-white`, `border-gray-200`, `rounded-lg`/`rounded-2xl`, `shadow-sm`,
  `flex items-center justify-between`. **Emerald is the brand accent**
  (`emerald-500`/`emerald-600` for primary actions and the selected/active
  state, `emerald-50`/`emerald-100` for its light backgrounds); `gray-100`/
  `gray-200`/`gray-700` are the neutral/secondary action style. There is no
  tokens file — these are the literal class names to reuse for anything
  visually consistent with this app (e.g. a new primary button should be
  `bg-emerald-500 hover:bg-emerald-600 text-white`, matching InstructorHeader's
  "Student View" button).
- **MUI components** (`Table`, `Dialog`, `Chip`, `IconButton`,
  `LinearProgress`, `CircularProgress`, `TextField`) for data-heavy or
  overlay UI (`FileManagement`, `EmpathyCoachSummary`, `VoiceConversation`).
  These render on MUI's stock default theme — no emerald override — so a MUI
  `Button` here will come out MUI blue, not emerald, unless a theme is
  supplied. Don't mix the two systems inside one new component; follow
  whichever idiom the closest existing component in this set uses.

## Where the truth lives

`styles.css` at the bundle root `@import`s the compiled Tailwind stylesheet
and `_ds_bundle.css`; read it before styling anything new. Each component's
`.prompt.md` documents its real prop shape (hand-written — this codebase has
no TypeScript, so there's no `.d.ts` to regenerate from; treat the prop list
as authoritative but not compiler-enforced).

## Example composition (real idiom, adapted from an authored preview)

```jsx
<div style={{ maxWidth: 480 }}>
  <AIMessage
    message="Thanks for sharing that. I've been having this dull ache in my lower back for two weeks."
    name="Eleanor Rhodes"
  />
</div>
```
