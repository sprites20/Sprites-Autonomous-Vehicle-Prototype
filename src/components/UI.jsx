import { useRef, useState, useEffect, useCallback } from "react";
import {
  FiChevronDown,
  FiChevronUp,
  FiMessageSquare,
  FiMaximize,
  FiMinimize,
  FiPaperclip
} from "react-icons/fi"; // Added FiMaximize
import { createPortal } from "react-dom";

import io from "socket.io-client";
import { ScheduleTimeLine } from "./ScheduleTimeline";
import {PersonalityChanger} from "./PersonalityChanger";
import {PianoUI} from "./PianoUI";
import {Catalog} from "./Catalog";
import React, { useMemo } from 'react';
import { screenshotEventEmitter } from "../utils/eventEmitter"; // Adjust path as needed
import {eventBus} from "./EventBus";
import { isPianoOpen, setPianoStateOpen } from "./UIStates";
import { createWLipSyncNode } from "wlipsync";

import { visemeWeightsRef } from "./lipsyncrefs";

import { getGlobalUserData, setGlobalIsChatting } from './Globals'; // Import the new function

const BACKEND_URL = "http://localhost:5001";
import * as THREE from 'three'

export const UI = ({deviceId}) => {
  const [visible, setVisible] = useState(true);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("Global");
  const [globalMessages, setGlobalMessages] = useState([]);
  const [localMessages, setLocalMessages] = useState([]);
  const textareaRef = useRef(null);
  const chatRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [sid, setSid] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [charEditorOpen, setCharEditorOpen] = useState(false);
  const [pianoOpen, setPianoOpen] = useState(false);
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [inputText, setInputText] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [screenshotData, setScreenshotData] = useState(null); // Effect to listen for the screenshot event
  const [isFullScreen, setIsFullScreen] = useState(false); // New state for fullscreen

  // Inside your main useEffect, add this to the data extraction:
  const [springBones, setSpringBones] = useState([]);
  const [materials, setMaterials] = useState([])
  const [meshes, setMeshes] = useState([]) // 🆕 New state for meshes
  // State to force update the sidebars component
  const [updateKey, setUpdateKey] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [isSinging, setIsSinging] = useState(false);
  const [currentTrack, setCurrentTrack] = useState("");

  
  const handleMaterialsReady = useCallback((mats) => {
      setMaterials(mats);
      setUpdateKey(prev => prev + 1);
  }, []);
  
  // 🆕 New handler for meshes
  const handleMeshesReady = useCallback((m) => {
    setMeshes(m);
    setUpdateKey(prev => prev + 1);
  }, []);
  
  // Function to trigger a re-render when a texture or visibility is changed
  const handleUpdate = useCallback(() => {
    setUpdateKey(prev => prev + 1) 
  }, [])

  /** Converts a Three.js texture to a displayable data URL */
function textureToDataURL(texture) {
  if (!texture || !texture.image) return null

  const img = texture.image

  if (img instanceof HTMLImageElement) return img.src

  if (img instanceof ImageBitmap || img instanceof HTMLCanvasElement) {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  }
  return null
}

useEffect(() => {
  let interval = setInterval(() => {
    const userData = getGlobalUserData();
    const vrm = userData?.vrm;
    if (!vrm) return; // still loading

    clearInterval(interval); // stop polling

    console.log("VRM ready:", vrm);

    const mats = [];
    const meshes = [];
    
    vrm.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        meshes.push({
          name: obj.name || 'Unnamed Mesh',
          object: obj,
          initialVisible: obj.visible,
        });

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((m) => {
          if (!mats.some(item => item.material === m)) {
            mats.push({
              meshName: obj.name,
              material: m,
              materialName: m.name || obj.name,
              map: m.map || null,
              originalMap: m.map || null,
            });
          }
        });
      }
    });

    // Access the Set and convert to Array
    const springBonesSet = vrm.springBoneManager.springBones;
    if (!springBonesSet || springBonesSet.size === 0) return;

    clearInterval(interval);
    const springBonesArray = Array.from(springBonesSet);

    // Grouping by "base name" to keep the UI clean
    const groupsMap = {};

    springBonesArray.forEach((joint) => {
      // Logic: Strip trailing numbers to group chain segments together
      // e.g., "563joint_migipj_0_0" -> "joint_migipj"
      const rawName = joint.bone?.name || "Unnamed";
      const groupName = rawName.replace(/^\d+/, '').replace(/_\d+_\d+$/, '');

      if (!groupsMap[groupName]) {
        groupsMap[groupName] = {
          label: groupName,
          stiffness: joint.settings?.stiffness ?? 1,
          dragForce: joint.settings?.dragForce ?? 0.4,
          joints: [] 
        };
      }
      groupsMap[groupName].joints.push(joint);
    });

    vrm.springBoneManager.springBones.forEach((joint) => {
    if (joint.settings) {
      /** * 1. STIFFNESS: How hard it tries to stay in the default pose.
       * A value of 2.0 to 4.0 is usually very rigid.
       */
      joint.settings.stiffness = 20;

      /** * 2. DRAG: Damping. Prevents "jiggling" after movement.
       * A value of 0.8 to 1.0 makes it move like it's in thick oil.
       */
      joint.settings.dragForce = 0.5;

      /** * 3. GRAVITY: Optional. 
       * If you want them to stop falling downward too much, 
       * you can lower the gravity power.
       */
      joint.settings.gravityPower = 1; 
    }
  });

    setSpringBones(Object.values(groupsMap));
    console.log("Spring Bones:", vrm.springBoneManager);
    setMaterials(mats);
    setMeshes(meshes);

  }, 200);

  return () => clearInterval(interval);
}, [materialEditorOpen]);

/** * Helper to convert Three.js texture to a displayable thumbnail.
 * We create a temporary canvas to read the actual pixel data.
 */
function textureToDataURL(texture) {
  if (!texture || !texture.image) return null;
  
  // If the image is already a canvas/img, we draw it
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width || image.videoWidth;
  canvas.height = image.height || image.videoHeight;
  const ctx = canvas.getContext('2d');

  if (texture.flipY) {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }

  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL();
}

/**
 * Self-Contained Texture Editor
 * Handles VRM/MToon specific shader updates and persistence
 */
function TextureEditor({ materials, onTextureChange }) {
  const fileInputRef = useRef(null);
  const [activeUuid, setActiveUuid] = useState(null);
  const originalsRef = useRef(new Map());

  // Store the very first textures as the "Original" source of truth
  useEffect(() => {
    materials.forEach(mInfo => {
      if (!originalsRef.current.has(mInfo.material.uuid)) {
        originalsRef.current.set(mInfo.material.uuid, mInfo.material.map);
      }
    });
  }, [materials]);

  const replaceTexture = (mInfo, newTex) => {
    const mat = mInfo.material;
    const originalTex = originalsRef.current.get(mat.uuid);

    /** 1. DISPOSE & OVERWRITE **/
    // If the current map is NOT the original, it's a previous 'custom' upload.
    // We MUST kill it to stop it from overlaying/ghosting in the GPU.
    if (mat.map && mat.map !== originalTex) {
      mat.map.dispose(); 
    }

    // Force the material to "forget" the old texture reference entirely
    mat.map = null; 

    /** 2. ALIGNMENT & PREP **/
    if (newTex) {
      newTex.flipY = false;
      newTex.colorSpace = THREE.SRGBColorSpace;
      newTex.needsUpdate = true;
    }

    /** 3. APPLY TO ALL SLOTS **/
    // We apply to 'map' AND 'u_MainTex' AND 'u_ShadeTex' to ensure 
    // the old "shaded" version of the texture is also overwritten.
    mat.map = newTex;

    if (mat.uniforms) {
      if (mat.uniforms.u_MainTex) mat.uniforms.u_MainTex.value = newTex;
      if (mat.uniforms.u_ShadeTex) mat.uniforms.u_ShadeTex.value = newTex;
      // Some VRM versions use 'map' in uniforms
      if (mat.uniforms.map) mat.uniforms.map.value = newTex;
    }

    if (mat.isMToonMaterial && mat.propertyMap) {
      mat.propertyMap.set('u_MainTex', newTex);
      mat.propertyMap.set('u_ShadeTex', newTex);
    }

    /** 4. FORCE RE-COMPILE **/
    mat.transparent = false; // Prevents blending with "ghost" textures
    mat.needsUpdate = true;  // Tells Three.js to re-send this to the GPU

    if (onTextureChange) onTextureChange();
  };

  const handleFile = (e, mInfo) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const newTex = new THREE.Texture(img);
        replaceTexture(mInfo, newTex);
      };
    };
    reader.readAsDataURL(file);
  };

  const getThumb = (tex) => {
    if (!tex || !tex.image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (tex.flipY) { ctx.translate(0, 128); ctx.scale(1, -1); }
    ctx.drawImage(tex.image, 0, 0, 128, 128);
    return canvas.toDataURL();
  };

  return (
    <div style={{ width: '300px', background: '#111', color: '#fff', padding: '15px', height: '100vh', overflowY: 'auto' }}>
      <h3 style={{ fontSize: '14px', borderBottom: '1px solid #333', pb: '10px' }}>REPLACE TEXTURES</h3>
      
      {materials.map((mInfo) => {
        const mat = mInfo.material;
        const isModified = mat.map !== originalsRef.current.get(mat.uuid);
        
        return (
          <div 
            key={mat.uuid} 
            onClick={() => setActiveUuid(mat.uuid)}
            style={{
              padding: '12px', marginBottom: '10px', borderRadius: '8px',
              background: activeUuid === mat.uuid ? '#222' : '#1a1a1a',
              border: activeUuid === mat.uuid ? '1px solid #00ff00' : '1px solid #333',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>{mInfo.materialName}</div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <img 
                src={getThumb(mat.map)} 
                style={{ width: '60px', height: '60px', borderRadius: '4px', border: '1px solid #444', background: '#000' }} 
              />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <button 
                  style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current.onchange = (ev) => handleFile(ev, mInfo);
                    fileInputRef.current.click();
                  }}
                >
                  Overwrite
                </button>
                
                <button 
                  disabled={!isModified}
                  style={{ background: isModified ? '#f44336' : '#444', color: 'white', border: 'none', padding: '5px', borderRadius: '4px', cursor: isModified ? 'pointer' : 'default', fontSize: '11px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    replaceTexture(mInfo, originalsRef.current.get(mat.uuid));
                  }}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        );
      })}
      
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        style={{ display: 'none' }} 
        onClick={(e) => e.target.value = null} 
      />
    </div>
  );
}

// 🆕 NEW COMPONENT: Mesh Visibility Editor
function MeshVisibilityEditor({ meshes, onVisibilityChange }) {
  const toggleVisibility = useCallback((meshItem) => {
    // Toggle the actual THREE.Mesh object's visibility
    meshItem.object.visible = !meshItem.object.visible

    // Trigger a re-render in the parent component
    onVisibilityChange()
  }, [onVisibilityChange])

  return (
    <div style={{ padding: 10, background: '#fafafa', height: '100%', overflow: 'auto' }}>
      <h2 style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '1.2em' }}>👁️ Mesh Visibility</h2>
      <div style={{ maxHeight: 'calc(100vh - 70px)', overflowY: 'auto' }}>
        {meshes.map((mInfo, i) => (
          <div
            key={i}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: 6,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: mInfo.object.visible ? 'white' : '#fdd',
            }}
          >
            <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{mInfo.name}</strong>
            </span>
            <button
              onClick={() => toggleVisibility(mInfo)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: mInfo.object.visible ? '#FF9800' : '#4CAF50',
                color: 'white',
                cursor: 'pointer',
                marginLeft: 10
              }}
            >
              {mInfo.object.visible ? 'Hide' : 'Show'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function BoneHierarchyEditor({ springBones, onUpdate }) {
  const [localSprings, setLocalSprings] = useState(springBones);
  const userData = getGlobalUserData();
  const vrm = userData?.vrm;

  // Helper to update VRM stiffness in real-time
  const handleStiffnessChange = (index, value) => {
    const val = parseFloat(value);
    const updated = [...localSprings];
    updated[index].stiffness = val;
    
    // Update the actual THREE-VRM object reference
    if (updated[index].originalGroup) {
      updated[index].originalGroup.stiffnessForce = val;
    }

    setLocalSprings(updated);
    if (onUpdate) onUpdate();
  };

  // Recursive component to render the skeleton tree
  const BoneTree = ({ node }) => {
    if (!node.isBone && node.type !== 'Object3D' && node.type !== 'Group') return null;
    
    return (
      <details style={{ marginLeft: 15, borderLeft: '1px solid #ddd' }}>
        <summary style={{ cursor: 'pointer', padding: '2px 5px', fontSize: '0.9em' }}>
          🦴 {node.name || 'Unnamed Bone'}
        </summary>
        {node.children.map((child) => (
          <BoneTree key={child.uuid} node={child} />
        ))}
      </details>
    );
  };

  return (
    <div style={{ padding: 10, background: '#fafafa', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* SECTION 1: SPRING BONES (PHYSICS) */}
      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.1em', borderBottom: '2px solid #2196F3' }}>🎾 SpringBone Stiffness</h2>
        <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#fff', borderRadius: 8, padding: 5 }}>
          {localSprings.length === 0 && <p style={{ fontSize: '0.8em', color: '#666' }}>No SpringBones found.</p>}
          {localSprings.map((spring, i) => (
            <div key={i} style={{ marginBottom: 10, padding: 8, border: '1px solid #eee' }}>
              <div style={{ fontSize: '0.8em', fontWeight: 'bold' }}>{spring.comment}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input 
                  type="range" 
                  min="0" 
                  max="4" 
                  step="0.01" 
                  value={spring.stiffness} 
                  onChange={(e) => handleStiffnessChange(i, e.target.value)}
                  style={{ flexGrow: 1 }}
                />
                <span style={{ fontSize: '0.8em', minWidth: '30px' }}>{spring.stiffness.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: BONE HIERARCHY */}
      <section style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.1em', borderBottom: '2px solid #9C27B0' }}>🦴 Skeleton Hierarchy</h2>
        <div style={{ overflowY: 'auto', background: '#fff', borderRadius: 8, padding: 5 }}>
          {vrm ? (
            <BoneTree node={vrm.humanoid.getBoneNode('hips') || vrm.scene} />
          ) : (
            <p>Loading Skeleton...</p>
          )}
        </div>
      </section>
    </div>
  );
}

  useEffect(() => {
    if (!deviceId) return;
    console.log("Device ID (UI):", deviceId);
  }, [deviceId]);

  useEffect(() => {
    const handleScreenshotTaken = (event) => {
      const imageData = event.detail.imageData;
      setScreenshotData(imageData);
    };

    screenshotEventEmitter.addEventListener(
      "screenshotTaken",
      handleScreenshotTaken
    );

    return () => {
      screenshotEventEmitter.removeEventListener(
        "screenshotTaken",
        handleScreenshotTaken
      );
    };
  }, []);

  const getScreenshotBase64 = () =>
    new Promise((resolve) => {
      const handler = (e) => {
        screenshotEventEmitter.removeEventListener("screenshotTaken", handler);
        resolve(e.detail.imageData);
      };
      screenshotEventEmitter.addEventListener("screenshotTaken", handler, {
        once: true,
      });
    });

  const ENABLE_SOCKET = false;

  useEffect(() => {
    if (!ENABLE_SOCKET) return;

    const socket = io("http://localhost:5000", {
      query: {
        user_id: "localuser",
      },
    });

    setSocket(socket);

    socket.on("connect", () => {
      console.log("Connected to socket server.");
    });

    socket.on("server_response", (data) => {
      console.log("Received server response:", data);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const mailbox = (message) => {
      setMessages(prev => [...prev, `${message.from} said: ${message.content}`]);
    };

    console.log("Registering event bus listener for 'user'");
    eventBus.register("user", mailbox);

    return () => {
      eventBus.unregister("user");
    };
  }, []);

  
const handleKeyDown = async (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const trimmed = input;

    // Proceed if there is text OR at least one file
    if (trimmed || selectedFiles.length > 0) {
      
      // 1. Get the Screenshot (Base64)
      const screenshotPromise = getScreenshotBase64();
      screenshotEventEmitter.dispatchEvent(new CustomEvent("requestScreenshot"));
      const base64Image = await screenshotPromise;
      
      // 2. Prepare the Message Object
      const messageToSend = {
        text: trimmed,
        image: base64Image,       // The auto-screenshot
        attachments: selectedFiles, // The array of manual files
        sender: userId,
        conversation_id: selectedConversation,
      };

      // 3. Update UI
      const fileText = selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : "";
      const displayMsg = `User: ${trimmed}${fileText}`;
      
      if (mode === "Global") {
        setGlobalMessages((prev) => [...prev, displayMsg]);
        handleAudioSubmit(trimmed, base64Image, "Global", selectedFiles);
      } else {
        setLocalMessages((prev) => [...prev, displayMsg]);
        handleAudioSubmit(trimmed, base64Image, "Local", selectedFiles);
      }

      // 4. Reset
      setInput("");
      setSelectedFiles([]); // Clear all files
      textareaRef.current?.blur();
    }
  }
};
  

const lipNodeRef = useRef(null);
const audioContextRef = useRef(null);
const mediaStreamRef = useRef(null);
const audioElementRef = useRef(null);
// Use a ref or state to store the analyser if you need access to it later,
// or make it a global 'let' if you prefer to mimic the original structure's intent for shared variables.
// For this fix, I'll move 'source' and 'analyser' management to prevent the error.

// We will use a ref for the analyser to make it accessible across functions
const analyserRef = useRef(null);

const startlipsync = async () => {
  // ❌ REMOVE local 'let source;' here as it causes a problem when source.connect is called
  let stream; // Still here, though unused in the snippet

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioContextRef.current = audioContext;

  const profileResponse = await fetch("/profile.json");
  if (!profileResponse.ok) throw new Error("Failed to load profile.json"); // FIX: Missing quotes around string literal
  const profile = await profileResponse.json();

  const lipNode = await createWLipSyncNode(audioContext, profile);
  lipNodeRef.current = lipNode;

  // ❌ REMOVED: source.connect(lipNode); // 'source' is undefined here, causing the error.

  // Create the analyser node once and store it in a ref
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  // const dataArray = new Uint8Array(analyser.frequencyBinCount); // dataArray is local and unused outside this scope
  analyserRef.current = analyser;

  // ❌ REMOVED: source.connect(analyser); // 'source' is undefined here, causing the error.
};

useEffect(() => {
  startlipsync();
}, []);

// Add this ref at the top of your component
const activeAudioRef = useRef(null);
const stopSinging = () => {
    if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = ""; // Clear source to stop buffering
        activeAudioRef.current = null;
    }
    visemeWeightsRef.current = { A: 0, E: 0, I: 0, O: 0, U: 0 };
    setIsSinging(false);
    setCurrentTrack("");
};

const playAudioWithGlobalLipSync = async (audioUrl) => {
    try {
        stopSinging(); // Clear previous state
        console.log("Playing audio with lip sync: ", audioUrl);
        const audio = new Audio();
        audio.src = audioUrl;
        audio.crossOrigin = "anonymous";
        activeAudioRef.current = audio;

        // 1. Prepare AudioContext early
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 2. IMPORTANT: Resume context (browsers block audio until this is called)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // 3. Load LipSync and Setup Nodes BEFORE playing
        const profileResponse = await fetch("/profile.json");
        const profile = await profileResponse.json();
        const lipNode = await createWLipSyncNode(audioContext, profile);
        const source = audioContext.createMediaElementSource(audio);

        // Connect the graph
        source.connect(lipNode);
        source.connect(audioContext.destination);

        const playbackPromise = new Promise((resolve) => {
            audio.onended = () => {
                stopSinging();
                resolve();
            };
            audio.onerror = (e) => {
                console.error("Audio Object Error:", e);
                stopSinging();
                resolve();
            };
        });

        // 4. Finally, start the audio
        await audio.play();

        const syncLoop = () => {
            if (activeAudioRef.current === audio && !audio.paused && lipNode.weights) {
                visemeWeightsRef.current = lipNode.weights;
                requestAnimationFrame(syncLoop);
            }
        };
        syncLoop();

        await playbackPromise;

    } catch (err) {
        console.error("LipSync Playback Fatal Error:", err);
        stopSinging();
    }
};

const handleAudioSubmit = async (message, base64Image, mode, selectedFiles) => {
    setLoading(true);
    let chunkJobQueue = [];
    let isStreaming = true;
    let currentChunkIndex = 0;

    console.log("Broadcasting user message: ", message, deviceId);
    eventBus.broadcast("user", message);

    try {
       /*
        const response = await fetch(`${BACKEND_URL}/stream_and_chunk_tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message, device_id: deviceId, base64_image: base64Image })
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      */
        
        const formData = new FormData();
        formData.append('text', message);
        formData.append('device_id', deviceId);
        formData.append('base64_image', base64Image); // Still a string

        // Add multiple files
        selectedFiles.forEach((file) => {
            formData.append('files', file); 
        });

        const response = await fetch(`${BACKEND_URL}/stream_and_chunk_tts`, {
            method: 'POST',
            // HEADERS REMOVED - Browser handles this automatically
            body: formData 
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';

        const processTextStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) { isStreaming = false; break; }

                streamBuffer += decoder.decode(value, { stream: true });
                const messages = streamBuffer.split('\n\n');
                streamBuffer = messages.pop();

                for (const message of messages) {
                    if (!message.startsWith('data:')) continue;
                    const data = message.substring(5);

                    if (data.startsWith("FULL_RESPONSE|")) {
                        const fullText = data.substring(14);
                        if (mode === "Global") setGlobalMessages(prev => [...prev, "AI Response: " + fullText]);
                        else setLocalMessages(prev => [...prev, "AI Response: " + fullText]);
                    } else if (data === "END_OF_STREAM") {
                        isStreaming = false;
                    } else if (data.startsWith("ERROR|")) {
                        console.error("LLM Streaming Error:", data.substring(6));
                        alert("LLM Streaming Error: " + data.substring(6));
                        reader.cancel();
                        break;
                    } else {
                        // Queue TTS chunks
                        const [job_id, generated_text] = data.split('|');
                        chunkJobQueue.push({ job_id, generated_text });
                        if (chunkJobQueue.length === 1 && currentChunkIndex === 0) playbackLoop();
                    }
                }
            }
        };

        processTextStream();

        const playbackLoop = async () => {
            if (currentChunkIndex >= chunkJobQueue.length && !isStreaming) {
                setLoading(false); 
                return;
            }
            if (currentChunkIndex >= chunkJobQueue.length) {
                await new Promise(r => setTimeout(r, 200));
                requestAnimationFrame(playbackLoop);
                return;
            }

            const { job_id, generated_text } = chunkJobQueue[currentChunkIndex];

            try {
                let audioUrl = null;
                while (true) {
                    const statusRes = await fetch(`${BACKEND_URL}/get_tts/${job_id}`);
                    if (!statusRes.ok) throw new Error("Error fetching chunk status");

                    const contentType = statusRes.headers.get("Content-Type");
                    if (contentType.includes("application/json")) {
                        const data = await statusRes.json();
                        if (data.status === "done") { audioUrl = `${BACKEND_URL}/get_tts/${job_id}`; break; }
                        else if (data.status === "error") throw new Error("TTS chunk generation error: " + data.message);
                    } else { audioUrl = `${BACKEND_URL}/get_tts/${job_id}`; break; }

                    await new Promise(r => setTimeout(r, 500));
                }

                const audio = new Audio(audioUrl);
                audio.crossOrigin = "anonymous";

                await new Promise(resolve => {
                    audio.onended = () => { 
                        visemeWeightsRef.current = { A:0,E:0,I:0,O:0,U:0 };
                        currentChunkIndex++;
                        resolve(); 
                    };

                    audio.play().then(async () => {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        audioContextRef.current = audioContext;
                        const profileResponse = await fetch("/profile.json");
                        const profile = await profileResponse.json();
                        const lipNode = await createWLipSyncNode(audioContext, profile);
                        lipNodeRef.current = lipNode;
                        const source = audioContext.createMediaElementSource(audio);
                        source.connect(lipNode);
                        source.connect(audioContext.destination);

                        const logLoop = () => {
                            if (!audio.paused && lipNodeRef.current?.weights) {
                                visemeWeightsRef.current = lipNodeRef.current.weights;
                                requestAnimationFrame(logLoop);
                            }
                        };
                        logLoop();
                    }).catch(err => { console.error(err); resolve(); });
                });

                requestAnimationFrame(playbackLoop);
            } catch (err) {
                console.error("Chunk playback error:", err);
                alert("TTS chunk error: " + err.message);
                isStreaming = false; 
                setLoading(false);
            }
        };

    } catch (err) {
        alert("Fatal submission error: " + err.message);
        setLoading(false);
    }
};

  const toggleMode = () => {
    setMode((prev) => (prev === "Global" ? "Local" : "Global"));
  };

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === "/") {
        e.preventDefault();
        setVisible(true);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [globalMessages, localMessages, mode]);

  const messagesToRender = mode === "Global" ? globalMessages : localMessages;

  // Fullscreen logic
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullScreen(true);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullScreen(false);
        });
      }
    }
  };
  
  
// Memoize heavy editors to prevent re-renders when chat or other state updates
const MemoizedTextureEditor = React.memo(({ materials, onTextureChange, updateKey }) => (
  <TextureEditor
    key={'tex-' + updateKey}
    materials={materials}
    onTextureChange={onTextureChange}
  />
));

const MemoizedMeshVisibilityEditor = React.memo(({ meshes, onVisibilityChange, updateKey }) => (
  <MeshVisibilityEditor
    key={'mesh-' + updateKey}
    meshes={meshes}
    onVisibilityChange={onVisibilityChange}
  />
));

const MemoizedSpringBoneEditor = React.memo(({ springBones, onSpringBoneChange, updateKey }) => (
  <BoneHierarchyEditor
    key={'spring-' + updateKey}
    springBones={springBones}
    onSpringBoneChange={onSpringBoneChange}
  />
));
// 1. FastPanel with strict width/height guardrails
const FastPanel = ({ isOpen, children }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4 md:p-10">
      {/* High-Transparency Glass Overlay */}
      <div className="absolute inset-0 bg-black/5 backdrop-blur-md transition-opacity duration-500" />

      {/* Main Panel: Strict constraints on both axes */}
      <div
        className="relative w-full max-w-[95vw] xl:max-w-6xl max-h-[90vh] pointer-events-auto flex flex-col transition-all duration-300 ease-out"
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

// 2. Component Return
const handlePianoToggle = () => {
  const newState = !pianoOpen;
  setPianoOpen(newState);
  if (setPianoStateOpen) setPianoStateOpen(newState);
};

// --- ATOMIC CHAT COMPONENT ---
const ChatInterface = React.memo(({ 
  mode, 
  messagesToRender, 
  visible, 
  onSend, 
  selectedFiles = [],      
  onFileChange,       
  onRemoveFile        
}) => {
  const [localInput, setLocalInput] = useState("");
  const inputRef = useRef(null);
  const chatScrollRef = useRef(null);

  // 1. Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messagesToRender]);

  // 2. Roblox-style "/" Global Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // If pressing "/" and not already typing in an input
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault(); // Stop "/" from being typed
        inputRef.current?.focus();
      }
      // Press Escape to blur
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleInnerKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (localInput.trim() || selectedFiles.length > 0) {
        onSend(localInput);
        setLocalInput("");
      }
    }
  };

  if (!visible) return null;

  return (
    <div className="flex flex-col h-[30vh] max-h-[35vh] bg-[#121212]/70 border border-white/10 rounded-lg p-2 justify-between shadow-2xl transition-all duration-300">
      
      {/* Messages Area */}
      <div 
        ref={chatScrollRef} 
        className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10"
      >
        {messagesToRender.map((msg, i) => (
          <div key={i} className="text-gray-100 text-xs md:text-sm p-2 bg-black/40 rounded border border-white/5 w-fit max-w-[95%] break-words">
            <span className="text-pink-400/80 font-bold mr-2 text-[10px] uppercase tracking-tighter">
              {mode}
            </span>
            {msg}
          </div>
        ))}
      </div>

      {/* File Preview Strip */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-black/30 rounded-md mb-2 mt-2 border border-white/5">
          {selectedFiles.map((file, idx) => (
            <div key={idx} className="relative group bg-white/10 p-1 px-2 rounded border border-white/10 text-[10px] text-white flex items-center gap-2">
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button 
                onClick={() => onRemoveFile(idx)}
                className="hover:text-red-400 text-gray-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Input Area */}
      <div className="flex items-end gap-2 border-t border-white/10 pt-2 mt-1">
        <label className="mb-1 cursor-pointer hover:bg-white/10 p-2 rounded-full transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <input 
            type="file" 
            className="hidden" 
            multiple 
            onChange={onFileChange} 
          />
        </label>

        <textarea
          ref={inputRef}
          className="flex-grow h-10 resize-none bg-transparent outline-none text-white text-sm md:text-base placeholder-gray-600 py-2"
          placeholder="Press [/] to chat..."
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          onKeyDown={handleInnerKeyDown}
          // This covers clicking in, tabbing in, or the "/" shortcut
          onFocus={() => setGlobalIsChatting(true)}
          // This covers clicking away, pressing Escape (if it blurs), or tabbing out
          onBlur={() => setGlobalIsChatting(false)}
        />
      </div>
    </div>
  );
});

// --- 2. MAIN COMPONENT LOGIC ---

// Inside your main UI component function:

// File Handlers
const handleFileChange = useCallback((e) => {
  if (e.target.files) {
    const newFiles = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  }
}, [setSelectedFiles]);

const removeFile = useCallback((index) => {
  setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
}, [setSelectedFiles]);

// Main Send Logic
const handleSendMessage = useCallback(async (textValue) => {
  if (textValue.trim() || selectedFiles.length > 0) {
    const screenshotPromise = getScreenshotBase64();
    screenshotEventEmitter.dispatchEvent(new CustomEvent("requestScreenshot"));
    const base64Image = await screenshotPromise;
    //base64Image = "";
    const fileText = selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : "";
    const displayMsg = `User: ${textValue}${fileText}`;
    
    if (mode === "Global") {
      setGlobalMessages((prev) => [...prev, displayMsg]);
      handleAudioSubmit(textValue, base64Image, "Global", selectedFiles);
    } else {
      setLocalMessages((prev) => [...prev, displayMsg]);
      handleAudioSubmit(textValue, base64Image, "Local", selectedFiles);
    }

    setSelectedFiles([]); // Resets files in parent
    if (setInput) setInput(""); 
  }
}, [selectedFiles, mode, setGlobalMessages, setLocalMessages, setInput, setSelectedFiles]);

// --- 3. RETURN STATEMENT ---

return (
  <section className="fixed inset-0 z-10 pointer-events-none font-sans overflow-hidden">
    <div className="absolute top-4 left-4 w-72 md:w-96 lg:max-w-[20vw] xl:max-w-[20vw] pointer-events-auto shadow-2xl">
      
      {/* Navbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl text-gray-200 text-xs font-bold rounded-t-lg border border-white/10">
        <div className="flex items-center gap-2">
          <FiMessageSquare className="text-base text-blue-400" />
          <span className="tracking-tighter uppercase">CHAT</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMode} className="px-2 py-0.5 text-[9px] bg-white/10 border border-white/10 rounded hover:bg-white/20 uppercase tracking-widest transition-all">
            {mode}
          </button>
          <button onClick={toggleFullScreen} className="text-gray-400 hover:text-white transition-colors">
            <FiMaximize className="text-sm" />
          </button>
          <button onClick={() => setVisible(!visible)} className="text-gray-400 hover:text-white transition-colors">
            {visible ? <FiChevronUp className="text-lg" /> : <FiChevronDown className="text-lg" />}
          </button>
        </div>
      </div>

      {/* The Unified Chat UI */}
      <ChatInterface 
        visible={visible}
        mode={mode}
        messagesToRender={messagesToRender}
        chatRef={chatRef}
        selectedFiles={selectedFiles}
        onFileChange={handleFileChange}
        onRemoveFile={removeFile}
        onSend={handleSendMessage}
      />
    </div>

    {/* Navigation Menu */}
    <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col gap-4 pointer-events-none">
      {[
        { label: 'Scheduler', open: schedulerOpen, set: setSchedulerOpen, content: <ScheduleTimeLine deviceId={deviceId} /> },
        { label: 'Catalog', open: catalogOpen, set: setCatalogOpen, content: <Catalog /> },
        { label: 'Character Editor', open: charEditorOpen, set: setCharEditorOpen, content: <PersonalityChanger deviceId={deviceId} /> },
        { label: 'Piano', open: pianoOpen, set: handlePianoToggle, content: <PianoUI /> },
      ].map((item) => (
        <React.Fragment key={item.label}>
          <button
            onClick={() => item.set(!item.open)}
            className={`pointer-events-auto px-6 py-3 rounded-full border transition-all text-[10px] font-bold uppercase tracking-widest w-48 text-left flex justify-between items-center group ${
              item.open ? 'bg-white text-black border-white scale-110 shadow-2xl' : 'bg-black/20 text-white/50 border-white/10 hover:border-white/40 hover:text-white'
            }`}
          >
            {item.label}
            <span className={`transition-transform duration-300 ${item.open ? 'rotate-90' : 'group-hover:translate-x-1'}`}>→</span>
          </button>

          {/* Centered Spawning Panel with Horizontal and Vertical Protection */}
          <FastPanel isOpen={item.open}>
            <div className="w-full flex flex-col bg-black/40 backdrop-blur-3xl border border-white/20 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] text-white overflow-hidden">
              {/* Panel Header */}
              <div className="flex justify-between items-center px-10 py-8 border-b border-white/10">
                <h3 className="text-2xl font-thin tracking-[0.2em] uppercase">{item.label}</h3>
                <button onClick={() => item.set(false)} className="text-white/20 hover:text-red-500 text-4xl font-thin transition-all hover:rotate-90">✕</button>
              </div>
              
              {/* Internal Content: Forces scroll if content is wider OR taller than the glass panel */}
              <div className="p-10 overflow-auto custom-scrollbar">
                 <div className="min-w-full inline-block">
                    {item.content}
                 </div>
              </div>
            </div>
          </FastPanel>
        </React.Fragment>
      ))}

      <button
        onClick={() => setMaterialEditorOpen(!materialEditorOpen)}
        className={`pointer-events-auto px-6 py-3 rounded-full border transition-all text-[10px] font-bold uppercase tracking-widest w-48 text-left ${
          materialEditorOpen ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]' : 'bg-black/20 text-white/50 border-white/10'
        }`}
      >
        Material Editor
      </button>
    </div>

    {/* Material Sidebar */}
    <div 
      className={`fixed top-0 right-0 h-screen w-[28vw] min-w-[350px] bg-black/40 backdrop-blur-3xl border-l border-white/10 z-[500] transition-transform duration-1000 cubic-bezier(0.4, 0, 0.2, 1) ${materialEditorOpen ? 'translate-x-0' : 'translate-x-full'}`}
      style={{ pointerEvents: materialEditorOpen ? 'auto' : 'none' }}
    >
      <div className="p-10 border-b border-white/10 flex justify-between items-center">
        <h2 className="font-thin text-white tracking-[0.3em] text-xl uppercase">Refraction_Engine</h2>
        <button onClick={() => setMaterialEditorOpen(false)} className="text-white/20 hover:text-white text-5xl font-thin">×</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar h-[calc(100vh-140px)]">
        <MemoizedTextureEditor updateKey={updateKey} materials={materials} onTextureChange={handleUpdate} />
        <div className="my-12 border-t border-white/5" />
        <MemoizedMeshVisibilityEditor updateKey={updateKey} meshes={meshes} onVisibilityChange={handleUpdate} />
        <div className="my-12 border-t border-white/5" />
        <MemoizedSpringBoneEditor updateKey={updateKey} springBones={springBones} onSpringBoneChange={handleUpdate} />
      </div>
    </div>

    {/* Version Info */}
    <div className="absolute bottom-6 right-8 text-[9px] font-mono text-white/20 uppercase tracking-widest">
      Core_Render_v2.6 // Active_Session
    </div>

    {/* Singing / Audio Upload Tool */}
    <div className="absolute top-4 right-4 flex flex-col items-end gap-3 pointer-events-auto">
      <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-lg p-1 shadow-2xl overflow-hidden min-w-[200px]">
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em]">Vocal_Processor</span>
          {isSinging && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* Upload/Start Button */}
          {!isSinging ? (
            <>
              <input
                type="file"
                accept="audio/mp3,audio/wav"
                id="vocal-upload"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setCurrentTrack(file.name);
                    setIsSinging(true);
                    const url = URL.createObjectURL(file);
                    await playAudioWithGlobalLipSync(url);
                  }
                }}
              />
              <label
                htmlFor="vocal-upload"
                className="flex items-center justify-center gap-3 py-2 px-4 bg-white/5 border border-white/10 rounded hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group"
              >
                <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Load MP3</span>
                <span className="text-gray-500 group-hover:text-white transition-colors">↑</span>
              </label>
            </>
          ) : (
            /* Active Playing State */
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                <span className="text-[8px] text-white/30 uppercase tracking-tighter">Current Track</span>
                <span className="text-[10px] text-white truncate max-w-[180px] font-mono italic">
                  {currentTrack}
                </span>
              </div>
              
              <button
                onClick={stopSinging}
                className="w-full py-2 bg-red-500/10 border border-red-500/50 text-red-500 text-[9px] font-bold uppercase tracking-[0.3em] hover:bg-red-500 hover:text-white transition-all rounded"
              >
                Abort_Playback
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Visualizer Hint (Optional) */}
      {isSinging && (
        <div className="flex gap-1 h-4 items-end px-2">
          {[...Array(8)].map((_, i) => (
            <div 
              key={i} 
              className="w-1 bg-blue-500/50 rounded-full animate-bounce" 
              style={{ animationDuration: `${0.5 + Math.random()}s`, height: `${Math.random() * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  </section>
);
}