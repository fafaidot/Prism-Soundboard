import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, Clapperboard, Music, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
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
  accentColor,
  activeSound,
  playbackProgress = 0,
  onStopSound,
  onSeekSound,
  onSkipSound,
  onTogglePause,
  isPaused = false,
}) => {
  const [previousVolume, setPreviousVolume] = useState<number>(speakerVolume || 100);
  const isMuted = speakerVolume === 0;
  const accent = accentColor || 'var(--accent-color, #38bdf8)';

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
    <div className="w-full flex items-center justify-between gap-4 select-none">
      {/* Left Pod: Stacked Voice & Sounds Volume in its own floating rounded container */}
      <div className="relative z-10 px-5 py-2.5 rounded-[16px] bg-[#141620] border border-[#242938] flex flex-col gap-1.5 shadow-xl flex-shrink-0 min-w-[210px] sm:min-w-[240px]">
        {/* Voice Vol (Top) */}
        {onMicProjectionVolumeChange && (
          <div className="flex items-center gap-2.5">
            <Mic
              size={15}
              className={`flex-shrink-0 ${micProjectionVolume > 100 ? 'text-[#f59e0b]' : ''}`}
              style={micProjectionVolume <= 100 ? { color: accent } : undefined}
            />
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
              className="w-28 sm:w-36 h-1.5 bg-[#252834] rounded cursor-pointer"
              style={{ accentColor: micProjectionVolume > 100 ? '#f59e0b' : accent }}
            />
            <span
              style={{ color: micProjectionVolume > 100 ? '#f59e0b' : accent }}
              className="font-mono text-[11px] font-bold w-9 text-right flex-shrink-0"
            >
              {micProjectionVolume}%
            </span>
          </div>
        )}

        {/* Sound Vol (Bottom) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleToggleMute}
            className="flex items-center justify-center focus:outline-none cursor-pointer flex-shrink-0"
            title={isMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          >
            <Volume2
              size={15}
              className={isMuted ? 'text-[#e81123]' : ''}
              style={!isMuted ? { color: accent } : undefined}
            />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={speakerVolume}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              audioEngine.setMasterSpeakerVolume(val);
              onSpeakerVolumeChange(val);
            }}
            className="w-28 sm:w-36 h-1.5 bg-[#252834] rounded cursor-pointer"
            style={{ accentColor: accent }}
          />
          <span
            style={{ color: accent }}
            className="font-mono text-[11px] font-bold w-9 text-right flex-shrink-0"
          >
            {speakerVolume}%
          </span>
        </div>
      </div>

      {/* Right Pod: Dedicated floating player pod filling the remaining space */}
      {activeSound && (
        <div className="relative z-10 flex-1 px-4 py-2 rounded-[16px] bg-[#141620] border border-[#242938] flex flex-col justify-center gap-1 shadow-xl min-w-0">
          {/* Top row: Artwork, Title, and chevron skip / pause / stop controls */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            {/* Sound Icon & Title */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-[6px] overflow-hidden bg-black flex-shrink-0 flex items-center justify-center border border-white/10">
                {activeSound.thumbnail ? (
                  <img src={activeSound.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : activeSound.source === 'clip' || activeSound.title.toLowerCase().startsWith('clipped') ? (
                  <Clapperboard size={12} style={{ color: accent }} />
                ) : (
                  <Music size={12} style={{ color: accent }} />
                )}
              </div>
              <span className="text-[11.5px] font-bold text-white/90 truncate leading-tight" title={activeSound.title}>
                {activeSound.title}
              </span>
            </div>

            {/* Playback Controls (Chevron Left, Centered Pause/Resume, Chevron Right) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Skip Back 5s Arrow */}
              <button
                type="button"
                onClick={() => {
                  if (onSkipSound) {
                    onSkipSound(-5);
                  } else {
                    audioEngine.skipSound(activeSound.id, -5);
                  }
                }}
                title="Rewind 5 seconds"
                className="w-6 h-6 rounded-md hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              {/* Pause / Resume Button (Centered icon) */}
              <button
                type="button"
                onClick={() => {
                  if (onTogglePause) {
                    onTogglePause();
                  } else {
                    audioEngine.togglePlayPauseSound(activeSound.id);
                  }
                }}
                style={{ backgroundColor: accent, color: '#000' }}
                title={isPaused ? 'Resume Playback' : 'Pause Playback'}
                className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-sm"
              >
                {isPaused ? <Play size={10} className="fill-current translate-x-[0.5px]" /> : <Pause size={10} className="fill-current" />}
              </button>

              {/* Skip Forward 5s Arrow */}
              <button
                type="button"
                onClick={() => {
                  if (onSkipSound) {
                    onSkipSound(5);
                  } else {
                    audioEngine.skipSound(activeSound.id, 5);
                  }
                }}
                title="Skip forward 5 seconds"
                className="w-6 h-6 rounded-md hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Bottom row: Interactive Progress Bar Slider spanning the full pod */}
          <div className="flex items-center gap-2.5 w-full">
            <div className="relative flex-1 flex items-center h-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={playbackProgress}
                onChange={handleScrubberChange}
                className="w-full h-1 bg-[#1e2230] rounded cursor-pointer transition-all"
                style={{ accentColor: accent }}
              />
            </div>
            <span className="font-mono text-[9.5px] text-[#71788e] font-semibold w-8 text-right flex-shrink-0">
              {Math.round(playbackProgress * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
