import { renderHook, act } from "@testing-library/react";
import useChatSessions from "../useChatSessions";

describe("useChatSessions", () => {
  it("creates a new session and triggers initial stream", async () => {
    const group = { simulation_group_id: "group-1" };
    const patient = { patient_id: "patient-1" };

    const streamHandler = vi.fn().mockResolvedValue({ ok: true });
    const handleStreamingResponseRef = { current: streamHandler };

    const studentApi = {
      getPatientSessions: vi.fn().mockResolvedValue([{ session_id: "existing" }]),
      createSession: vi.fn().mockResolvedValue([
        { session_id: "session-1", session_name: "New chat" },
      ]),
      deleteSession: vi.fn().mockResolvedValue({}),
    };

    const getAuth = vi.fn().mockResolvedValue({ email: "student@demo.com" });
    const setSessions = vi.fn();
    const setSession = vi.fn();
    const setMessages = vi.fn();
    const setCurrentSessionId = vi.fn();

    const { result } = renderHook(() =>
      useChatSessions({
        group,
        patient,
        getAuth,
        studentApi,
        handleStreamingResponseRef,
        setIsAItyping: vi.fn(),
        sessions: [{ session_id: "existing" }],
        setSessions,
        session: { session_id: "existing" },
        setSession,
        setMessages,
        setCurrentSessionId,
        filterUnwantedMessages: (x) => x,
      })
    );

    await act(async () => {
      await result.current.handleNewChat();
    });

    expect(studentApi.createSession).toHaveBeenCalledWith({
      email: "student@demo.com",
      simulationGroupId: "group-1",
      patientId: "patient-1",
      sessionName: "New chat",
    });

    expect(streamHandler).toHaveBeenCalledWith(
      {
        simulationGroupId: "group-1",
        sessionId: "session-1",
        patientId: "patient-1",
        sessionName: "New chat",
      },
      "session-1"
    );
  });
});
