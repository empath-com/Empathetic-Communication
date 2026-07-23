import { Session } from 'frontend';

const noop = () => {};

export const Selected = () => (
  <div style={{ maxWidth: 280, background: '#fff', padding: 8 }}>
    <Session
      text="Discussing chronic back pain"
      session={{ session_id: 1 }}
      selectedSession={{ session_id: 1 }}
      setSession={noop}
      deleteSession={noop}
      setMessages={noop}
      setSessions={noop}
    />
  </div>
);

export const Unselected = () => (
  <div style={{ maxWidth: 280, background: '#fff', padding: 8 }}>
    <Session
      text="New patient intake — Marcus Chen"
      session={{ session_id: 2 }}
      selectedSession={{ session_id: 1 }}
      setSession={noop}
      deleteSession={noop}
      setMessages={noop}
      setSessions={noop}
    />
  </div>
);

export const UntitledChat = () => (
  <div style={{ maxWidth: 280, background: '#fff', padding: 8 }}>
    <Session
      text=""
      session={{ session_id: 3 }}
      selectedSession={{ session_id: 1 }}
      setSession={noop}
      deleteSession={noop}
      setMessages={noop}
      setSessions={noop}
    />
  </div>
);
