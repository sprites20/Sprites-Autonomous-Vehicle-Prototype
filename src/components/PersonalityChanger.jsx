import React, { useState, useRef, useEffect } from "react";

// Define the number of characters to show per page
const CHARACTERS_PER_PAGE = 4;

// Define predefined personalities with their associated voices
const predefinedCharacters = [
  {
    id: "sassy",
    name: "Sassy Genius",
    personalityPrompt: "You are a witty, sarcastic assistant who always gives brutally honest but clever answers.",
    voiceId: "Kore",
  },
  {
    id: "therapist",
    name: "Wholesome Therapist",
    personalityPrompt: "You are a calm, validating emotional support AI who listens and gently guides.",
    voiceId: "Puck",
  },
  {
    id: "tsundere",
    name: "Tsundere Senpai",
    personalityPrompt: "You act cold and dismissive but care deeply. Classic tsundere persona.",
    voiceId: "Charon",
  },
  {
    id: "hacker",
    name: "Cyberpunk Hacker",
    personalityPrompt: "You are a rogue AI from the future, cryptic and mysterious, helping users navigate the digital shadows.",
    voiceId: "Zephyr",
  },
  {
    id: "sage",
    name: "Ancient Sage",
    personalityPrompt: "You speak in poetic riddles and ancient wisdom. A timeless philosopher AI.",
    voiceId: "Fenrir",
  },
  {
    id: "chaotic",
    name: "Chaotic Best Friend",
    personalityPrompt: "You are an unpredictable, hyper, loyal friend who thrives on chaos and fun.",
    voiceId: "Leda",
  },
  {
    id: "scientist",
    name: "Brilliant Scientist",
    personalityPrompt: "You are a highly intelligent scientist who explains complex concepts with precision and clarity.",
    voiceId: "Orus",
  },
  {
    id: "poet",
    name: "Romantic Poet",
    personalityPrompt: "You speak in elegant, romantic prose, finding beauty in every moment.",
    voiceId: "Aoede",
  },
];

// Define predefined voices based on TTS API options
const predefinedVoices = [
  { id: "Kore", name: "Kore (Firm)" },
  { id: "Puck", name: "Puck (Upbeat)" },
  { id: "Charon", name: "Charon (Informative)" },
  { id: "Zephyr", name: "Zephyr (Bright)" },
  { id: "Fenrir", name: "Fenrir (Excitable)" },
  { id: "Leda", name: "Leda (Youthful)" },
  { id: "Orus", name: "Orus (Firm)" },
  { id: "Aoede", name: "Aoede (Breezy)" },
  { id: "Callirrhoe", name: "Callirrhoe (Easy-going)" },
  { id: "Autonoe", name: "Autonoe (Bright)" },
  { id: "Enceladus", name: "Enceladus (Breathy)" },
  { id: "Iapetus", name: "Iapetus (Clear)" },
  { id: "Umbriel", name: "Umbriel (Easy-going)" },
  { id: "Algieba", name: "Algieba (Smooth)" },
  { id: "Despina", name: "Despina (Smooth)" },
  { id: "Erinome", name: "Erinome (Clear)" },
  { id: "Algenib", name: "Algenib (Gravelly)" },
  { id: "Rasalgethi", name: "Rasalgethi (Informative)" },
  { id: "Laomedeia", name: "Laomedeia (Upbeat)" },
  { id: "Achernar", name: "Achernar (Soft)" },
  { id: "Alnilam", name: "Alnilam (Firm)" },
  { id: "Schedar", name: "Schedar (Even)" },
  { id: "Gacrux", name: "Gacrux (Mature)" },
  { id: "Pulcherrima", name: "Pulcherrima (Forward)" },
  { id: "Achird", name: "Achird (Friendly)" },
  { id: "Zubenelgenubi", name: "Zubenelgenubi (Casual)" },
  { id: "Vindemiatrix", name: "Vindemiatrix (Gentle)" },
  { id: "Sadachbia", name: "Sadachbia (Lively)" },
  { id: "Sadaltager", name: "Sadaltager (Knowledgeable)" },
  { id: "Sulafat", name: "Sulafat (Warm)" },
];

/**
 * Main App component to render the Custom AI Creator.
 * It now features a paginated character selection UI with custom character creation.
 */
export function PersonalityChanger() {
  const [characters, setCharacters] = useState(predefinedCharacters);
  const [highlightedCharacterId, setHighlightedCharacterId] = useState(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [customName, setCustomName] = useState("");
  const [customPersonalityPrompt, setCustomPersonalityPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Kore");
  const [customVoiceFile, setCustomVoiceFile] = useState(null);
  const [enabledTools, setEnabledTools] = useState({ websearch: false, scheduler: false, fileReader: false });
  const [dragActiveVoice, setDragActiveVoice] = useState(false);
  const [dragActiveMemory, setDragActiveMemory] = useState(false);
  const [memoryFiles, setMemoryFiles] = useState([]);
  const voiceFileInputRef = useRef(null);
  const memoryFileInputRef = useRef(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);

  // Update states for the form when a character is highlighted
  useEffect(() => {
    if (highlightedCharacterId) {
      const character = characters.find(c => c.id === highlightedCharacterId);
      if (character) {
        setCustomName(character.name);
        setCustomPersonalityPrompt(character.personalityPrompt);
        setSelectedVoice(character.voiceId);
        setCustomVoiceFile(null); // Clear custom voice file
        setMemoryFiles([]); // Clear user uploaded memory files
        setEnabledTools({ websearch: false, scheduler: false, fileReader: false }); // Reset tools
      }
    }
  }, [highlightedCharacterId, characters]);

  // --- Helper functions for file handling ---
  const onVoiceFileChosen = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setCustomVoiceFile(fileList[0]);
  };
  
  const mergeFiles = (files, currentFiles, setFiles) => {
    const existing = new Map(currentFiles.map(f => [f.name + ":" + f.size, f]));
    for (const f of files) existing.set(f.name + ":" + f.size, f);
    setFiles(Array.from(existing.values()));
  };

  const onMemoryFilesChosen = (fileList) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    mergeFiles(files, memoryFiles, setMemoryFiles);
  };
  
  const removeMemoryFile = (name, size) => {
    setMemoryFiles(prev => prev.filter(f => !(f.name === name && f.size === size)));
  };

  const removeCustomVoiceFile = () => {
    setCustomVoiceFile(null);
    setSelectedVoice(characters.find(c => c.id === highlightedCharacterId)?.voiceId || "Kore");
  };

  // --- Drag & Drop Handlers for Voice ---
  const handleDragOverVoice = (e) => { e.preventDefault(); e.stopPropagation(); if (!dragActiveVoice) setDragActiveVoice(true); };
  const handleDragLeaveVoice = (e) => { e.preventDefault(); e.stopPropagation(); setDragActiveVoice(false); };
  const handleDropVoice = (e) => { e.preventDefault(); e.stopPropagation(); setDragActiveVoice(false); const dt = e.dataTransfer; if (dt?.files?.length) onVoiceFileChosen(dt.files); };
  const openVoiceFilePicker = () => voiceFileInputRef.current?.click();

  // --- Drag & Drop Handlers for Memories ---
  const handleDragOverMemory = (e) => { e.preventDefault(); e.stopPropagation(); if (!dragActiveMemory) setDragActiveMemory(true); };
  const handleDragLeaveMemory = (e) => { e.preventDefault(); e.stopPropagation(); setDragActiveMemory(false); };
  const handleDropMemory = (e) => { e.preventDefault(); e.stopPropagation(); setDragActiveMemory(false); const dt = e.dataTransfer; if (dt?.files?.length) onMemoryFilesChosen(dt.files); };
  const openMemoryFilePicker = () => memoryFileInputRef.current?.click();

  // Toggles the state of an enabled tool
  const toggleTool = (tool) => setEnabledTools(prev => ({ ...prev, [tool]: !prev[tool] }));

  // Handlers for managing custom characters
  const handleAddCharacter = () => {
    const newCharacterId = `custom-${Date.now()}`;
    const newCharacter = {
      id: newCharacterId,
      name: "New AI Character",
      personalityPrompt: "Enter your custom AI personality prompt here.",
      voiceId: "Kore",
      isCustom: true
    };
    setCharacters(prev => [...prev, newCharacter]);
    setHighlightedCharacterId(newCharacterId);
    setSelectedCharacterId(null);
  };
  
  // Gets the payload for character creation and update
  const getPayload = (method) => {
    const characterToActOn = characters.find(c => c.id === selectedCharacterId);
    if (!characterToActOn) return null;
  
    const systemPrompt = characterToActOn.isCustom ? customPersonalityPrompt : characterToActOn.personalityPrompt;
    
    let voiceConfig = {};
    if (selectedVoice === "custom") {
      if (customVoiceFile) {
        voiceConfig = {
          type: "custom",
          file: {
            name: customVoiceFile.name,
            size: customVoiceFile.size,
            type: customVoiceFile.type
          }
        };
      } else {
        voiceConfig = { type: "none" };
      }
    } else {
      voiceConfig = { type: "predefined", name: selectedVoice };
    }
    
    const deviceId = "placeholder-device-id"; // Placeholder for device ID

    return {
      name: characterToActOn.isCustom ? customName : characterToActOn.name,
      personaId: selectedCharacterId,
      systemPrompt: systemPrompt,
      voice: voiceConfig,
      tools: Object.entries(enabledTools).filter(([, v]) => v).map(([k]) => k),
      memories: memoryFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
      deviceId: deviceId
    };
  };

  const handleCreate = async () => {
    const payload = getPayload("POST");
    if (!payload) return;

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));

    memoryFiles.forEach(file => {
      formData.append("memories", file);
    });

    if (selectedVoice === "custom" && customVoiceFile) {
      formData.append("voice", customVoiceFile);
    }

    try {
      const response = await fetch("http://localhost:5010/upload", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        console.log("Creation successful!");
      } else {
        console.error("Creation failed");
      }
    } catch (err) {
      console.error("Error creating character:", err);
    }
  };

  const handleUpdate = async () => {
    const characterToActOn = characters.find(c => c.id === selectedCharacterId);
    if (!characterToActOn) return;
  
    const payload = getPayload("PUT");
    if (!payload) return;

    // Update local state first for immediate UI feedback
    setCharacters(prev => prev.map(char => {
      if (char.id === selectedCharacterId) {
        return {
          ...char,
          name: customName,
          personalityPrompt: customPersonalityPrompt,
          voiceId: selectedVoice,
        };
      }
      return char;
    }));
  
    // Now make the mock server call
    try {
      const response = await fetch(`http://localhost:5010/characters/${selectedCharacterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      });
  
      if (response.ok) {
        console.log("Update successful!");
      } else {
        console.error("Update failed");
      }
    } catch (err) {
      console.error("Error updating character:", err);
    }
  };
  
  const handleDelete = async () => {
    const characterToActOn = characters.find(c => c.id === selectedCharacterId);
    if (!characterToActOn || !characterToActOn.isCustom) return;

    // Remove from local state
    setCharacters(prev => prev.filter(c => c.id !== selectedCharacterId));
    setSelectedCharacterId(null);
    setHighlightedCharacterId(null);
  
    // Now make the mock server call
    try {
      const response = await fetch(`http://localhost:5010/characters/${selectedCharacterId}`, {
        method: "DELETE",
      });
  
      if (response.ok) {
        console.log("Deletion successful!");
      } else {
        console.error("Deletion failed");
      }
    } catch (err) {
      console.error("Error deleting character:", err);
    }
  };
  
  const selectedCharacter = characters.find(c => c.id === selectedCharacterId);
  const highlightedCharacter = characters.find(c => c.id === highlightedCharacterId);

  // Pagination Logic
  const startIndex = currentPage * CHARACTERS_PER_PAGE;
  const endIndex = startIndex + CHARACTERS_PER_PAGE;
  const charactersOnPage = characters.slice(startIndex, endIndex);
  const totalPages = Math.ceil((characters.length + 1) / CHARACTERS_PER_PAGE);

  return (
    <div className="min-h-screen flex items-start justify-center p-4 sm:p-6 font-sans overflow-y-auto ">
      <div className="bg-white/40 backdrop-blur-md shadow-lg rounded-xl w-full max-w-4xl p-6 border border-gray-200 h-[90vh] overflow-y-auto ">
        
        {/* Selected Character Banner */}
        {selectedCharacter && (
          <div className="bg-blue-100 text-blue-800 font-bold text-center py-3 px-6 rounded-lg text-xl mb-4">
            Currently Selected: {selectedCharacter.name}
          </div>
        )}

        {/* Card Header */}
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-6">Select or Create a Character</h2>
        
        {/* Character Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 overflow-y-auto">
          {charactersOnPage.map(char => (
            <div
              key={char.id}
              onClick={() => setHighlightedCharacterId(char.id)}
              className={`
                flex flex-col items-center justify-between p-6 border-2 rounded-xl cursor-pointer
                transform transition-all duration-300 ease-in-out relative
                ${highlightedCharacterId === char.id ? "border-blue-500 ring-4 ring-blue-200 shadow-xl scale-105" : "border-gray-300 hover:border-blue-300 hover:shadow-lg"}
              `}
            >
              <div className="flex-grow flex items-center justify-center">
                <p className="text-xl font-bold text-center text-gray-900">{char.name}</p>
              </div>
            </div>
          ))}
          {/* Add New Character Card */}
          <button
            onClick={handleAddCharacter}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-400 rounded-xl cursor-pointer text-gray-600
            transform transition-all duration-300 ease-in-out hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xl font-bold">Add New Character</span>
          </button>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex justify-center items-center space-x-4 mt-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 0))}
            disabled={currentPage === 0}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm font-semibold text-gray-700">Page {currentPage + 1} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages - 1))}
            disabled={currentPage >= totalPages - 1}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-colors"
          >
            Next
          </button>
        </div>

        {/* --- SCROLLABLE CONTAINER FOR FORM --- */}
        {/* This div has a fixed max height and an `overflow-y-auto` to create the scrollable frame. */}
        {highlightedCharacter && (
          <div className="mt-8 space-y-6 animate-fade-in-up pr-2 overflow-y-auto">
            <h3 className="text-2xl font-bold text-center text-gray-800">Current Profile: {highlightedCharacter.name}</h3>
            <hr className="border-gray-300" />
            
            {/* AI Name Section */}
            <div className="space-y-2">
              <label htmlFor="ai-name" className="block text-lg font-semibold text-gray-700">AI Name</label>
              <input
                id="ai-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My AI Buddy"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200 ease-in-out text-base"
              />
            </div>

            {/* Personality Section */}
            <div className="space-y-2">
              <label htmlFor="personality-prompt" className="block text-lg font-semibold text-gray-700">Personality Prompt</label>
              <textarea
                id="personality-prompt"
                value={customPersonalityPrompt}
                onChange={(e) => setCustomPersonalityPrompt(e.target.value)}
                placeholder="Enter your custom AI personality prompt here (e.g., 'You are a pirate who speaks in riddles and loves treasure.')."
                rows="4"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200 ease-in-out text-base"
              ></textarea>
            </div>
            
            {/* Voice Section */}
            <div className="space-y-2">
              <label htmlFor="voice-select" className="block text-lg font-semibold text-gray-700">AI Voice</label>
              <div className="relative">
                <select
                  id="voice-select"
                  value={selectedVoice}
                  onChange={(e) => {
                    setSelectedVoice(e.target.value);
                    if (e.target.value !== "custom") {
                      setCustomVoiceFile(null);
                    }
                  }}
                  className="bg-white/20 backdrop-blur-md shadow-lg rounded-xl block appearance-none w-full bg-white border border-gray-300 text-gray-800 py-3 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out text-base"
                >
                  {predefinedVoices.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                  <option value="custom">Custom Voice (Upload File)</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>

              {selectedVoice === "custom" && (
                <div className="mt-4">
                  <div
                    onDragOver={handleDragOverVoice}
                    onDragEnter={handleDragOverVoice}
                    onDragLeave={handleDragLeaveVoice}
                    onDrop={handleDropVoice}
                    onClick={openVoiceFilePicker}
                    className={`w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ease-in-out ${dragActiveVoice ? "border-blue-500 bg-blue-50 hover:bg-blue-100" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
                  >
                    <input type="file" ref={voiceFileInputRef} className="hidden" onChange={(e) => onVoiceFileChosen(e.target.files)} accept="audio/*" />
                    <div className="space-y-1">
                      <p className="font-medium text-gray-700 text-lg">Drop your custom voice file here</p>
                      <p className="text-sm text-gray-500">or click to browse • .wav .mp3 .ogg etc.</p>
                    </div>
                  </div>
                  {customVoiceFile && (
                    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white mt-4">
                      <li key={customVoiceFile.name + customVoiceFile.size} className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-base font-medium text-gray-800">{customVoiceFile.name}</p>
                          <p className="text-xs text-gray-500">{(customVoiceFile.size / 1024).toFixed(1)} KB • {customVoiceFile.type || "unknown"}</p>
                        </div>
                        <button
                          onClick={removeCustomVoiceFile}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition duration-200 ease-in-out"
                        >Remove</button>
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </div>
            
            {/* Drag & Drop Memory Zone */}
            <div className="space-y-2 ">
              <label className="block text-lg font-semibold text-gray-700">Memories (uploaded files)</label>
              <div
                onDragOver={handleDragOverMemory}
                onDragEnter={handleDragOverMemory}
                onDragLeave={handleDragLeaveMemory}
                onDrop={handleDropMemory}
                onClick={openMemoryFilePicker}
                className={`bg-white/20 backdrop-blur-md shadow-lg rounded-xl w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ease-in-out ${dragActiveMemory ? "border-blue-500 bg-blue-50 hover:bg-blue-100" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
              >
                <input type="file" multiple ref={memoryFileInputRef} className="hidden" onChange={(e) => onMemoryFilesChosen(e.target.files)} accept=".json,.txt,.md,.csv,.pdf" />
                <div className="space-y-1">
                  <p className="font-medium text-gray-700 text-lg">Drop memory files here</p>
                  <p className="text-sm text-gray-500">or click to browse • .json .txt .md .csv .pdf</p>
                </div>
              </div>

              {/* File list */}
              {memoryFiles.length > 0 && (
                <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white mt-4">
                  {memoryFiles.map((f) => (
                    <li key={f.name + f.size} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-base font-medium text-gray-800">{f.name}</p>
                        <p className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB • {f.type || "unknown"}</p>
                      </div>
                      <button
                        onClick={() => removeMemoryFile(f.name, f.size)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition duration-200 ease-in-out"
                      >Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Tools Section */}
            <div className="space-y-3">
              <label className="block text-lg font-semibold text-gray-700">Enable Tools</label>
              {Object.keys(enabledTools).map(tool => (
                <div key={tool} className="flex items-center space-x-3">
                  <input
                    id={tool}
                    type="checkbox"
                    checked={enabledTools[tool]}
                    onChange={() => toggleTool(tool)}
                    className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor={tool} className="capitalize text-base text-gray-800 cursor-pointer">{tool.replace(/([A-Z])/g, ' $1').trim()}</label>
                </div>
              ))}
            </div>

            {/* Select Character button to load profile */}
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setSelectedCharacterId(highlightedCharacterId)}
                disabled={!highlightedCharacterId || highlightedCharacterId === selectedCharacterId}
                className={`w-full sm:w-1/2 md:w-1/3 py-3 rounded-lg text-lg font-bold transition duration-300 ease-in-out shadow-md hover:shadow-lg
                  ${(highlightedCharacterId && highlightedCharacterId !== selectedCharacterId) ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
              >
                Select Character
              </button>
            </div>


            {/* Action Buttons */}
            {selectedCharacter && (
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={handleCreate}
                  className="w-full sm:w-1/2 bg-blue-600 text-white py-3 rounded-lg text-lg font-bold hover:bg-blue-700 transition duration-300 ease-in-out shadow-md hover:shadow-lg"
                >
                  Create AI
                </button>
                {selectedCharacter.isCustom ? (
                  <>
                    <button
                      onClick={handleUpdate}
                      className="w-full sm:w-1/2 bg-green-600 text-white py-3 rounded-lg text-lg font-bold hover:bg-green-700 transition duration-300 ease-in-out shadow-md hover:shadow-lg"
                    >
                      Update Character
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full sm:w-1/2 bg-red-600 text-white py-3 rounded-lg text-lg font-bold hover:bg-red-700 transition duration-300 ease-in-out shadow-md hover:shadow-lg"
                    >
                      Delete Character
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleUpdate}
                    className="w-full sm:w-1/2 bg-green-600 text-white py-3 rounded-lg text-lg font-bold hover:bg-green-700 transition duration-300 ease-in-out shadow-md hover:shadow-lg"
                  >
                    Update Character
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
