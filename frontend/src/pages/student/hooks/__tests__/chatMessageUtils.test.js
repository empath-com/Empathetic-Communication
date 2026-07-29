import {
  dedupeAndNormalizeMessages,
  filterUnwantedMessages,
  normalizeEmpathyData,
} from "../chatMessageUtils";

describe("chatMessageUtils", () => {
  it("normalizes and deduplicates chat history payloads", () => {
    const raw = [
      {
        message_id: "1",
        student_sent: true,
        message_content: "User: hello",
        time_sent: "2024-01-01T00:00:01.000Z",
      },
      {
        message_id: "2",
        student_sent: false,
        message_content: "Assistant: hi there",
        time_sent: "2024-01-01T00:00:02.000Z",
      },
      {
        message_id: "3",
        student_sent: false,
        message_content: "Assistant: hi there",
        time_sent: "2024-01-01T00:00:03.000Z",
      },
      {
        message_id: "4",
        student_sent: true,
        message_content: "Begin the conversation as the patient",
        time_sent: "2024-01-01T00:00:04.000Z",
      },
    ];

    const result = dedupeAndNormalizeMessages(raw);

    expect(result).toHaveLength(2);
    expect(result[0].message_content).toBe("hello");
    expect(result[1].message_content).toBe("hi there");
    expect(result[0].student_sent).toBe(true);
    expect(result[1].student_sent).toBe(false);
  });

  it("filters backend voice transcript aggregate blobs", () => {
    const messages = [
      {
        message_id: "1",
        student_sent: true,
        message_content: "[VOICE_TRANSCRIPT] long combined blob",
      },
      {
        message_id: "2",
        student_sent: false,
        message_content: "Assistant: I hear you.",
      },
    ];

    const result = filterUnwantedMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].message_content).toBe("I hear you.");
  });

  it("normalizes PRISM empathy payloads", () => {
    const normalized = normalizeEmpathyData({
      evaluation_tool: "PRISM",
      prepare: 4,
      recognise: 3,
      interact: 5,
      self_assess: 3,
      master: 4,
      feedback: {
        strengths: ["Showed care"],
        improvement_suggestions: ["Ask open questions"],
      },
      summary: {
        overall_assessment: "Solid start",
      },
    });

    expect(normalized.empathy_tool).toBe("PRISM");
    expect(normalized.overall_score).toBe(3.8);
    expect(normalized.strengths).toEqual(["Showed care"]);
    expect(normalized.recommendations).toEqual(["Ask open questions"]);
  });
});
