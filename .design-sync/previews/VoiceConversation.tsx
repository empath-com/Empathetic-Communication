import { VoiceConversation } from 'frontend';

// VoiceConversation dials a real WebSocket voice service on mount (open=true
// triggers connectToVoiceService()). There's no backend in a static preview,
// so the only state reachable from outside is the "connecting" state the
// dialog opens into — connectionStatus/isRecording/isSpeaking are internal
// component state reached only after a live connection, so they can't be
// composed from here (see .design-sync/NOTES.md).
export const Open = () => (
  <VoiceConversation
    open={true}
    onClose={() => {}}
    patientContext="Patient reports two weeks of lower back pain, worse in the mornings."
  />
);
