import { AIMessage } from 'frontend';

export const Default = () => (
  <div style={{ maxWidth: 480, padding: 16, background: '#f9fafb' }}>
    <AIMessage
      message="Thanks for sharing that. I've been having this dull ache in my lower back for about two weeks now — it's worse in the mornings and gets a little better once I've moved around."
      name="Eleanor Rhodes"
    />
  </div>
);

export const LongMessageWithCode = () => (
  <div style={{ maxWidth: 480, padding: 16, background: '#f9fafb' }}>
    <AIMessage
      message={
        "Here is a simple breathing exercise you can try before our next session:\n\n" +
        "```\n1. Inhale slowly for 4 seconds\n2. Hold for 4 seconds\n3. Exhale for 4 seconds\n4. Repeat 5 times\n```\n\n" +
        "Let me know how that feels, and we can talk through it at your next visit."
      }
      name="Marcus Chen"
    />
  </div>
);
