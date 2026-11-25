import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, Play, Pause, ChevronLeft, ChevronRight, Music } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { SoundItem } from '../types';
import { Slider } from './Slider';

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

  return (
    <div className="w-full px-6 pb-3 pt-1 select-none">
      <div className="w-full bg-[#0e1219]/50 frosted-bottom-pill border border-white/[0.12] rounded-xl px-4 py-2 flex items-center justify-between gap-4 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        {/* Left: Speaker and Microphone Volume Faders */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className="text-accent hover:brightness-110 cursor-pointer flex-shrink-0"
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {isMuted ? <VolumeX size={14} className="text-rose-400" /> : <Volume2 size={14} />}
            </button>
            <Slider
              min={0}
              max={200}
              step={1}
              value={speakerVolume}
              onChange={(val) => {
                audioEngine.setMasterSpeakerVolume(val);
                onSpeakerVolumeChange(val);
              }}
              className="w-28"
            />
            <span className="font-mono text-[11px] font-medium text-slate-300 w-9 text-right shrink-0 tabular-nums">
              {speakerVolume}%
            </span>
          </div>

          {onMicProjectionVolumeChange && (
            <div className="flex items-center gap-2 pl-3 border-l border-white/[0.08]">
              <Mic size={14} className="text-accent shrink-0" />
              <Slider
                min={0}
                max={200}
                step={1}
                value={micProjectionVolume}
                onChange={(val) => {
                  audioEngine.setMicInputVolume(val);
                  onMicProjectionVolumeChange(val);
                }}
                className="w-28"
              />
              <span className="font-mono text-[11px] font-medium text-slate-300 w-9 text-right shrink-0 tabular-nums">
                {micProjectionVolume}%
              </span>
            </div>
          )}
        </div>

        {/* Right / Now Playing Console */}
        <div className="flex-1 flex items-center justify-between gap-4 min-w-0 pl-3 border-l border-white/[0.08]">
          {/* Sound Cover & Name */}
          <div className="flex items-center gap-2.5 min-w-0 max-w-[220px]">
            <div className="w-8 h-8 rounded-md bg-[#0e1219] border border-white/[0.08] overflow-hidden flex items-center justify-center text-slate-500 shrink-0">
              {activeSound?.thumbnail ? (
                <img
                  src={activeSound.thumbnail}
                  alt={activeSound.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music size={14} className="text-accent opacity-80" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-medium text-white truncate" title={activeSound?.title || 'No sound playing'}>
                {activeSound ? activeSound.title : 'Ready'}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                {activeSound?.author || (activeSound ? 'Playing' : 'Select a sound to play')}
              </span>
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="flex-1 flex items-center min-w-0 px-2">
            <Slider
              min={0}
              max={1}
              step={0.002}
              value={playbackProgress}
              onChange={(val) => {
                if (onSeekSound && activeSound) {
                  onSeekSound(val);
                }
              }}
              disabled={!activeSound}
              className="w-full"
            />
          </div>

          {/* Transport Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onSkipSound && onSkipSound(-5)}
              disabled={!activeSound}
              title="Rewind 5s"
              className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={onTogglePause}
              disabled={!activeSound}
              title={isPaused ? 'Resume' : 'Pause'}
              className="w-7 h-7 rounded-full bg-accent text-slate-950 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 hover:brightness-110 active:scale-95"
            >
              {isPaused || !activeSound ? (
                <Play size={11} className="fill-current ml-0.5" />
              ) : (
                <Pause size={11} className="fill-current" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSkipSound && onSkipSound(5)}
              disabled={!activeSound}
              title="Forward 5s"
              className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
