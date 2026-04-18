import React, { useState, useRef, useEffect } from "react";
import { createWLipSyncNode } from "wlipsync";

export default function LipSyncText({ status, jobId, BACKEND_URL, onLipnodeRef }) {
  const [mfcc, setMfcc] = useState([]);
  const [visemeWeights, setVisemeWeights] = useState({});
  const [started, setStarted] = useState(false);

  const lipNodeRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    // If we get a new job, reset and start lip sync
    if (status === "done" && jobId) {
      startLipSync(`${BACKEND_URL}/get_tts/${jobId}`);
    } else {
      stopLipSync();
    }

    // Cleanup on unmount
    return () => stopLipSync();
  }, [status, jobId]);

  const startLipSync = async (audioSrc) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const profileResponse = await fetch("/profile.json");
      if (!profileResponse.ok) throw new Error(`Failed to load profile.json: ${profileResponse.statusText}`);
      const profile = await profileResponse.json();

      // Setup audio element
      const audio = new Audio(audioSrc);
      audio.crossOrigin = "anonymous";
      audioRef.current = audio;

      // Setup lip sync node
      const lipNode = await createWLipSyncNode(audioContext, profile);
      lipNodeRef.current = lipNode;

      const sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(lipNode);

      // Connect to destination (so you can hear it)
      lipNode.connect(audioContext.destination);

      const loop = () => {
        if (!lipNodeRef.current) return;

        const weights = lipNodeRef.current.weights;
        if (weights && typeof weights === "object") {
          setVisemeWeights(weights);
        } else {
          setVisemeWeights({});
        }

        if (lipNodeRef.current.mfcc?.slice) {
          setMfcc(lipNodeRef.current.mfcc.slice(0, 13));
        }

        requestAnimationFrame(loop);
      };

      loop();
      onLipnodeRef?.(lipNode);
      setStarted(true);

      // Start playback
      await audio.play();
    } catch (err) {
      console.error("LipSync init error:", err);
      setStarted(false);
    }
  };

  const stopLipSync = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
    }

    lipNodeRef.current = null;
    audioContextRef.current = null;
    audioRef.current = null;
    setStarted(false);
    setMfcc([]);
    setVisemeWeights({});
  };

  return (
    <div className="p-4 font-inter max-w-md mx-auto border border-gray-200 rounded-lg shadow-md my-8">
      <h2 className="text-center text-gray-800 text-2xl font-semibold mb-4">WLipSync Demo</h2>

      {started ? (
        <>
          {/* MFCC */}
          <div className="text-base text-gray-700 mb-4">
            MFCC:{" "}
            {mfcc.length > 0
              ? mfcc.map((val, i) => (
                  <span key={i} className="mr-2 bg-gray-100 px-2 py-1 rounded-md text-sm">
                    {val.toFixed(2)}
                  </span>
                ))
              : "waiting..."}
          </div>

          {/* Viseme Weights */}
          <div className="text-base text-gray-700">
            Viseme Weights:
            <div className="flex flex-wrap mt-2">
              {Object.keys(visemeWeights).length > 0
                ? Object.entries(visemeWeights).map(([key, val]) => (
                    <span key={key} className="mr-2 mb-2 bg-gray-200 px-2 py-1 rounded-md text-sm">
                      {key}: {val.toFixed(2)}
                    </span>
                  ))
                : "waiting..."}
            </div>
          </div>
        </>
      ) : (
        <p className="text-gray-500">Waiting for audio...</p>
      )}

      <p className="text-xs text-gray-600 mt-4">
        Requires `profile.json` in your `public/` folder.
      </p>
    </div>
  );
}
