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
  const accent = accentColor || '#31C5F4';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isTrendingMode, setIsTrendingMode] = useState(true);

  // Fetch real trending music on open
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

  // Simultaneous download single sound
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

  // Toggle selection for bulk download
  const handleToggleSelect = (item: YouTubeSearchResult) => {
    setSelectedIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
  };

  // Download all selected items simultaneously in parallel
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
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-none ${
        isHUD ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/80 backdrop-blur-md'
      }`}
    >
      <div
        data-hud-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden h-[680px] max-h-[92vh] transition-all duration-150"
      >
        {/* Top Header */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/70 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#151B25] border border-[#1B222E] flex items-center justify-center shadow-sm">
              <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide flex items-center gap-2">
                <span>YouTube Music & Downloader</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#151B25] text-[#31C5F4] border border-[#1B222E]">
                  Lossless Audio
                </span>
              </h3>
              <p className="text-[11px] text-[#5A687C]">
                Search tracks, browse trending music hits, or paste direct YouTube URLs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close YouTube Downloader (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Search & URL Bar Header */}
        <form onSubmit={handleSearch} className="px-6 py-3.5 bg-[#0E121A] border-b border-[#1B222E] shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5A687C]"
              />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search song, artist, video or paste URL (https://...)"
                className="w-full pl-9 pr-8 py-2 bg-[#151B25] border border-[#1B222E] rounded-xl text-[12px] text-white placeholder-[#5A687C] focus:outline-none focus:border-[#31C5F4]/50 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    loadTrendingMusic();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A687C] hover:text-white cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isSearching}
              style={{
                backgroundColor: accent,
                color: '#090C12',
              }}
              className="px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:brightness-110 active:scale-95 shadow-md disabled:opacity-40"
            >
              {isSearching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isDirectUrl ? (
                <Download size={14} />
              ) : (
                <Search size={14} />
              )}
              <span>{isDirectUrl ? 'Download URL' : 'Search'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                loadTrendingMusic();
              }}
              title="Refresh trending hits"
              className="p-2 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={isSearching && isTrendingMode ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Sub-toolbar: Trending Indicator & Selection Toolbar */}
          <div className="flex items-center justify-between text-[11px] px-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  loadTrendingMusic();
                }}
                className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isTrendingMode && !query
                    ? 'bg-[#123244] text-[#31C5F4] border border-[#31C5F4]/40'
                    : 'text-[#8E95A5] hover:text-white bg-[#151B25] border border-[#1B222E]'
                }`}
              >
                <TrendingUp size={12} />
                <span>Trending Hits</span>
              </button>

              {!isTrendingMode && query && (
                <span className="text-[#8E95A5] flex items-center gap-1">
                  <span>Results for</span>
                  <strong className="text-white font-semibold">"{query}"</strong>
                </span>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[#31C5F4] font-bold flex items-center gap-1">
                  <Layers size={12} />
                  <span>{selectedIds.length} selected</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[#8E95A5] hover:text-white cursor-pointer underline text-[10.5px]"
                >
                  Deselect all
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  style={{ backgroundColor: accent, color: '#090C12' }}
                  className="px-3 py-1 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm flex items-center gap-1"
                >
                  <Download size={12} />
                  <span>Download ({selectedIds.length})</span>
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Scrollable Tracks List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 bg-[#0B0E14]">
          {isSearching ? (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 size={32} className="animate-spin" style={{ color: accent }} />
              <div className="space-y-1">
                <h4 className="text-[14px] font-bold text-white">
                  {isTrendingMode ? 'Loading Trending Charts...' : 'Searching YouTube...'}
                </h4>
                <p className="text-[11.5px] text-[#5A687C]">
                  Extracting audio streams directly from source
                </p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#151B25] border border-[#1B222E] flex items-center justify-center text-[#5A687C]">
                <Music2 size={26} />
              </div>
              <div className="space-y-1">
                <h4 className="text-[14px] font-bold text-white">No Songs Found</h4>
                <p className="text-[12px] text-[#5A687C] max-w-sm">
                  Try searching for an artist, song title, or paste a YouTube URL to download.
                </p>
              </div>
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
                  style={{
                    borderColor: isSelected ? accent : undefined,
                  }}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-sm ${
                    isSelected
                      ? 'bg-[#151B25] border-[#31C5F4] shadow-[0_0_15px_rgba(49,197,244,0.15)]'
                      : 'bg-[#10141C] hover:bg-[#151B25]/80 border-[#1B222E] hover:border-[#31C5F4]/40'
                  }`}
                >
                  {/* Left: Checkbox + Thumbnail & Play Preview */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(item);
                      }}
                      style={{
                        backgroundColor: isSelected ? accent : undefined,
                        borderColor: isSelected ? accent : undefined,
                      }}
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                        isSelected
                          ? 'text-[#090C12]'
                          : 'bg-[#151B25] border-[#1B222E] group-hover:border-[#31C5F4]/50'
                      }`}
                    >
                      {isSelected && <Check size={12} className="stroke-[3.5]" />}
                    </div>

                    {/* Thumbnail with Preview Play Button */}
                    <div
                      className="relative w-14 h-11 rounded-xl overflow-hidden bg-[#151B25] border border-[#1B222E] flex-shrink-0 group/thumb cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePreview(item);
                      }}
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                      />
                      <div
                        style={isPreviewing ? { color: accent } : undefined}
                        className={`absolute inset-0 flex items-center justify-center transition-all ${
                          isPreviewing
                            ? 'bg-black/60'
                            : 'bg-black/40 text-white opacity-0 group-hover/thumb:opacity-100'
                        }`}
                      >
                        {isPreviewing ? (
                          <Square size={14} className="fill-current" />
                        ) : (
                          <Play size={14} className="fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Title & Channel */}
                    <div className="min-w-0">
                      <h4
                        className="text-[12.5px] font-bold text-white truncate leading-snug"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#5A687C]">
                        <span className="truncate text-[#8E95A5]">@{item.channel || 'YouTube'}</span>
                        {item.duration && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-white/70 text-[10.5px]">
                              {item.duration}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Play Preview button */}
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(item)}
                      title={isPreviewing ? 'Stop Preview' : 'Listen Preview'}
                      style={
                        isPreviewing
                          ? {
                              backgroundColor: `${accent}20`,
                              borderColor: accent,
                              color: accent,
                            }
                          : undefined
                      }
                      className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                        isPreviewing
                          ? ''
                          : 'bg-[#151B25] border-[#1B222E] text-[#8E95A5] hover:text-white'
                      }`}
                    >
                      {isPreviewing ? (
                        <Square size={12} className="fill-current" />
                      ) : (
                        <Play size={12} className="fill-current" />
                      )}
                    </button>

                    {/* Trim & Add */}
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, true)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Scissors size={11} style={{ color: accent }} />
                      <span>Trim</span>
                    </button>

                    {/* Direct Add to Board */}
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, false)}
                      style={{
                        backgroundColor: accent,
                        color: '#090C12',
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-[11.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:brightness-110 active:scale-95 shadow-md disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <>
                          <Download size={11} className="stroke-[2.5]" />
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
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <div className="flex items-center gap-2 text-[11.5px] text-[#5A687C]">
            <span>{results.length} songs loaded</span>
            <span>•</span>
            <span>Direct lossless audio extraction without ads</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              backgroundColor: accent,
              color: '#090C12',
            }}
            className="px-6 py-2 rounded-xl text-[12px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
