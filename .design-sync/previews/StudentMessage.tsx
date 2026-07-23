import { StudentMessage } from 'frontend';

const noop = () => {};

export const Default = () => (
  <div style={{ maxWidth: 480, padding: 16, background: '#f9fafb' }}>
    <StudentMessage
      message="I've had this dull ache in my lower back for about two weeks. It's worse in the mornings."
      isMostRecent={false}
      onDelete={noop}
      hasAiMessageAfter={noop}
    />
  </div>
);

export const PreviewDraft = () => (
  <div style={{ maxWidth: 480, padding: 16, background: '#f9fafb' }}>
    <StudentMessage
      message="Can you tell me more about when it started hurting?"
      isMostRecent={true}
      onDelete={noop}
      hasAiMessageAfter={noop}
      isPreview={true}
    />
  </div>
);

export const WithCodeBlock = () => (
  <div style={{ maxWidth: 480, padding: 16, background: '#f9fafb' }}>
    <StudentMessage
      message={"Here's the error I'm seeing:\n```\nTypeError: Cannot read properties of undefined\n```"}
      isMostRecent={false}
      onDelete={noop}
      hasAiMessageAfter={noop}
    />
  </div>
);
