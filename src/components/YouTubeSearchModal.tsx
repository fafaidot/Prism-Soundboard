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
  const accent = accentColor || 'var(--accent-color, #38bdf8)';
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

    // Launch all downloads concurrently
    await Promise.all(itemsToDownload.map((item) => handleDownload(item, false)));
  };

  const isDirectUrl = query.trim().startsWith('http://') || query.trim().startsWith('https://');

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (previewAudio) previewAudio.pause();
        onClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-none ${
        isHUD ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/80 backdrop-blur-md'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#0d0f14] border border-[#20232d] rounded-[24px] shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#1c1f29] flex items-center justify-between bg-[#090a0f]">
          <div className="flex items-center gap-3">
            <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain drop-shadow" />
            <div>
              <h2 className="text-[14px] font-extrabold text-white tracking-wide flex items-center gap-2">
                <span>YouTube Music & Downloader</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#38bdf8]/15 text-[#38bdf8] font-extrabold border border-[#38bdf8]/30">
                  Lossless Audio
                </span>
              </h2>
              <p className="text-[11px] text-[#71788e] mt-0.5">
                Browse trending music or paste any YouTube URL to add to your soundboard
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (previewAudio) previewAudio.pause();
              onClose();
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#71788e] hover:text-white bg-white/5 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search Bar Input */}
        <form onSubmit={handleSearch} className="p-4 border-b border-[#1c1f29] bg-[#111317]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#60677c]" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search song, artist, video or paste YouTube URL (https://...)"
                className="w-full pl-10 pr-9 py-2.5 bg-[#171920] border border-[#262a36] rounded-[14px] text-[13px] text-white placeholder-[#60677c] focus:outline-none focus:border-[#38bdf8]/70 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    loadTrendingMusic();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#60677c] hover:text-white cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isSearching}
              style={{
                backgroundColor: accent,
                color: '#000',
              }}
              className="px-5 py-2.5 rounded-[14px] text-[13px] font-bold flex items-center gap-2 disabled:opacity-40 transition-all cursor-pointer hover:brightness-110 active:scale-98 shadow-sm"
            >
              {isSearching ? (
                <Loader2 size={15} className="animate-spin" />
              ) : isDirectUrl ? (
                <Download size={15} />
              ) : (
                <Search size={15} />
              )}
              <span>{isDirectUrl ? 'Download URL' : 'Search'}</span>
            </button>
          </div>

          {/* Section banner: Trending vs Search Results */}
          <div className="mt-3 flex items-center justify-between text-[11px] px-1">
            <div className="flex items-center gap-1.5 text-white/90 font-bold">
              {isTrendingMode ? (
                <>
                  <TrendingUp size={13} className="text-[#38bdf8]" />
                  <span>Trending on YouTube</span>
                  <span className="text-[10px] text-[#60677c] font-normal ml-1">
                    (Official Top Charts)
                  </span>
                </>
              ) : (
                <>
                  <Search size={13} className="text-[#38bdf8]" />
                  <span>Search Results for "{query}"</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                loadTrendingMusic();
              }}
              className="flex items-center gap-1 text-[11px] text-[#71788e] hover:text-[#38bdf8] transition-colors cursor-pointer"
              title="Refresh trending music"
            >
              <RefreshCw size={11} className={isSearching && isTrendingMode ? 'animate-spin' : ''} />
              <span>Refresh Trending</span>
            </button>
          </div>
        </form>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#0d0f14]">
          {/* Multi-Download Bar when items are selected */}
          {selectedIds.length > 0 && (
            <div
              style={{
                borderColor: `${accent}60`,
                backgroundColor: 'rgba(23, 25, 32, 0.98)',
              }}
              className="sticky top-0 z-20 p-2.5 rounded-[16px] border shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2"
            >
              <div className="flex items-center gap-2 pl-2 text-[12px] font-bold text-white">
                <Layers size={15} style={{ color: accent }} />
                <span>
                  {selectedIds.length} song{selectedIds.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#8a92a6] hover:text-white transition-colors cursor-pointer"
                >
                  Deselect all
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  style={{
                    backgroundColor: accent,
                    color: '#000',
                  }}
                  className="px-4 py-1.5 rounded-[10px] hover:brightness-110 text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Download size={13} className="stroke-[2.5]" />
                  <span>Download {selectedIds.length} simultaneously</span>
                </button>
              </div>
            </div>
          )}

          {isSearching && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <Loader2 size={32} className="animate-spin mb-3" style={{ color: accent }} />
              <p className="text-[13px] font-bold text-white">
                {isTrendingMode ? 'Fetching trending music hits...' : 'Searching YouTube...'}
              </p>
              <p className="text-[11px] text-[#71788e] mt-1">Retrieving direct audio streams without ads</p>
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-center text-[#71788e]">
              <div
                className="w-14 h-14 rounded-2xl bg-[#171920] border border-[#20232d] flex items-center justify-center mb-3"
                style={{ color: accent }}
              >
                <Music2 size={26} />
              </div>
              <p className="text-[13px] font-bold text-white">No songs found</p>
              <p className="text-[11px] text-[#60677c] mt-1 max-w-[320px]">
                Try typing a song title or artist name, or paste a direct YouTube link to download it.
              </p>
            </div>
          )}

          {!isSearching &&
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
                    backgroundColor: isSelected ? `${accent}15` : undefined,
                  }}
                  className={`p-2.5 border rounded-[16px] flex items-center justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'shadow-sm'
                      : 'bg-[#13151c] hover:bg-[#181a22] border-[#1f222c] hover:border-[#2f3342]'
                  }`}
                >
                  {/* Select Checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(item);
                    }}
                    style={{
                      backgroundColor: isSelected ? accent : undefined,
                      borderColor: isSelected ? accent : undefined,
                    }}
                    className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                      isSelected ? 'text-black' : 'bg-[#0d0f14] border-[#292c38] hover:border-white/40'
                    }`}
                  >
                    {isSelected && <Check size={12} className="stroke-[3.5]" />}
                  </div>

                  {/* Thumbnail & Play Preview Trigger */}
                  <div
                    className="relative w-16 h-12 rounded-[10px] overflow-hidden bg-black flex-shrink-0 group cursor-pointer shadow"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePreview(item);
                    }}
                  >
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div
                      style={isPreviewing ? { color: accent } : undefined}
                      className={`absolute inset-0 flex items-center justify-center transition-all ${
                        isPreviewing
                          ? 'bg-black/60'
                          : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isPreviewing ? (
                        <Square size={15} className="fill-current" />
                      ) : (
                        <Play size={16} className="fill-current ml-0.5" />
                      )}
                    </div>
                  </div>

                  {/* Center: Title & Channel Info */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className="text-[12.5px] font-bold text-white truncate leading-tight"
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#71788e]">
                      <span className="truncate text-[#9ea6b8]">@{item.channel || 'YouTube'}</span>
                      {item.duration && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-white/70 text-[10.5px]">{item.duration}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div
                    className="flex items-center gap-1.5 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Preview Button */}
                    <button
                      onClick={() => handleTogglePreview(item)}
                      title={isPreviewing ? 'Stop Preview' : 'Listen Preview'}
                      style={
                        isPreviewing
                          ? {
                              backgroundColor: `${accent}25`,
                              borderColor: accent,
                              color: accent,
                            }
                          : undefined
                      }
                      className={`p-2 rounded-[10px] border transition-all cursor-pointer ${
                        isPreviewing
                          ? ''
                          : 'bg-[#191c24] border-[#252834] text-[#9ea6b8] hover:text-white'
                      }`}
                    >
                      {isPreviewing ? (
                        <Square size={13} className="fill-current" />
                      ) : (
                        <Play size={13} className="fill-current" />
                      )}
                    </button>

                    {/* Trim and Add */}
                    <button
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, true)}
                      title="Download & Open Trimmer"
                      className="px-2.5 py-1.5 rounded-[10px] bg-[#191c24] hover:bg-[#222530] border border-[#252834] text-[11px] font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Scissors size={12} style={{ color: accent }} />
                      <span>Trim</span>
                    </button>

                    {/* Direct Add */}
                    <button
                      disabled={isDownloading}
                      onClick={() => handleDownload(item, false)}
                      style={{
                        backgroundColor: accent,
                        color: '#000',
                      }}
                      className="px-3 py-1.5 rounded-[10px] hover:brightness-110 text-[11.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} className="stroke-[2.5]" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
