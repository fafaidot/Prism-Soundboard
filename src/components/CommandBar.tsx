import React, { useState } from 'react';
import {
  Search,
  X,
  Square,
  Headphones,
  Scissors,
  ChevronDown,
  Check,
  Plus,
  Video,
} from 'lucide-react';
import { Tooltip } from './Tooltip';

export type SortOption = 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration';

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
  isRecording?: boolean;
  recordingSecondsLeft?: number;
  recordDuration?: number;
  recordSource?: 'all' | 'screen' | 'mic';
  recordHotkey?: string;
  onStartRecord?: () => void;
  onChangeRecordDuration?: (duration: number) => void;
  onChangeRecordSource?: (source: 'all' | 'screen' | 'mic') => void;
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
  onOpenYouTubeSearch,
  activeView = 'sounds',
}) => {
  const [showDurationMenu, setShowDurationMenu] = useState(false);
  const isVideoTab = activeView === 'clips';

  return (
    <div className="h-13 px-6 bg-[#090b10]/45 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-4 select-none relative z-30 transition-colors duration-150">
      {/* Left: Search Bar & Segmented Filter Tabs */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative flex items-center flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search sounds, tags..."
            className="w-full h-8 pl-8 pr-7 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-white/[0.12] text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('favorites')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
              activeFilter === 'favorites'
                ? 'bg-white/[0.12] text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Favorites
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('youtube')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
              activeFilter === 'youtube'
                ? 'bg-white/[0.12] text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            YouTube
          </button>
        </div>
      </div>

      {/* Right: Panic Button, Hear Myself, Buffer Clip, Add Sound */}
      <div className="flex items-center gap-2">
        {/* Panic / Stop All Button */}
        <Tooltip content={`Stop all audio [${panicHotkey}]`}>
          <button
            type="button"
            onClick={onStopAll}
            className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isStopAllActive
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-white/[0.03] hover:bg-rose-500/15 border-white/[0.08] hover:border-rose-500/40 text-slate-300 hover:text-rose-300'
            }`}
          >
            <Square size={11} className="fill-current" />
            <span className="text-[11px] font-medium">Stop</span>
          </button>
        </Tooltip>

        {/* Hear Myself / Monitor Button */}
        <Tooltip content={hearMyself ? 'Mic monitor: On' : 'Mic monitor: Off'}>
          <button
            type="button"
            onClick={onToggleHearMyself}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
              hearMyself
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] text-slate-400 hover:text-white'
            }`}
          >
            <Headphones size={14} />
          </button>
        </Tooltip>

        {/* Quick Clip Buffer Selector */}
        <div className="relative">
          <div className="flex items-center h-8 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] text-slate-300 hover:text-white transition-colors overflow-hidden">
            <button
              type="button"
              onClick={() => onStartRecord && onStartRecord()}
              className="flex items-center gap-1.5 px-2.5 h-full hover:bg-white/[0.05] cursor-pointer text-[11px] font-medium"
              title={isVideoTab ? `Capture replay video [${recordHotkey}]` : `Capture sound clip [${recordHotkey}]`}
            >
              {isVideoTab ? (
                <Video size={13} className="text-accent" />
              ) : (
                <Scissors size={13} className="text-accent" />
              )}
              <span>{isVideoTab ? 'Video' : 'Clip'} {recordDuration}s</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDurationMenu(!showDurationMenu)}
              className="px-1.5 h-full border-l border-white/[0.08] hover:bg-white/[0.05] cursor-pointer flex items-center justify-center text-slate-400 hover:text-white"
            >
              <ChevronDown size={11} />
            </button>
          </div>

          {showDurationMenu && (
            <div className="absolute right-0 top-10 w-40 rounded-xl frosted-dropdown bg-[#0e1219]/50 backdrop-blur-2xl border border-white/[0.14] p-1.5 shadow-2xl z-50 flex flex-col gap-0.5">
              <span className="px-2.5 py-1 text-[10px] font-medium text-slate-400">
                {isVideoTab ? 'Video buffer length' : 'Audio buffer length'}
              </span>
              {(isVideoTab ? [15, 30, 45, 60] : [5, 15, 30, 60]).map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => {
                    onChangeRecordDuration && onChangeRecordDuration(dur);
                    setShowDurationMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1 rounded-md text-[11px] cursor-pointer transition-colors ${
                    recordDuration === dur
                      ? 'text-accent font-semibold'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span>{dur} seconds</span>
                  {recordDuration === dur && <Check size={12} className="text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Sound Primary Button */}
        <button
          type="button"
          onClick={onOpenYouTubeSearch}
          className="h-8 px-3 rounded-lg bg-accent text-slate-950 font-medium text-[11.5px] hover:brightness-110 active:scale-95 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>Add sound</span>
        </button>
      </div>
    </div>
  );
};
