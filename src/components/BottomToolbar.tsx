import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, Play, Pause, ChevronLeft, ChevronRight, Square } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { SoundItem } from '../types';

interface BottomToolbarProps {
  speakerVolume: number;
  onSpeakerVolumeChange: (vol: number) => void;
  micProjectionVolume?: number;
  onMicProjectionVolumeChange?: (vol: number) => void;
  accentColor?: string;
  activeSound?: SoundItem | null;
  playbackProgress?: number;
  onStopSound?: () => void;
  onSeekSound?: (progress: number) => void;
  onSkipSound?: (deltaSeconds: number) => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  speakerVolume,
  onSpeakerVolumeChange,
  micProjectionVolume = 100,
  onMicProjectionVolumeChange,
  activeSound,
  playbackProgress = 0,
  onSeekSound,
  onSkipSound,
  onTogglePause,
  isPaused = false,
}) => {
  const [previousVolume, setPreviousVolume] = useState<number>(speakerVolume || 100);
  const isMuted = speakerVolume === 0;

  const handleToggleMute = () => {
    if (isMuted) {
      const restored = previousVolume > 0 ? previousVolume : 100;
      audioEngine.setMasterSpeakerVolume(restored);
      onSpeakerVolumeChange(restored);
    } else {
      setPreviousVolume(speakerVolume);
      audioEngine.setMasterSpeakerVolume(0);
      onSpeakerVolumeChange(0);
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (onSeekSound) {
      onSeekSound(val);
    } else if (activeSound) {
      audioEngine.seekSound(activeSound.id, val);
    }
  };

  return (
    <div className="w-full flex items-center justify-between gap-4 select-none px-6 pb-4">
      {/* Left Pod: Stacked Speaker & Mic Volume */}
      <div className="px-5 py-2.5 rounded-2xl bg-[#0d141d] border border-[#182432] flex flex-col gap-2 shadow-xl flex-shrink-0 min-w-[240px]">
        {/* Speaker Volume */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMute}
            className="flex items-center justify-center focus:outline-none cursor-pointer flex-shrink-0 text-[#22d3ee] hover:brightness-110"
            title={isMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          >
            {isMuted ? <VolumeX size={15} className="text-[#ff3b30]" /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={200}
            value={speakerVolume}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              audioEngine.setMasterSpeakerVolume(val);
              onSpeakerVolumeChange(val);
            }}
            className="w-32 h-1.5 bg-[#182432] rounded cursor-pointer accent-[#22d3ee]"
          />
          <span className="font-mono text-[11px] font-semibold text-[#22d3ee] w-9 text-right flex-shrink-0">
            {speakerVolume}%
          </span>
        </div>

        {/* Mic Volume */}
        {onMicProjectionVolumeChange && (
          <div className="flex items-center gap-3">
            <Mic size={15} className="flex-shrink-0 text-[#22d3ee]" />
            <input
              type="range"
              min={0}
              max={200}
              value={micProjectionVolume}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                audioEngine.setMicInputVolume(val);
                onMicProjectionVolumeChange(val);
              }}
              className="w-32 h-1.5 bg-[#182432] rounded cursor-pointer accent-[#22d3ee]"
            />
            <span className="font-mono text-[11px] font-semibold text-[#22d3ee] w-9 text-right flex-shrink-0">
              {micProjectionVolume}%
            </span>
          </div>
        )}
      </div>

      {/* Right / Main Playback Pod */}
      <div className="flex-1 px-5 py-2.5 rounded-2xl bg-[#0d141d] border border-[#182432] flex items-center justify-between gap-5 shadow-xl min-w-0">
        {/* Sound Name / Icon */}
        <div className="flex items-center gap-2.5 min-w-0 max-w-xs">
          <div className="w-5 h-5 rounded border border-[#233346] bg-[#090e15] flex items-center justify-center text-[#5a687c] flex-shrink-0">
            <Square size={10} />
          </div>
          <span className="text-[12px] font-medium text-white/90 truncate">
            {activeSound ? activeSound.title : 'No Sound Playing'}
          </span>
        </div>

        {/* Scrubber Timeline */}
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={playbackProgress}
            onChange={handleScrubberChange}
            disabled={!activeSound}
            className="w-full h-1.5 bg-[#182432] rounded cursor-pointer accent-[#22d3ee] disabled:opacity-40"
          />
        </div>

        {/* Transport Controls: Previous, Play/Pause, Next */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onSkipSound && onSkipSound(-5)}
            disabled={!activeSound}
            title="Rewind 5s"
            className="p-1 rounded-lg text-[#5a687c] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={onTogglePause}
            disabled={!activeSound}
            title={isPaused ? 'Resume' : 'Pause'}
            className="w-8 h-8 rounded-full border border-[#22d3ee] text-[#22d3ee] hover:bg-[#22d3ee] hover:text-[#070a0e] flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
          >
            {isPaused || !activeSound ? (
              <Play size={13} className="fill-current ml-0.5" />
            ) : (
              <Pause size={13} className="fill-current" />
            )}
          </button>

          <button
            onClick={() => onSkipSound && onSkipSound(5)}
            disabled={!activeSound}
            title="Forward 5s"
            className="p-1 rounded-lg text-[#5a687c] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
