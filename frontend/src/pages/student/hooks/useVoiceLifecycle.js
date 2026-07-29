import { useCallback, useState } from "react";
import {
  startSpokenLLM,
  stopSpokenLLM,
  stopAudioPlayback,
  initPlaybackContext,
} from "../../../utils/voiceStream";

export default function useVoiceLifecycle({
  patient,
  group,
  currentSessionId,
  setLoading,
  allowAudioRef,
  getMessages,
  studentApi,
}) {
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const fetchVoiceID = useCallback(async () => {
    try {
      return await studentApi.fetchPatientVoiceId(patient?.patient_id);
    } catch (error) {
      console.warn("Error fetching voice ID, defaulting to tiffany:", error);
      return "tiffany";
    }
  }, [patient?.patient_id, studentApi]);

  const handleVoiceStop = useCallback(async () => {
    stopAudioPlayback();
    setIsRecording(false);
    setShowVoiceOverlay(false);
    setLoading(false);
    await stopSpokenLLM();
    allowAudioRef.current = false;
    setTimeout(() => getMessages(), 2000);
  }, [allowAudioRef, getMessages, setLoading]);

  const handleVoiceToggle = useCallback(() => {
    if (isRecording) {
      handleVoiceStop();
      return;
    }

    initPlaybackContext();
    allowAudioRef.current = true;
    setShowVoiceOverlay(true);
    fetchVoiceID().then((voiceId) => {
      startSpokenLLM(voiceId, setLoading, currentSessionId, {
        patient_name: patient?.patient_name,
        patient_prompt: patient?.patient_prompt,
        patient_id: patient?.patient_id || "",
        llm_completion: !!patient?.llm_completion,
        system_prompt: group?.system_prompt || "",
      });
    });
    setIsRecording(true);
    setLoading(true);
  }, [
    allowAudioRef,
    currentSessionId,
    fetchVoiceID,
    group?.system_prompt,
    handleVoiceStop,
    isRecording,
    patient,
    setLoading,
  ]);

  return {
    showVoiceOverlay,
    setShowVoiceOverlay,
    isRecording,
    setIsRecording,
    handleVoiceStop,
    handleVoiceToggle,
  };
}
