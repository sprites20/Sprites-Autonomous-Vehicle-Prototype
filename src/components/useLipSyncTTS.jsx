import { useRef, useEffect } from "react";
import { createWLipSyncNode } from "wlipsync";

export function useLipSyncTTS(onLipnodeRef) {
  const lipNodeRef = useRef(null);
  const audioContextRef = useRef(null);

  // Initialize lip sync node once
  useEffect(() => {
    (async () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const profileResponse = await fetch("/profile.json");
      const profile = await profileResponse.json();

      const lipNode = await createWLipSyncNode(audioContext, profile);
      lipNodeRef.current = lipNode;
      onLipnodeRef?.(lipNodeRef);

      // 🔹 Start logging loop for visemes
      const logLoop = () => {
        if (lipNodeRef.current?.weights) {
          console.log("Viseme Weights:", lipNodeRef.current.weights);
        }
        requestAnimationFrame(logLoop);
      };
      logLoop();
    })();

    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // helper to fetch TTS audio
  const fetchTTS = async (text) => {
    const res = await fetch("http://localhost:5001/generate_tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const { job_id } = await res.json();

    let audioUrl = null;
    while (!audioUrl) {
      const check = await fetch(`http://localhost:5001/get_tts/${job_id}`);
      if (check.headers.get("content-type")?.includes("application/json")) {
        const data = await check.json();
        if (data.status === "done") {
          audioUrl = `http://localhost:5001/get_tts/${job_id}`;
        } else if (data.status === "error") {
          throw new Error(data.message);
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } else {
        audioUrl = `http://localhost:5001/get_tts/${job_id}`;
      }
    }
    return audioUrl;
  };

  // public function to speak text & update lip sync
  const speak = async (text) => {
    if (!audioContextRef.current || !lipNodeRef.current) {
      throw new Error("LipSync not initialized yet.");
    }
    const url = await fetchTTS(text);
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";

    await audio.play();

    const source = audioContextRef.current.createMediaElementSource(audio);
    source.connect(lipNodeRef.current);
    source.connect(audioContextRef.current.destination);
  };

  return { speak, lipNodeRef };
}
