import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import useChatMessages from "../useChatMessages";

let streamObserver;

vi.mock("aws-amplify/api", () => ({
  generateClient: () => ({
    graphql: () => ({
      subscribe: (observer) => {
        streamObserver = observer;
        return { unsubscribe: vi.fn() };
      },
    }),
  }),
}));

vi.mock("../../../../utils/socket", () => ({
  getSocket: vi.fn().mockResolvedValue({
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

vi.mock("../useVoiceSocketMessages", () => ({
  default: vi.fn(),
}));

describe("useChatMessages", () => {
  beforeEach(() => {
    streamObserver = null;
  });

  it("reconciles AppSync start/chunk/end stream into a final AI message", async () => {
    const studentApi = {
      textGenerationStream: vi.fn().mockResolvedValue({ ok: true }),
      createMessage: vi.fn(),
      getMessages: vi.fn(),
      deleteLastMessage: vi.fn(),
      evaluateEmpathy: vi.fn(),
      updatePatientScore: vi.fn(),
    };

    const { result } = renderHook(() => {
      const [session, setSession] = React.useState({
        session_id: "s1",
        session_name: "New chat",
      });
      const [sessions, setSessions] = React.useState([{ session_id: "s1", session_name: "New chat" }]);
      const [messages, setMessages] = React.useState([]);
      const [currentSessionId, setCurrentSessionId] = React.useState("s1");

      const hook = useChatMessages({
        group: { simulation_group_id: "g1" },
        patient: { patient_id: "p1" },
        session,
        setSession,
        setSessions,
        messages,
        setMessages,
        currentSessionId,
        setCurrentSessionId,
        creatingSession: false,
        setCreatingSession: vi.fn(),
        getAuth: vi.fn().mockResolvedValue({ email: "student@example.com" }),
        studentApi,
        empathyEnabled: false,
        setRealtimeEmpathy: vi.fn(),
        handleNewChat: vi.fn(),
        handleStreamingResponseRef: { current: null },
        isAItyping: false,
        setIsAItyping: vi.fn(),
      });

      return { hook, messages, session, sessions };
    });

    await waitFor(() => {
      expect(streamObserver).toBeTruthy();
    });

    await act(async () => {
      streamObserver.next({
        data: { onTextStream: { data: JSON.stringify({ type: "start", content: "" }) } },
      });
    });

    await act(async () => {
      streamObserver.next({
        data: { onTextStream: { data: JSON.stringify({ type: "chunk", content: "Hello" }) } },
      });
      streamObserver.next({
        data: { onTextStream: { data: JSON.stringify({ type: "chunk", content: " world" }) } },
      });
      streamObserver.next({
        data: {
          onTextStream: {
            data: JSON.stringify({ type: "end", content: "", session_name: "updated" }),
          },
        },
      });
    });

    await waitFor(() => {
      const aiMessages = result.current.messages.filter((m) => m.student_sent === false);
      expect(aiMessages).toHaveLength(1);
      expect(aiMessages[0].message_content).toBe("Hello world");
      expect(result.current.session.session_name).toBe("updated");
    });
  });
});
