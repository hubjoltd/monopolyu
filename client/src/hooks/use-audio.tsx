import { useCallback, useRef } from "react";

export function useAudio() {
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio on first use
  const initializeAudio = useCallback(() => {
    if (!successAudioRef.current) {
      successAudioRef.current = new Audio();
      successAudioRef.current.preload = 'auto';
      // Using a success notification sound from a free sound library
      successAudioRef.current.src = 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3';
    }
  }, []);

  const playSuccess = useCallback(() => {
    initializeAudio();
    if (successAudioRef.current) {
      // Reset and play
      successAudioRef.current.currentTime = 0;
      successAudioRef.current.play().catch(error => {
        console.warn('Failed to play success sound:', error);
      });
    }
  }, [initializeAudio]);

  return {
    playSuccess,
  };
}
