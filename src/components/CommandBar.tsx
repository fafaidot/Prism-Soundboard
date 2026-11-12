import React, { useState } from 'react';
import {
  Search,
  X,
  Square,
  Headphones,
  Scissors,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Tooltip } from './Tooltip';

export type SortOption = 'custom' | 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration';

interface CommandBarProps {
  totalSounds: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  deletedCount?: number;
  onOpenDeletedModal?: () => void;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
  micVolume?: number;
  onMicVolumeChange?: (vol: number) => void;
  onStopAll: () => void;
  hasActiveSounds: boolean;
  activeSoundsCount?: number;
  isStopAllActive?: boolean;
  onOpenYouTubeSearch: () => void;
  onImportLocalFiles: () => void;
  accentColor: string;
  panicHotkey: string;
  onOpenSettings: () => void;
  isVirtualActive: boolean;
  micLevel: number;
  hearMyself: boolean;
  onToggleHearMyself: () => void;
  isMicPassThrough?: boolean;
  onToggleMicPassThrough?: () => void;
  // Quick Recording
  isRecording?: boolean;
  recordingSecondsLeft?: number;
  recordDuration?: number;
  recordSource?: 'all' | 'screen' | 'mic';
  recordHotkey?: string;
  onStartRecord?: () => void;
  onChangeRecordDuration?: (duration: number) => void;
  onChangeRecordSource?: (source: 'all' | 'screen' | 'mic') => void;
  // View mode: Sounds vs Game Clips
  activeView?: 'sounds' | 'clips';
  onChangeView?: (view: 'sounds' | 'clips') => void;
  clipsCount?: number;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  onStopAll,
  isStopAllActive = false,
  panicHotkey,
  hearMyself,
  onToggleHearMyself,
  recordDuration = 5,
  recordHotkey = 'F9',
  onStartRecord,
  onChangeRecordDuration,
}) => {
  const [showDurationMenu, setShowDurationMenu] = useState(false);

  return (
    <div className="h-14 px-6 bg-[#080c12] border-b border-[#16222f] flex items-center justify-between gap-4 select-none relative z-30 transition-colors duration-150">
      {/* Left: Search Bar + Filter Pills */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        {/* Search input with rounded pill styling */}
        <div className="relative flex items-center flex-1 max-w-sm">
          <Search size={14} className="absolute left-3.5 text-[#5a687c] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search sounds, clips, tags..."
            className="w-full h-9 pl-9 pr-8 text-[12px] rounded-lg bg-[#0d141d] border border-[#182432] text-white placeholder-[#5a687c] focus:outline-none focus:border-[#22d3ee]/60 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 text-[#5a687c] hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[#0e3b52] text-[#22d3ee] border border-[#1b6288]'
                : 'bg-[#0d141d] text-[#5a687c] hover:text-white border border-[#182432]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => onFilterChange('favorites')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
              activeFilter === 'favorites'
                ? 'bg-[#0e3b52] text-[#22d3ee] border border-[#1b6288]'
                : 'bg-[#0d141d] text-[#5a687c] hover:text-white border border-[#182432]'
            }`}
          >
            Favorites
          </button>
        </div>
      </div>

      {/* Right: Panic Button, Hear Myself, Quick Clip */}
      <div className="flex items-center gap-2.5">
        {/* Panic / Stop All Button */}
        <Tooltip content={`Stop All Audio [${panicHotkey}]`}>
          <button
            onClick={onStopAll}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              isStopAllActive
                ? 'bg-[#ff3b30] border-transparent text-white scale-95 shadow-[0_0_15px_rgba(255,59,48,0.5)]'
                : 'bg-[#151216] border border-[#2c1822] hover:border-[#ff3b30]/50 text-[#ff453a]'
            }`}
          >
            <Square size={13} className="fill-current" />
          </button>
        </Tooltip>

        {/* Hear Myself / Headphones Button */}
        <Tooltip content={hearMyself ? 'Hear Myself: ON' : 'Hear Myself: OFF'}>
          <button
            onClick={onToggleHearMyself}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              hearMyself
                ? 'bg-[#0e3b52] text-[#22d3ee] border border-[#1b6288]'
                : 'bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/40 text-[#8e95a5] hover:text-white'
            }`}
          >
            <Headphones size={15} />
          </button>
        </Tooltip>

        {/* Quick Clip Dropdown Button */}
        <div className="relative">
          <div className="flex items-center h-9 rounded-lg bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/40 text-[#8e95a5] hover:text-white transition-all overflow-hidden">
            <button
              onClick={() => onStartRecord && onStartRecord()}
              className="flex items-center gap-2 px-3 h-full hover:bg-white/5 cursor-pointer text-[12px] font-medium"
              title={`Capture Instant Clip [${recordHotkey}]`}
            >
              <Scissors size={13} className="text-[#22d3ee]" />
              <span>Clip · {recordDuration}s</span>
            </button>
            <button
              onClick={() => setShowDurationMenu(!showDurationMenu)}
              className="px-2 h-full border-l border-[#182432] hover:bg-white/5 cursor-pointer flex items-center justify-center text-[#5a687c] hover:text-white"
            >
              <ChevronDown size={12} />
            </button>
          </div>

          {showDurationMenu && (
            <div className="absolute right-0 top-11 w-44 rounded-xl bg-[#0d141d] border border-[#182432] p-1.5 shadow-2xl z-50 flex flex-col gap-1">
              <span className="px-2.5 py-1 text-[10px] font-bold text-[#5a687c] uppercase tracking-wider">
                Replay Duration
              </span>
              {[5, 15, 30, 60].map((dur) => (
                <button
                  key={dur}
                  onClick={() => {
                    onChangeRecordDuration && onChangeRecordDuration(dur);
                    setShowDurationMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors ${
                    recordDuration === dur
                      ? 'bg-[#0e3b52] text-[#22d3ee]'
                      : 'text-[#8e95a5] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{dur} Seconds</span>
                  {recordDuration === dur && <Check size={12} className="text-[#22d3ee]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
