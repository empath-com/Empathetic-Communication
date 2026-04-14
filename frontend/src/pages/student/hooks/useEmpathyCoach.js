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
          overall_score: data.overall_score || 0,
          total_messages_evaluated: data.total_messages_evaluated || 0,
          total_criteria_hits: data.total_criteria_hits || 0,
          making_feel_at_ease: data.making_feel_at_ease || 0,
          letting_tell_story: data.letting_tell_story || 0,
          really_listening: data.really_listening || 0,
          interested_in_whole_person: data.interested_in_whole_person || 0,
          understanding_concerns: data.understanding_concerns || 0,
          showing_care_compassion: data.showing_care_compassion || 0,
          being_positive: data.being_positive || 0,
          explaining_clearly: data.explaining_clearly || 0,
          helping_take_control: data.helping_take_control || 0,
          making_plan_of_action: data.making_plan_of_action || 0,
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
    voiceEnabled,
    realtimeEmpathy,
    setRealtimeEmpathy,
    fetchEmpathySummary,
    handleVoiceEmpathyData,
  };
}
