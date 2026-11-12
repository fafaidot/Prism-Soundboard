import React, { useState } from 'react';
import {
  Search,
  X,
  Square,
  Plus,
  Video,
  FolderOpen,
  Headphones,
  CircleDot,
  Radio,
  ChevronDown,
  ArrowUpDown,
  Trash2,
  Clapperboard,
  Star,
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
}

export const CommandBar: React.FC<CommandBarProps> = ({
  totalSounds,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  sortBy = 'newest',
  onSortChange,
  deletedCount = 0,
  onOpenDeletedModal,
  onStopAll,
  hasActiveSounds,
  activeSoundsCount = 0,
  isStopAllActive = false,
  onOpenYouTubeSearch,
  onImportLocalFiles,
  accentColor,
  panicHotkey,
  hearMyself,
  onToggleHearMyself,
  isRecording = false,
  recordingSecondsLeft = 0,
  recordDuration = 5,
  recordSource = 'screen',
  recordHotkey = 'F9',
  onStartRecord,
  onChangeRecordDuration,
  onChangeRecordSource,
}) => {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDurationMenu, setShowDurationMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const accent = accentColor || 'var(--accent-color, #8b5cf6)';

  const sortLabels: Record<SortOption, string> = {
    custom: 'Custom Order',
    newest: 'Newest Added',
    oldest: 'Oldest Added',
    alphabetical: 'A to Z',
    most_played: 'Most Played',
    duration: 'Duration',
  };

  return (
    <div className="h-11 px-4 bg-[var(--theme-bg-header,#090a0f)] border-b border-[var(--theme-border,#222436)] flex items-center justify-between gap-3 select-none relative z-30 transition-colors duration-150">
      {/* Left: Compact Icon-Only Search, Filters & Sort */}
      <div className="flex items-center gap-2 flex-1">
        {/* Compact Expandable Icon-Only Search */}
        <div className="relative flex items-center">
          {isSearchExpanded || searchQuery ? (
            <div className="relative w-52 h-[30px] animate-in fade-in zoom-in-95 duration-100">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#687084]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onBlur={() => {
                  if (!searchQuery) setIsSearchExpanded(false);
                }}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Search ${totalSounds}...`}
                className="w-full h-full pl-8 pr-7 bg-[var(--theme-bg-surface,#12131d)] border border-[var(--theme-border,#222436)] hover:border-[var(--theme-border-hover,#323650)] rounded-[8px] text-[11.5px] text-white placeholder-[#687084] focus:outline-none transition-all shadow-inner box-border"
                style={{ ['--tw-ring-color' as any]: accent }}
              />
              <button
                onClick={() => {
                  onSearchChange('');
                  setIsSearchExpanded(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#687084] hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <Tooltip content={`Search sounds (${totalSounds})`} position="bottom">
              <button
                onClick={() => setIsSearchExpanded(true)}
                className="h-[30px] w-[30px] flex items-center justify-center rounded-[8px] bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#222436)] hover:border-[var(--theme-border-hover,#323650)] text-[#9da5b7] hover:text-white transition-all cursor-pointer box-border"
              >
                <Search size={14} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Compact Icon-Only Filter Tabs */}
        <div className="h-[30px] flex items-center gap-0.5 bg-[var(--theme-bg-surface,#12131d)] p-0.5 rounded-[8px] border border-[var(--theme-border,#222436)] box-border">
          {([
            { id: 'all', label: 'All Sounds', icon: null },
            { id: 'clips', label: 'Clips Only', icon: Clapperboard },
            { id: 'youtube', label: 'YouTube Sounds', icon: Video },
            { id: 'favorites', label: 'Favorites', icon: Star },
          ] as const).map((tab) => {
            const Icon = (tab as any).icon;
            const isActive = activeFilter === tab.id;
            return (
              <Tooltip key={tab.id} content={tab.label} position="bottom">
                <button
                  onClick={() => onFilterChange(tab.id)}
                  style={
                    isActive
                      ? {
                          backgroundColor: `${accent}25`,
                          borderColor: `${accent}50`,
                          color: '#ffffff',
                        }
                      : undefined
                  }
                  className={`h-full min-w-[28px] px-2 flex items-center justify-center rounded-[6px] text-[10.5px] font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'shadow-sm border'
                      : 'text-[#9da5b7] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {Icon ? (
                    <Icon
                      size={13}
                      style={isActive ? { color: accent } : undefined}
                      className={!isActive ? 'text-[#7e8697]' : undefined}
                    />
                  ) : (
                    <span>All</span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Compact Icon-Only Sorting Button */}
        <div className="relative">
          <Tooltip content={`Sort Order: ${sortLabels[sortBy] || 'Sort'}`} position="bottom">
            <button
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowDurationMenu(false);
                setShowAddMenu(false);
              }}
              style={showSortMenu ? { borderColor: accent } : undefined}
              className="h-[30px] w-[30px] flex items-center justify-center bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#222436)] hover:border-[var(--theme-border-hover,#323650)] rounded-[8px] text-[#9da5b7] hover:text-white transition-all cursor-pointer"
            >
              <ArrowUpDown size={13} style={{ color: accent }} />
            </button>
          </Tooltip>

          {showSortMenu && (
            <div className="absolute left-0 top-full mt-1.5 w-44 bg-[var(--theme-bg-surface,#12131d)] border border-[var(--theme-border,#222436)] rounded-[12px] shadow-[0_10px_35px_rgba(0,0,0,0.8)] py-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8e97aa]">
                Sort Sounds By
              </div>
              {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    if (onSortChange) onSortChange(key);
                    setShowSortMenu(false);
                  }}
                  style={sortBy === key ? { color: accent } : undefined}
                  className={`w-full px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer ${
                    sortBy === key ? 'bg-white/5 font-bold' : 'text-white'
                  }`}
                >
                  <span>{sortLabels[key]}</span>
                  {sortBy === key && <Check size={12} style={{ color: accent }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center/Right: Clip Last X Seconds, Hear Myself, Stop All, & Add Sound */}
      <div className="flex items-center gap-2 relative z-10">
        {/* Clip Last Seconds Button with Duration Selector (Icon + Length only) */}
        <div className="relative flex items-center">
          <Tooltip
            content={
              isRecording
                ? `Clipping last ${recordDuration}s...`
                : `Instant Replay: Click or press [${recordHotkey}] to capture the last ${recordDuration}s into soundboard`
            }
            position="bottom"
          >
            <button
              onClick={() => {
                if (!isRecording && onStartRecord) {
                  onStartRecord();
                }
              }}
              disabled={isRecording}
              style={
                isRecording
                  ? {
                      backgroundColor: `${accent}25`,
                      borderColor: accent,
                      color: accent,
                    }
                  : undefined
              }
              className={`h-[30px] flex items-center justify-center gap-1.5 px-2 rounded-l-[8px] text-[11px] font-bold border transition-all cursor-pointer box-border ${
                isRecording
                  ? 'animate-pulse cursor-wait'
                  : 'bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)] border-[var(--theme-border,#222436)] hover:border-[var(--theme-border-hover,#323650)] text-white'
              }`}
            >
              <Clapperboard
                size={13}
                style={{ color: accent }}
                className={isRecording ? 'animate-spin' : ''}
              />
              <span className="font-bold text-[10.5px]" style={{ color: accent }}>
                {isRecording ? 'Clipping...' : `${recordDuration}s`}
              </span>
            </button>
          </Tooltip>

          {/* Duration Selector Dropdown Toggle */}
          <button
            onClick={() => setShowDurationMenu(!showDurationMenu)}
            disabled={isRecording}
            title="Configure Clip Duration"
            className={`h-[30px] px-1.5 rounded-r-[8px] border-y border-r border-[var(--theme-border,#222436)] text-[#8a92a6] hover:text-white transition-all cursor-pointer box-border flex items-center justify-center ${
              isRecording
                ? 'opacity-50'
                : 'bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)]'
            }`}
          >
            <ChevronDown size={11} />
          </button>

          {/* Duration & Source Dropdown Menu */}
          {showDurationMenu && (
            <div className="absolute left-0 top-full mt-1.5 w-52 bg-[var(--theme-bg-surface,#12131d)] border border-[var(--theme-border,#222436)] rounded-[12px] shadow-[0_10px_35px_rgba(0,0,0,0.8)] py-2 z-[100] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8e97aa]">
                Clip Buffer Duration
              </div>
              {[3, 5, 10, 15, 30].map((dur) => (
                <button
                  key={dur}
                  onClick={() => {
                    if (onChangeRecordDuration) {
                      onChangeRecordDuration(dur);
                    }
                    setShowDurationMenu(false);
                  }}
                  style={recordDuration === dur ? { color: accent } : undefined}
                  className={`w-full px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer ${
                    recordDuration === dur ? 'bg-white/5 font-bold' : 'text-white'
                  }`}
                >
                  <span>Last {dur} Seconds</span>
                  {recordDuration === dur && <Check size={12} style={{ color: accent }} />}
                </button>
              ))}

              <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8e97aa] border-t border-[var(--theme-border,#222436)] mt-1.5">
                Recording Source
              </div>
              {[
                { id: 'screen', label: 'Computer Audio (Loopback)' },
                { id: 'all', label: 'Screen + Mic Combined' },
                { id: 'mic', label: 'Microphone Only' },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => {
                    if (onChangeRecordSource) {
                      onChangeRecordSource(src.id as any);
                    }
                    setShowDurationMenu(false);
                  }}
                  style={recordSource === src.id ? { color: accent } : undefined}
                  className={`w-full px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer ${
                    recordSource === src.id ? 'bg-white/5 font-bold' : 'text-white'
                  }`}
                >
                  <span className="truncate">{src.label}</span>
                  {recordSource === src.id && <Check size={12} style={{ color: accent }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hear Myself Headphone Monitor Toggle (Icon only) */}
        <Tooltip
          content={
            hearMyself
              ? 'Hear Myself: ACTIVE (Microphone plays in headphones)'
              : 'Hear Myself: OFF (Click to monitor microphone)'
          }
          position="bottom"
        >
          <button
            onClick={onToggleHearMyself}
            style={
              hearMyself
                ? {
                    backgroundColor: `${accent}25`,
                    borderColor: accent,
                    color: accent,
                  }
                : undefined
            }
            className={`h-[30px] w-[30px] flex items-center justify-center rounded-[8px] border transition-all cursor-pointer box-border ${
              hearMyself
                ? ''
                : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] text-[#8a92a6] hover:text-white hover:border-[var(--theme-border-hover,#323650)]'
            }`}
          >
            <Headphones size={14} />
          </button>
        </Tooltip>

        {/* Global Stop All Panic Button */}
        <Tooltip
          content={
            <div className="flex items-center gap-1.5">
              <span>Stop All Sounds</span>
              <span
                className="px-1.5 py-0.5 rounded bg-black/60 font-mono text-[10.5px] border border-white/10 font-bold"
                style={{ color: accent }}
              >
                {panicHotkey || 'Esc'}
              </span>
            </div>
          }
          position="bottom"
        >
          <button
            onClick={onStopAll}
            className={`h-[30px] flex items-center justify-center gap-1.5 px-2.5 rounded-[8px] text-[10.5px] font-bold transition-all duration-150 cursor-pointer border box-border ${
              isStopAllActive || hasActiveSounds
                ? 'bg-[#e81123]/20 border-[#e81123] text-[#ff4d5e] hover:bg-[#e81123]/30'
                : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] text-[#8a92a6] hover:text-white hover:border-[var(--theme-border-hover,#323650)]'
            }`}
          >
            <Square size={12} className={isStopAllActive || hasActiveSounds ? 'fill-current text-[#ff4d5e]' : 'text-[#8a92a6]'} />
            <span className={isStopAllActive || hasActiveSounds ? 'font-bold text-[#ff4d5e]' : 'font-semibold text-white'}>
              Stop
            </span>
            {activeSoundsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#ff4d5e] text-white text-[9px] font-mono font-bold leading-tight">
                {activeSoundsCount}
              </span>
            )}
          </button>
        </Tooltip>

        {/* Primary "+ Add Sound" Button (Icon only) */}
        <div className="relative">
          <Tooltip content="Add Sound (YouTube / Local File)" position="bottom">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              style={{
                backgroundColor: accent,
              }}
              className="h-[30px] w-[30px] rounded-[8px] text-black flex items-center justify-center transition-all hover:brightness-110 active:scale-98 cursor-pointer box-border"
            >
              <Plus size={16} className="stroke-[3]" />
            </button>
          </Tooltip>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-[var(--theme-bg-surface,#12131d)] border border-[var(--theme-border,#222436)] rounded-[14px] shadow-[0_10px_35px_rgba(0,0,0,0.8)] py-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenYouTubeSearch();
                }}
                className="w-full px-3.5 py-2 text-left text-[11.5px] font-semibold text-white hover:bg-white/10 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-5 h-5 rounded-md bg-[#ff0000]/15 flex items-center justify-center text-[#ff0000]">
                  <Video size={13} />
                </div>
                <div>
                  <div className="leading-tight">YouTube Audio</div>
                  <div className="text-[10px] font-normal text-[#9ea7ba]">Search, preview & download</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  onImportLocalFiles();
                }}
                className="w-full px-3.5 py-2 text-left text-[11.5px] font-semibold text-white hover:bg-white/10 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: `${accent}20`, color: accent }}
                >
                  <FolderOpen size={13} />
                </div>
                <div>
                  <div className="leading-tight">Local Audio File</div>
                  <div className="text-[10px] font-normal text-[#9ea7ba]">MP3, WAV, OGG, FLAC</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
