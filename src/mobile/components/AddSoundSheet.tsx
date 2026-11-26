import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Download,
  Upload,
  Music,
  Check,
  Loader2,
  Flame,
} from 'lucide-react';
import { YouTubeSearchResult } from '../../types';

interface AddSoundSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchYouTube: (query: string) => Promise<YouTubeSearchResult[]>;
  onLoadTrending: () => Promise<YouTubeSearchResult[]>;
  onDownloadYouTube: (item: YouTubeSearchResult) => Promise<void>;
  onUploadFile: (file: File, title?: string) => Promise<void>;
}

export const AddSoundSheet: React.FC<AddSoundSheetProps> = ({
  isOpen,
  onClose,
  onSearchYouTube,
  onLoadTrending,
  onDownloadYouTube,
  onUploadFile,
}) => {
  const [mode, setMode] = useState<'youtube' | 'upload'>('youtube');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    if (results.length === 0 && !query.trim()) {
      setSearching(true);
      onLoadTrending()
        .then((items) => setResults(items || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setErrorMsg(null);
    try {
      const items = await onSearchYouTube(q);
      setResults(items || []);
      if (!items || items.length === 0) {
        setErrorMsg('No YouTube results found. Try another search or paste a YouTube URL.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'YouTube search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleAddYouTube = async (item: YouTubeSearchResult) => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    setErrorMsg(null);
    try {
      await onDownloadYouTube(item);
      setAddedIds((prev) => ({ ...prev, [item.id]: true }));
      navigator.vibrate?.(15);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      await onUploadFile(selectedFile, uploadTitle.trim() || undefined);
      setSelectedFile(null);
      setUploadTitle('');
      navigator.vibrate?.(15);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[86dvh] flex flex-col rounded-t-3xl bg-[#10141f] border-t border-x border-white/[0.14] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-3 pb-3 border-b border-white/[0.08] space-y-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-white">Add Sound to PC</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] text-slate-300 flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X size={17} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                setMode('youtube');
                setErrorMsg(null);
              }}
              className={`h-9 rounded-lg text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'youtube' ? 'bg-white/[0.12] text-white' : 'text-slate-400'
              }`}
            >
              <Search size={14} />
              <span>YouTube Search / URL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setErrorMsg(null);
              }}
              className={`h-9 rounded-lg text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'upload' ? 'bg-white/[0.12] text-white' : 'text-slate-400'
              }`}
            >
              <Upload size={14} />
              <span>Phone Audio File</span>
            </button>
          </div>
        </div>

        {/* Body */}
        {mode === 'youtube' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <form onSubmit={handleSearch} className="px-5 py-3 flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search YouTube or paste URL..."
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[13.5px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !query.trim()}
                style={{ backgroundColor: 'var(--accent)' }}
                className="h-11 px-4 rounded-xl text-slate-950 font-bold text-[13px] disabled:opacity-45 cursor-pointer shrink-0"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
              </button>
            </form>

            {errorMsg && (
              <div className="mx-5 mb-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[12px]">
                {errorMsg}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-2.5">
              {!query.trim() && results.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 pt-1">
                  <Flame size={12} className="text-amber-400" />
                  <span>Trending Audio</span>
                </div>
              )}

              {searching && results.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-slate-400 text-[13px]">
                  <Loader2 size={22} className="animate-spin text-sky-400" />
                  <span>Fetching YouTube results via PC...</span>
                </div>
              ) : (
                results.map((item) => {
                  const isDownloading = downloadingId === item.id;
                  const isAdded = !!addedIds[item.id];
                  return (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center gap-3"
                    >
                      <div className="relative w-16 h-12 rounded-xl overflow-hidden bg-white/[0.05] shrink-0">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500">
                            <Music size={16} />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 font-mono-tabular text-[9.5px] font-semibold text-white">
                          {item.duration}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white line-clamp-2 leading-snug">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.channel}</p>
                      </div>

                      <button
                        type="button"
                        disabled={!!downloadingId || isAdded}
                        onClick={() => handleAddYouTube(item)}
                        style={!isAdded ? { backgroundColor: 'var(--accent)' } : undefined}
                        className={`h-9 px-3 rounded-xl font-bold text-[12px] flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
                          isAdded
                            ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-400'
                            : 'text-slate-950 disabled:opacity-45 active:scale-95'
                        }`}
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Adding</span>
                          </>
                        ) : isAdded ? (
                          <>
                            <Check size={14} />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-5 space-y-5 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                  setErrorMsg(null);
                }
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-10 px-4 rounded-2xl border border-dashed border-white/[0.18] bg-white/[0.03] active:bg-white/[0.07] flex flex-col items-center gap-2.5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center text-sky-400">
                <Upload size={22} />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-white">
                  {selectedFile ? selectedFile.name : 'Choose Audio File or Voice Memo'}
                </p>
                <p className="text-[11.5px] text-slate-400 mt-1">
                  MP3, WAV, M4A, OGG, FLAC, WebM (up to 35 MB)
                </p>
              </div>
            </button>

            {selectedFile && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Pad Title
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Sound name"
                    className="w-full h-11 px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[14px] text-white focus:outline-none focus:border-sky-400"
                  />
                </div>

                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleUploadSubmit}
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="w-full h-12 rounded-xl text-slate-950 font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={17} className="animate-spin" />
                      <span>Uploading to PC...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={17} />
                      <span>Send to PC Soundboard</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[12px]">
                {errorMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
