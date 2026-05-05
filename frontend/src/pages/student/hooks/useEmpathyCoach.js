import { useEffect, useState } from "react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";

/**
 * Manages empathy evaluation state: summary fetching, empathy-enabled flag,
 * voice-enabled flag, and real-time empathy chunks.
 *
 * @param {object} params
 * @param {object|null} params.group - Simulation group.
 * @param {object|null} params.patient - Current patient.
 * @param {object|null} params.session - Active session.
 */
export default function useEmpathyCoach({ group, patient, session }) {
  const [empathySummary, setEmpathySummary] = useState(null);
  const [isEmpathyLoading, setIsEmpathyLoading] = useState(false);
  const [isEmpathyCoachOpen, setIsEmpathyCoachOpen] = useState(false);
  const [empathyEnabled, setEmpathyEnabled] = useState(false);
  const [empathyTool, setEmpathyTool] = useState("CARE");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [realtimeEmpathy, setRealtimeEmpathy] = useState([]);

  // Handle empathy data from voice conversations
  const handleVoiceEmpathyData = (empathyData) => {
    console.log("Received empathy data from voice:", empathyData);
    setRealtimeEmpathy((prev) => [...prev, empathyData]);
  };

  // --- Fetch empathy summary ---
  const fetchEmpathySummary = async () => {
    if (!session || !patient) return;

    setIsEmpathyLoading(true);
    setIsEmpathyCoachOpen(true);
    try {
      const authSession = await fetchAuthSession();
      const token = authSession.tokens.idToken;
      const { email } = await fetchUserAttributes();

      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}student/empathy_summary?session_id=${encodeURIComponent(
          session.session_id
        )}&email=${encodeURIComponent(email)}&simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&patient_id=${encodeURIComponent(patient.patient_id)}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Empathy evaluation response:", data);
        if (!data || !data.overall_score) {
          setIsEmpathyLoading(false);
          return;
        }
        const summary = {
          empathy_tool: data.empathy_tool || "CARE",
          overall_score: data.overall_score || 0,
          total_criteria_hits: data.total_criteria_hits || 0,
          // CARE domain scores
          rapport: data.rapport || 0,
          listening: data.listening || 0,
          whole_person: data.whole_person || 0,
          affective_empathy: data.affective_empathy || 0,
          communication: data.communication || 0,
          shared_planning: data.shared_planning || 0,
          // PRISM criterion scores
          prepare: data.prepare || 0,
          recognise: data.recognise || 0,
          interact: data.interact || 0,
          self_assess: data.self_assess || 0,
          master: data.master || 0,
          summary: data.summary || "",
          strengths: data.strengths || [],
          recommendations: data.recommendations || [],
          forward_target: data.forward_target || "",
        };
        setEmpathySummary(summary);
        setIsEmpathyCoachOpen(true);
      } else {
        console.error("Failed to evaluate empathy:", response.statusText);
      }
    } catch (error) {
      console.error("Error evaluating empathy:", error);
    } finally {
      setIsEmpathyLoading(false);
    }
  };

  // --- Fetch empathy enabled status ---
  useEffect(() => {
    const fetchEmpathyEnabled = async () => {
      if (!group?.simulation_group_id) return;

      try {
        const authSession = await fetchAuthSession();
        const token = authSession.tokens.idToken;
        const response = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}student/empathy_enabled?simulation_group_id=${encodeURIComponent(
            group.simulation_group_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setEmpathyEnabled(data.empathy_enabled);
          setEmpathyTool(data.empathy_tool || "CARE");
        } else {
          console.error("Failed to fetch empathy enabled status:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching empathy enabled status:", error);
      }
    };

    const fetchVoiceEnabled = async () => {
      if (!group?.simulation_group_id) return;

      try {
        const authSession = await fetchAuthSession();
        const token = authSession.tokens.idToken;
        const response = await fetch(
          `${import.meta.env.VITE_API_ENDPOINT}student/voice_enabled?simulation_group_id=${encodeURIComponent(
            group.simulation_group_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setVoiceEnabled(data.voice_enabled);
        } else {
          console.error("Failed to fetch voice enabled status:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching voice enabled status:", error);
      }
    };

    fetchEmpathyEnabled();
    fetchVoiceEnabled();
  }, [group]);

  return {
    empathySummary,
    isEmpathyLoading,
    isEmpathyCoachOpen,
    setIsEmpathyCoachOpen,
    empathyEnabled,
    empathyTool,
    voiceEnabled,
    realtimeEmpathy,
    setRealtimeEmpathy,
    fetchEmpathySummary,
    handleVoiceEmpathyData,
  };
}
