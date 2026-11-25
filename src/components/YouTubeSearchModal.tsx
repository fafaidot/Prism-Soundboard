import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  Play,
  Square,
  Download,
  Scissors,
  Loader2,
  TrendingUp,
  RefreshCw,
  Check,
  Layers,
  Music2,
} from 'lucide-react';
import { YouTubeSearchResult } from '../types';
import prismLogo from '../assets/Prism.png';

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  onDownloadSound: (result: YouTubeSearchResult, openTrimmer?: boolean) => Promise<void>;
  isHUD?: boolean;
}

export const YouTubeSearchModal: React.FC<YouTubeSearchModalProps> = ({
  isOpen,
  onClose,
  accentColor,
  onDownloadSound,
  isHUD = false,
}) => {
  const accent = accentColor || 'var(--accent-color)';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isTrendingMode, setIsTrendingMode] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      loadTrendingMusic();
    }

    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    };
  }, [isOpen]);

  const loadTrendingMusic = async () => {
    if (!window.soundboardAPI?.getTrendingMusic) return;
    setIsSearching(true);
    setIsTrendingMode(true);
    try {
      const trending = await window.soundboardAPI.getTrendingMusic();
      setResults(trending || []);
      setSelectedIds([]);
    } catch (err) {
      console.error('Failed to load trending music:', err);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      loadTrendingMusic();
      return;
    }
    if (!window.soundboardAPI) return;

    setIsSearching(true);
    setIsTrendingMode(false);
    try {
      const res = await window.soundboardAPI.searchYouTube(query.trim());
      setResults(res || []);
      setSelectedIds([]);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTogglePreview = async (item: YouTubeSearchResult) => {
    if (previewingId === item.id) {
      if (previewAudio) {
        previewAudio.pause();
        setPreviewAudio(null);
      }
      setPreviewingId(null);
      return;
    }

    if (previewAudio) {
      previewAudio.pause();
    }

    setPreviewingId(item.id);
    try {
      const streamUrl = await window.soundboardAPI?.getYouTubePreviewUrl(item.url);
      if (streamUrl) {
        const audio = new Audio(streamUrl);
        audio.onended = () => {
          setPreviewingId(null);
          setPreviewAudio(null);
        };
        audio.play().catch(console.warn);
        setPreviewAudio(audio);
      } else {
        setPreviewingId(null);
      }
    } catch (err) {
      console.warn('Preview error:', err);
      setPreviewingId(null);
    }
  };

  const handleClose = () => {
    if (previewAudio) previewAudio.pause();
    onClose();
  };

  const handleDownload = async (item: YouTubeSearchResult, openTrimmer = false) => {
    if (previewAudio) {
      previewAudio.pause();
      setPreviewingId(null);
    }

    setDownloadingIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    try {
      await onDownloadSound(item, openTrimmer);
    } finally {
      setDownloadingIds((prev) => prev.filter((id) => id !== item.id));
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
    }
  };

  const handleToggleSelect = (item: YouTubeSearchResult) => {
    setSelectedIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
  };

  const handleDownloadSelected = async () => {
    if (selectedIds.length === 0) return;
    const itemsToDownload = results.filter((r) => selectedIds.includes(r.id));
    await Promise.all(itemsToDownload.map((item) => handleDownload(item, false)));
  };

  const isDirectUrl = query.trim().startsWith('http://') || query.trim().startsWith('https://');

  return (
    <div
      data-hud-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-none frosted-backdrop ${
        isHUD ? 'bg-black/30' : 'bg-black/35'
      }`}
    >
      <div
        data-hud-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden h-[640px] max-h-[90vh]"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight">
              YouTube audio search
            </h3>
            <p className="text-[11px] text-slate-400">
              Search songs, browse trending music, or paste a video link
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Search Bar & Sub-toolbar */}
        <form onSubmit={handleSearch} className="px-6 py-3 bg-white/[0.015] border-b border-white/[0.08] shrink-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search song, artist, or paste YouTube link..."
                className="w-full pl-8 pr-7 py-1.5 bg-white/[0.04] border border-white/[0.08] focus:border-accent rounded-lg text-[12px] text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    loadTrendingMusic();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="px-3.5 py-1.5 rounded-lg text-[11.5px] font-medium text-slate-950 bg-accent hover:brightness-110 active:scale-95 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-40"
            >
              {isSearching ? (
                <Loader2 size={13} className="animate-spin" />
              ) : isDirectUrl ? (
                <Download size={13} />
              ) : (
                <Search size={13} />
              )}
              <span>{isDirectUrl ? 'Download link' : 'Search'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                loadTrendingMusic();
              }}
              title="Refresh trending songs"
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={isSearching && isTrendingMode ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Sub-toolbar */}
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  loadTrendingMusic();
                }}
                className={`py-0.5 font-medium flex items-center gap-1.5 border-b transition-colors cursor-pointer ${
                  isTrendingMode && !query
                    ? 'border-accent text-accent'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp size={11} />
                <span>Trending hits</span>
              </button>

              {!isTrendingMode && query && (
                <span className="text-slate-400">
                  Results for <strong className="text-white font-medium">"{query}"</strong>
                </span>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-accent font-medium flex items-center gap-1 tabular-nums">
                  <Layers size={11} />
                  <span>{selectedIds.length} selected</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-slate-400 hover:text-white cursor-pointer underline text-[10.5px]"
                >
                  Deselect
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  className="px-2.5 py-0.5 rounded-md font-medium hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-xs flex items-center gap-1 text-slate-950 bg-accent text-[11px]"
                >
                  <Download size={11} />
                  <span>Download ({selectedIds.length})</span>
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Scrollable Tracks List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 divide-y divide-white/[0.06] bg-transparent">
          {isSearching ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-2.5">
              <Loader2 size={24} className="animate-spin text-accent" />
              <p className="text-[12px] text-slate-400">
                {isTrendingMode ? 'Loading trending music...' : 'Searching YouTube...'}
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-2">
              <Music2 size={24} className="text-slate-500" />
              <p className="text-[12px] text-slate-400">
                No songs found. Try a song name or paste a YouTube URL.
              </p>
            </div>
          ) : (
            results.map((item) => {
              const isDownloading = downloadingIds.includes(item.id);
              const isSelected = selectedIds.includes(item.id);
              const isPreviewing = previewingId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleSelect(item)}
                  className={`px-2.5 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer group ${
                    isSelected
                      ? 'bg-accent/10'
                      : 'hover:bg-white/[0.05]'
                  }`}
                >
                  {/* Left: Checkbox + Thumbnail & Title */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(item);
                      }}
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-accent text-slate-950 font-bold'
                          : 'border border-white/20 bg-white/[0.03]'
                      }`}
                    >
                      {isSelected && <Check size={10} strokeWidth={3} />}
                    </div>

                    <div
                      className="relative w-12 h-9 rounded-md overflow-hidden bg-[#0e1219] border border-white/[0.08] shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePreview(item);
                      }}
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      <div
                        className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                          isPreviewing
                            ? 'bg-black/60 text-accent opacity-100'
                            : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isPreviewing ? (
                          <Square size={12} className="fill-current" />
                        ) : (
                          <Play size={12} className="fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h4
                        className="text-[12px] font-medium text-white truncate"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 tabular-nums">
                        {item.channel || 'YouTube'} {item.duration ? `· ${item.duration}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(item)}
                      title={isPreviewing ? 'Stop preview' : 'Listen preview'}
                      className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                        isPreviewing
                          ? 'bg-accent/20 border-accent/60 text-accent'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-white'
                      }`}
                    >
                      {isPreviewing ? <Square size={11} className="fill-current" /> : <Play size={11} className="fill-current ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, true)}
                      className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-medium text-slate-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Scissors size={11} className="text-accent" />
                      <span>Trim</span>
                    </button>

                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, false)}
                      className="px-3 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer hover:brightness-110 active:scale-95 shadow-xs disabled:opacity-50 text-slate-950 bg-accent"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <>
                          <Download size={11} />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <span className="text-[11.5px] text-slate-400 tabular-nums">
            {results.length} tracks loaded
          </span>

          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 rounded-xl text-[12px] font-bold text-slate-950 bg-accent hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
