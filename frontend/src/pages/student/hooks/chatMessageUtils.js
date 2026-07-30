/**
 * Normalise a raw voice-mode line, stripping prefixes and returning role info.
 */
export function normalizeVoiceLine(rawText) {
  const text = (rawText ?? "").trim();
  if (!text) return null;

  if (text.startsWith("[VOICE_TRANSCRIPT]")) {
    const content = text.replace(/^\[VOICE_TRANSCRIPT\]/, "").trim();
    if (!content) return null;
    return { student_sent: true, message_content: content };
  }

  if (text.startsWith("User:")) {
    return { student_sent: true, message_content: text.replace(/^User:\s*/, "").trim() };
  }
  if (text.startsWith("Assistant:")) {
    return { student_sent: false, message_content: text.replace(/^Assistant:\s*/, "").trim() };
  }
  return { message_content: text };
}

/**
 * Filter out unwanted messages (voice transcript blocks, initial prompts, etc.).
 */
export function filterUnwantedMessages(messagesArray) {
  if (!Array.isArray(messagesArray)) {
    return messagesArray;
  }

  const out = [];
  for (const m of messagesArray) {
    const n = normalizeVoiceLine(m?.message_content);
    if (!n) continue;

    if ((m.message_content || "").includes("Begin the conversation as the")) continue;

    // The backend saves a [VOICE_TRANSCRIPT] message that concatenates all user
    // speech for the whole session into one blob (used for empathy evaluation).
    // The individual per-turn user messages are already stored separately, so
    // skip this combined record to avoid a duplicate wall-of-text at the end.
    if ((m.message_content || "").startsWith("[VOICE_TRANSCRIPT]")) continue;

    out.push({
      ...m,
      student_sent: Object.prototype.hasOwnProperty.call(n, "student_sent")
        ? n.student_sent
        : m.student_sent,
      message_content: n.message_content,
    });
  }

  return out;
}

const CARE_CRITERIA = [
  "making_feel_at_ease",
  "letting_tell_story",
  "really_listening",
  "interested_in_whole_person",
  "understanding_concerns",
  "showing_care_compassion",
  "being_positive",
  "explaining_clearly",
  "helping_take_control",
  "making_plan_of_action",
];

const PRISM_CRITERIA = ["prepare", "recognise", "interact", "self_assess", "master"];

const NURSE_CRITERIA = ["name", "understand", "respect", "support", "explore"];

const asScore = (value, fallback = 0) => {
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
};

export function normalizeEmpathyData(empathyData = {}) {
  const isLegacyEmpathy =
    !empathyData.evaluation_tool &&
    !empathyData.empathy_tool &&
    Object.prototype.hasOwnProperty.call(empathyData, "perspective_taking");
  const tool =
    empathyData.evaluation_tool === "NURSE" || empathyData.empathy_tool === "NURSE"
      ? "NURSE"
      : empathyData.evaluation_tool === "PRISM" || empathyData.empathy_tool === "PRISM"
        ? "PRISM"
        : "CARE";
  const criteria = tool === "NURSE" ? NURSE_CRITERIA : tool === "PRISM" ? PRISM_CRITERIA : CARE_CRITERIA;

  const midpoint = tool === "NURSE" ? 2 : 3;
  const scores = Object.fromEntries(
    criteria.map((criterion) => [criterion, asScore(empathyData[criterion])])
  );
  const scoreValues = Object.values(scores);
  const calculatedScore = scoreValues.length
    ? Number(
        (
          scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
        ).toFixed(1)
      )
    : 0;
  const summary = empathyData.summary || {};
  const feedback = empathyData.feedback || {};
  const legacyScore = (value) => asScore(value, midpoint) || midpoint;
  const overallScore = isLegacyEmpathy
    ? legacyScore(empathyData.empathy_score)
    : asScore(
        empathyData.overall_score ?? empathyData.empathy_score,
        calculatedScore
      );

  return {
    empathy_tool: tool,
    evaluation_tool: tool,
    overall_score: overallScore,
    total_messages_evaluated: empathyData.total_messages_evaluated || 1,
    total_criteria_hits:
      asScore(empathyData.total_criteria_hits ?? summary.criteria_hit, NaN) ||
      scoreValues.reduce((sum, score) => sum + score, 0),
    summary:
      typeof summary === "string"
        ? summary
        : summary.overall_assessment || empathyData.judge_reasoning?.overall_assessment || "",
    strengths: empathyData.strengths || feedback.strengths || [],
    recommendations:
      empathyData.recommendations ||
      feedback.improvement_suggestions ||
      feedback.areas_for_improvement ||
      [],
    forward_target: empathyData.forward_target || feedback.forward_target || "",
    timestamp: empathyData.timestamp || Date.now(),
    ...scores,
    ...(isLegacyEmpathy
      ? {
          avg_perspective_taking: legacyScore(empathyData.perspective_taking),
          avg_emotional_resonance: legacyScore(empathyData.emotional_resonance),
          avg_acknowledgment: legacyScore(empathyData.acknowledgment),
          avg_language_communication: legacyScore(
            empathyData.language_communication
          ),
          avg_cognitive_empathy: legacyScore(empathyData.cognitive_empathy),
          avg_affective_empathy: legacyScore(empathyData.affective_empathy),
          realism_assessment:
            empathyData.realism_flag === "realistic"
              ? "Your responses are generally realistic.."
              : "Your response is unrealistic...",
          realism_explanation:
            empathyData.judge_reasoning?.realism_justification || "",
          coach_assessment: empathyData.judge_reasoning?.overall_assessment || "",
          areas_for_improvement: feedback.areas_for_improvement || [],
          recommended_approach: feedback.alternative_phrasing || "",
        }
      : {}),
    ...(empathyData.source ? { source: empathyData.source } : {}),
  };
}

/**
 * Sort messages, normalize voice prefixes, remove known prompt/system rows,
 * and drop duplicates by id/content-role pair.
 */
export function dedupeAndNormalizeMessages(data = []) {
  const uniqueMessages = [];
  const messageIds = new Set();
  const messageContentMap = new Map();

  const sortedData = [...data].sort(
    (a, b) => new Date(a.time_sent) - new Date(b.time_sent)
  );

  sortedData.forEach((message) => {
    const content = message?.message_content || "";
    if (
      content.trim() === "introduce yourself briefly" ||
      content.includes("Begin the conversation as the")
    ) {
      return;
    }

    const normalized = normalizeVoiceLine(content);
    if (!normalized) return;

    const normalizedMsg = {
      ...message,
      message_content: normalized.message_content,
      student_sent: Object.prototype.hasOwnProperty.call(normalized, "student_sent")
        ? normalized.student_sent
        : message.student_sent,
    };

    const contentKey = `${normalizedMsg.student_sent ? "student" : "ai"}-${normalizedMsg.message_content.trim()}`;

    if (!messageIds.has(normalizedMsg.message_id) && !messageContentMap.has(contentKey)) {
      messageIds.add(normalizedMsg.message_id);
      messageContentMap.set(contentKey, true);
      uniqueMessages.push(normalizedMsg);
    }
  });

  return uniqueMessages;
}
