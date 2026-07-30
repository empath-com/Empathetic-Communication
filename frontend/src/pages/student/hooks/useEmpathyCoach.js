import { useEffect, useState } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { apiGet } from "../../../utils/apiClient";

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
      const { email } = await fetchUserAttributes();
      const data = await apiGet("student/empathy_summary", {
        session_id: session.session_id,
        email,
        simulation_group_id: group.simulation_group_id,
        patient_id: patient.patient_id,
      });

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
        // NURSE criterion scores
        name: data.name || 0,
        understand: data.understand || 0,
        respect: data.respect || 0,
        support: data.support || 0,
        explore: data.explore || 0,
        summary: data.summary || "",
        strengths: data.strengths || [],
        recommendations: data.recommendations || [],
        forward_target: data.forward_target || "",
      };
      setEmpathySummary(summary);
      setIsEmpathyCoachOpen(true);
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
        const data = await apiGet("student/empathy_enabled", {
          simulation_group_id: group.simulation_group_id,
        });
        setEmpathyEnabled(data.empathy_enabled);
        setEmpathyTool(data.empathy_tool || "CARE");
      } catch (error) {
        console.error("Error fetching empathy enabled status:", error);
      }
    };

    const fetchVoiceEnabled = async () => {
      if (!group?.simulation_group_id) return;

      try {
        const data = await apiGet("student/voice_enabled", {
          simulation_group_id: group.simulation_group_id,
        });
        setVoiceEnabled(data.voice_enabled);
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
