import React, { useState, useMemo, useRef } from 'react';
import { Piano, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

import DimensionsProvider from './DimensionsProvider';
import SoundfontProvider from './SoundfontProvider';
import { isPianoOpen } from './UIStates';

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundfontHostname = 'https://d1pzp51pvbm36p.cloudfront.net';

const noteRange = {
  first: MidiNumbers.fromNote('c2'),
  last: MidiNumbers.fromNote('c7'),
};

const keyboardShortcuts = [
  { key: '1', midiNumber: MidiNumbers.fromNote('c2') }, { key: '!', midiNumber: MidiNumbers.fromNote('c#2') },
  { key: '2', midiNumber: MidiNumbers.fromNote('d2') }, { key: '@', midiNumber: MidiNumbers.fromNote('d#2') },
  { key: '3', midiNumber: MidiNumbers.fromNote('e2') }, { key: '4', midiNumber: MidiNumbers.fromNote('f2') },
  { key: '$', midiNumber: MidiNumbers.fromNote('f#2') }, { key: '5', midiNumber: MidiNumbers.fromNote('g2') },
  { key: '%', midiNumber: MidiNumbers.fromNote('g#2') }, { key: '6', midiNumber: MidiNumbers.fromNote('a2') },
  { key: '^', midiNumber: MidiNumbers.fromNote('a#2') }, { key: '7', midiNumber: MidiNumbers.fromNote('b2') },
  { key: '8', midiNumber: MidiNumbers.fromNote('c3') }, { key: '*', midiNumber: MidiNumbers.fromNote('c#3') },
  { key: '9', midiNumber: MidiNumbers.fromNote('d3') }, { key: '(', midiNumber: MidiNumbers.fromNote('d#3') },
  { key: '0', midiNumber: MidiNumbers.fromNote('e3') }, { key: 'q', midiNumber: MidiNumbers.fromNote('f3') },
  { key: 'Q', midiNumber: MidiNumbers.fromNote('f#3') }, { key: 'w', midiNumber: MidiNumbers.fromNote('g3') },
  { key: 'W', midiNumber: MidiNumbers.fromNote('g#3') }, { key: 'e', midiNumber: MidiNumbers.fromNote('a3') },
  { key: 'E', midiNumber: MidiNumbers.fromNote('a#3') }, { key: 'r', midiNumber: MidiNumbers.fromNote('b3') },
  { key: 't', midiNumber: MidiNumbers.fromNote('c4') }, { key: 'T', midiNumber: MidiNumbers.fromNote('c#4') },
  { key: 'y', midiNumber: MidiNumbers.fromNote('d4') }, { key: 'Y', midiNumber: MidiNumbers.fromNote('d#4') },
  { key: 'u', midiNumber: MidiNumbers.fromNote('e4') }, { key: 'i', midiNumber: MidiNumbers.fromNote('f4') },
  { key: 'I', midiNumber: MidiNumbers.fromNote('f#4') }, { key: 'o', midiNumber: MidiNumbers.fromNote('g4') },
  { key: 'O', midiNumber: MidiNumbers.fromNote('g#4') }, { key: 'p', midiNumber: MidiNumbers.fromNote('a4') },
  { key: 'P', midiNumber: MidiNumbers.fromNote('a#4') }, { key: 'a', midiNumber: MidiNumbers.fromNote('b4') },
  { key: 's', midiNumber: MidiNumbers.fromNote('c5') }, { key: 'S', midiNumber: MidiNumbers.fromNote('c#5') },
  { key: 'd', midiNumber: MidiNumbers.fromNote('d5') }, { key: 'D', midiNumber: MidiNumbers.fromNote('d#5') },
  { key: 'f', midiNumber: MidiNumbers.fromNote('e5') }, { key: 'g', midiNumber: MidiNumbers.fromNote('f5') },
  { key: 'G', midiNumber: MidiNumbers.fromNote('f#5') }, { key: 'h', midiNumber: MidiNumbers.fromNote('g5') },
  { key: 'H', midiNumber: MidiNumbers.fromNote('g#5') }, { key: 'j', midiNumber: MidiNumbers.fromNote('a5') },
  { key: 'J', midiNumber: MidiNumbers.fromNote('a#5') }, { key: 'k', midiNumber: MidiNumbers.fromNote('b5') },
  { key: 'l', midiNumber: MidiNumbers.fromNote('c6') }, { key: 'L', midiNumber: MidiNumbers.fromNote('c#6') },
  { key: 'z', midiNumber: MidiNumbers.fromNote('d6') }, { key: 'Z', midiNumber: MidiNumbers.fromNote('d#6') },
  { key: 'x', midiNumber: MidiNumbers.fromNote('e6') }, { key: 'c', midiNumber: MidiNumbers.fromNote('f6') },
  { key: 'C', midiNumber: MidiNumbers.fromNote('f#6') }, { key: 'v', midiNumber: MidiNumbers.fromNote('g6') },
  { key: 'V', midiNumber: MidiNumbers.fromNote('g#6') }, { key: 'b', midiNumber: MidiNumbers.fromNote('a6') },
  { key: 'B', midiNumber: MidiNumbers.fromNote('a#6') }, { key: 'n', midiNumber: MidiNumbers.fromNote('b6') },
  { key: 'm', midiNumber: MidiNumbers.fromNote('c7') }
];

const HandVisualizer = ({ hand, activeNotes, transposition, wristPos }) => {
  const isRight = hand === 'right';
  const handNotes = activeNotes.filter(n => isRight ? n >= 60 : n < 60);

  const fingering = useMemo(() => {
    return handNotes.map(note => {
      const diff = note - wristPos;
      let fingerIndex = isRight ? diff + 3 : (3 - diff);
      return Math.max(1, Math.min(5, Math.round(fingerIndex)));
    });
  }, [handNotes, wristPos, isRight]);

  const anchorBase = isRight ? 78 : 42; 
  const relativePos = (wristPos - (anchorBase + transposition)) * 1.6;

  return (
    <div 
      className="absolute transition-all duration-500 ease-out pointer-events-none"
      style={{ 
        left: isRight ? `calc(75% + ${relativePos}%)` : `calc(25% + ${relativePos}%)`,
        top: '60px', 
        transform: `translateX(-50%)`,
        opacity: handNotes.length > 0 ? 1 : 0.3,
        zIndex: 100
      }}
    >
      <svg viewBox="0 0 200 240" className={`w-32 h-48 ${!isRight ? 'scale-x-[-1]' : ''}`}>
        <path d="M50,180 Q100,200 150,180 L165,100 Q100,80 35,100 Z" fill="#dfc1a3" stroke="#8d5524" strokeWidth="2" />
        {[1, 2, 3, 4, 5].map((num) => {
          const isActive = fingering.includes(num);
          return (
            <g key={num} className="transition-all duration-150" style={{ transform: `translateY(${isActive ? -20 : 0}px)` }}>
              <rect x={40 + (num * 20)} y={60} width="16" height="60" rx="8" fill={isActive ? "#f3e5d8" : "#dfc1a3"} stroke="#8d5524" />
              {isActive && (
                <text x={44 + (num * 20)} y={50} fontSize="14" fontWeight="black" fill="#2563eb" 
                      transform={!isRight ? "scale(-1, 1) translate(-105, 0)" : ""}>
                  {num}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export function PianoUI() {
  const [transposition, setTransposition] = useState(0);
  const [isSustain, setIsSustain] = useState(false);
  const [activeNotes, setActiveNotes] = useState([]);
  const [wristL, setWristL] = useState(42);
  const [wristR, setWristR] = useState(78);
  const [sheetMusic, setSheetMusic] = useState("");
  
  // Track release timeouts to prevent visual glitches on rapid key presses
  const releaseTimers = useRef(new Map());

  const handleNoteStart = (midi) => {
    // Clear any pending release for this note if it's hit again quickly
    if (releaseTimers.current.has(midi)) {
      clearTimeout(releaseTimers.current.get(midi));
      releaseTimers.current.delete(midi);
    }

    setActiveNotes(prev => [...new Set([...prev, midi])]);
    if (midi >= 60 && Math.abs(midi - wristR) > 2) setWristR(midi);
    else if (midi < 60 && Math.abs(midi - wristL) > 2) setWristL(midi);
  };

  const handleNoteStop = (midi, stopNoteFn) => {
    // 1. Handle Audio Logic
    if (isPianoOpen() && !isSustain) {
      stopNoteFn(midi);
    }

    // 2. Handle Delayed Visual Logic (0.1s delay)
    const timer = setTimeout(() => {
      setActiveNotes(prev => prev.filter(x => x !== midi));
      releaseTimers.current.delete(midi);
    }, 100);

    releaseTimers.current.set(midi, timer);
  };

  return (
    <div className="flex flex-row h-screen bg-transparent p-4 gap-4 overflow-hidden">
      
      {/* LEFT COLUMN */}
      <div className="flex-[3] flex flex-col gap-4">
        
        {/* CONTROLS */}
        <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex justify-between items-center shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setTransposition(t => t - 1)} className="w-10 h-10 bg-white/5 text-white rounded-lg border border-white/10 hover:bg-white/20 transition font-bold">-</button>
              <div className="text-center min-w-[60px]">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Key</p>
                <p className="font-mono font-bold text-xl text-blue-400">{transposition}</p>
              </div>
              <button onClick={() => setTransposition(t => t + 1)} className="w-10 h-10 bg-white/5 text-white rounded-lg border border-white/10 hover:bg-white/20 transition font-bold">+</button>
            </div>
            <button onClick={() => setIsSustain(!isSustain)} className={`px-8 py-2 rounded-xl text-sm font-black transition-all border ${isSustain ? 'bg-green-500/40 border-green-400 text-white' : 'bg-white/5 border-white/10 text-white/30'}`}>
              SUSTAIN {isSustain ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="text-[10px] text-white/20 font-bold uppercase tracking-[0.2em]">Interactive Piano Lab</div>
        </div>

        {/* PIANO STAGE */}
        <div className="flex-grow bg-white/[0.02] backdrop-blur-md p-6 rounded-3xl border border-white/10 relative overflow-hidden flex flex-col shadow-2xl">
          <div className="relative z-10">
            <DimensionsProvider>
              {({ containerWidth }) => (
                <SoundfontProvider
                  instrumentName="acoustic_grand_piano"
                  audioContext={audioContext}
                  hostname={soundfontHostname}
                  render={({ isLoading, playNote, stopNote }) => (
                    <Piano
                      noteRange={{ first: noteRange.first + transposition, last: noteRange.last + transposition }}
                      width={containerWidth}
                      keyboardShortcuts={keyboardShortcuts.map(s => ({ ...s, midiNumber: s.midiNumber + transposition }))}
                      playNote={(midi) => { 
                        if (isPianoOpen()) { 
                          playNote(midi); 
                          handleNoteStart(midi); 
                        } 
                      }}
                      stopNote={(midi) => handleNoteStop(midi, stopNote)}
                      disabled={isLoading}
                    />
                  )}
                />
              )}
            </DimensionsProvider>
          </div>
          <HandVisualizer hand="left" activeNotes={activeNotes} transposition={transposition} wristPos={wristL} />
          <HandVisualizer hand="right" activeNotes={activeNotes} transposition={transposition} wristPos={wristR} />
        </div>
      </div>

      {/* RIGHT COLUMN: GHOST MUSIC STAND */}
      <div className="flex-1 bg-black/10 backdrop-blur-3xl rounded-3xl border border-white/10 flex flex-col overflow-hidden min-w-[320px] shadow-2xl">
        <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">Digital Sheet Music</h3>
          <span className="text-[9px] px-2 py-1 bg-white/10 text-white/60 rounded-full font-bold">SCROLLABLE</span>
        </div>
        
        <div className="flex-grow overflow-y-auto bg-transparent">
          <textarea
            className="w-full h-full p-8 font-serif text-xl leading-relaxed focus:outline-none resize-none border-none text-white placeholder-white/20 bg-transparent"
            placeholder="Paste lyrics or chords here..."
            value={sheetMusic}
            onChange={(e) => setSheetMusic(e.target.value)}
            style={{ lineHeight: '1.8' }}
          />
        </div>

        <div className="p-3 bg-white/5 text-[10px] text-white/20 text-center border-t border-white/5">
          End of Sheet
        </div>
      </div>
    </div>
  );
}