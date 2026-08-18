import { useEffect, useState } from "react";
import { apiGet } from "../../utils/apiClient";

export function filterPollyVoices(voices, gender) {
  const normalizedGender = gender?.toLowerCase();
  if (normalizedGender !== "female" && normalizedGender !== "male") {
    return voices;
  }
  return voices.filter((voice) => voice.gender?.toLowerCase() === normalizedGender);
}

export function selectPollyVoice(voices, gender, selectedVoice) {
  const availableVoices = filterPollyVoices(voices, gender);
  return availableVoices.find(
    (voice) => voice.id.toLowerCase() === selectedVoice?.toLowerCase()
  )?.id || availableVoices[0]?.id || "";
}

export function formatPollyVoice(voice) {
  const engine = voice.preferredEngine ? ` (${voice.preferredEngine})` : "";
  return `${voice.name || voice.id} - ${voice.languageName || voice.languageCode}${engine}`;
}

export function usePollyVoices() {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    apiGet("instructor/polly_voices")
      .then((response) => {
        if (active) setVoices(response?.voices || []);
      })
      .catch((requestError) => {
        if (active) setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { voices, loading, error };
}