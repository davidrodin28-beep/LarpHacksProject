import { useState, useRef, useEffect, useCallback } from 'https://esm.sh/react@19.2.0';
import { getClient } from '../auth/client.js';
import { SPORTGEN_API_URL } from '../config.js';
import { VoiceNarrator } from './narration.js';

export function useNarration() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const narrator = useRef(null);
  if (!narrator.current) narrator.current = new VoiceNarrator({
    endpoint: `${SPORTGEN_API_URL}/speech`,
    getToken: async () => {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.access_token;
    },
    onStatus: setStatus,
  });
  useEffect(() => () => narrator.current.dispose(), []);
  const speak = useCallback(text => narrator.current.speak(text), []);
  const stop = useCallback(() => narrator.current.stop(), []);
  const toggle = () => {
    stop();
    setEnabled(previous => !previous);
  };
  return { enabled, status, speak, stop, toggle };
}
