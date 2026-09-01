import { useEffect, useRef, useState } from "react";
import { apiPost } from "../../utils/apiClient";

function decodeSample(audio) {
  const decodedAudio = atob(audio);
  const bytes = Uint8Array.from(decodedAudio, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "audio/mpeg" });
}

export function useVoiceSample() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const cleanup = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => cleanup, []);

  const playSample = async (voiceId) => {
    if (!voiceId || isPlaying) return;

    setIsPlaying(true);
    try {
      const { audio } = await apiPost("instructor/voice_sample", { voice_id: voiceId });
      const objectUrl = URL.createObjectURL(decodeSample(audio));
      const audioElement = new Audio(objectUrl);

      objectUrlRef.current = objectUrl;
      audioRef.current = audioElement;
      audioElement.onended = cleanup;
      audioElement.onerror = cleanup;
      await audioElement.play();
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  return { isPlaying, playSample };
}