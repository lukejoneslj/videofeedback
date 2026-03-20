"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  addDoc,
  getDoc,
  doc,
  limit,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Video,
  Loader2,
  Send,
  Pen,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  X,
  ArrowLeft,
} from "lucide-react";

import {
  AuthorPickerModal,
  AuthorBadge,
  getStoredAuthor,
} from "@/components/author-picker";
import { CommentThread, type Comment } from "@/components/comment-thread";
import { AnnotationCanvas } from "@/components/annotation-canvas";

import ReactPlayer from "react-player";

// ─── YouTube Video ID extraction ─────────────────────────────────────────────
// Handles ALL YouTube URL formats robustly and returns the 11-char video ID.
// This ID is used directly as the Firestore document ID so any URL format
// pointing to the same video will always resolve to the same document / comments.
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Patterns to try in order:
  const patterns = [
    // Standard: youtube.com/watch?v=ID  (also handles &t= etc)
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/i,
    // Short: youtu.be/ID
    /(?:youtu\.be\/)([\w-]{11})/i,
    // Already just an 11-char ID  
    /^([\w-]{11})$/,
  ];

  for (const pattern of patterns) {
    const m = trimmed.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Build a canonical embed-able YouTube URL from a videoId
function buildYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// ─── Video Player ─────────────────────────────────────────────────────────────
function VideoPlayer({
  url,
  playing,
  playerRef,
  onPlay,
  onPause,
  onProgress,
}: {
  url: string;
  playing: boolean;
  playerRef: React.RefObject<any>;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (state: { playedSeconds: number }) => void;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  return (
    <ReactPlayer
      ref={playerRef}
      url={url}
      width="100%"
      height="100%"
      controls
      playing={playing}
      onPlay={onPlay}
      onPause={onPause}
      onProgress={onProgress}
    />
  );
}

// ─── Add Video Modal ──────────────────────────────────────────────────────────
function AddVideoModal({
  open,
  author,
  onSave,
  onClose,
}: {
  open: boolean;
  author: string;
  onSave: (videoId: string, url: string, title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset fields when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setUrl("");
      setError("");
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    setError("");
    if (!title.trim()) {
      setError("Please enter a title for this video.");
      return;
    }
    const videoId = extractYouTubeId(url.trim());
    if (!videoId) {
      setError(
        "Couldn't find a YouTube video ID in that URL. Make sure you paste a valid YouTube link (youtube.com/watch?v=... or youtu.be/...)."
      );
      return;
    }
    setSaving(true);
    try {
      const canonicalUrl = buildYouTubeUrl(videoId);
      // setDoc with merge:true → creates doc if missing, never overwrites existing comments
      await setDoc(
        doc(db, "videos", videoId),
        {
          title: title.trim(),
          url: canonicalUrl,
          createdAt: serverTimestamp(),
          addedBy: author,
        },
        { merge: true }
      );
      onSave(videoId, canonicalUrl, title.trim());
    } catch (e: any) {
      console.error("Error saving video:", e);
      setError("Something went wrong saving to Firestore. Check the console.");
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && !saving) handleSave();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-4"
          >
            <div
              className="pointer-events-auto w-full max-w-md bg-[#0e0e12] border border-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] overflow-hidden"
              onKeyDown={handleKeyDown}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_15px_rgba(255,42,109,0.25)]">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="font-heading font-bold text-lg text-foreground">
                    Add Video
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Fields */}
              <div className="px-6 py-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Video Title
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setError("");
                    }}
                    placeholder='e.g. "Edit v3 – March rough cut"'
                    className="bg-black/50 border-white/10 focus-visible:ring-primary h-10 text-sm"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    YouTube Link
                  </label>
                  <Input
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setError("");
                    }}
                    placeholder="youtube.com/watch?v=... or youtu.be/..."
                    className="bg-black/50 border-white/10 focus-visible:ring-primary h-10 text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Any YouTube URL format works — including unlisted links.
                  </p>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex items-center gap-3 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !title.trim() || !url.trim()}
                  className="bg-primary hover:bg-primary/80 text-white shadow-[0_0_20px_rgba(255,42,109,0.35)] min-w-[80px]"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page Content ────────────────────────────────────────────────────────
function VideoReviewerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(
    searchParams.get("id")
  );
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [savedVideos, setSavedVideos] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Author
  const [author, setAuthor] = useState<string | null>(null);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);

  // Annotations
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(
    null
  );
  const [viewAnnotation, setViewAnnotation] = useState<string | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Resolved filter
  const [showResolved, setShowResolved] = useState(true);

  const playerRef = useRef<any>(null);

  // Mount + author load
  useEffect(() => {
    setMounted(true);
    const storedAuthor = getStoredAuthor();
    if (storedAuthor) {
      setAuthor(storedAuthor);
    } else {
      setShowAuthorPicker(true);
    }
  }, []);

  // Sync videoId → browser URL
  useEffect(() => {
    if (!mounted) return;
    const currentParams = new URLSearchParams(
      Array.from(searchParams.entries())
    );
    if (videoId) {
      if (currentParams.get("id") !== videoId) {
        currentParams.set("id", videoId);
        router.push(`/?${currentParams.toString()}`);
      }
    } else {
      if (currentParams.has("id")) {
        currentParams.delete("id");
        router.push(`/?${currentParams.toString()}`);
      }
    }
  }, [videoId, searchParams, router, mounted]);

  // When videoId changes but videoUrl isn't set yet (e.g. loaded from URL param), fetch from Firestore
  useEffect(() => {
    if (!videoId) {
      setVideoUrl("");
      setVideoTitle("");
      setComments([]);
      return;
    }
    if (videoUrl) return; // already set optimistically

    const fetchVideo = async () => {
      try {
        const snap = await getDoc(doc(db, "videos", videoId));
        if (snap.exists()) {
          const data = snap.data();
          setVideoUrl(data.url || buildYouTubeUrl(videoId));
          setVideoTitle(data.title || "");
        } else {
          // Fallback: build a watchable URL from the ID alone
          setVideoUrl(buildYouTubeUrl(videoId));
        }
      } catch (err) {
        console.error("Error fetching video doc:", err);
      }
    };
    fetchVideo();
  }, [videoId, videoUrl]);

  // Subscribe to saved videos dashboard
  useEffect(() => {
    const q = query(
      collection(db, "videos"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setSavedVideos(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
      },
      (error) => {
        console.error("Error fetching saved videos:", error);
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to comments for current video
  useEffect(() => {
    if (!videoId) return;
    const q = query(
      collection(db, `videos/${videoId}/comments`),
      orderBy("timestamp", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setComments(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Comment))
      );
    });
    return () => unsub();
  }, [videoId]);

  // Called after AddVideoModal saves to Firestore
  const handleVideoSaved = (
    ytId: string,
    url: string,
    title: string
  ) => {
    setVideoId(ytId);
    setVideoUrl(url);
    setVideoTitle(title);
    setShowAddModal(false);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !author || !videoId) return;

    const time = currentTime;
    try {
      await addDoc(collection(db, `videos/${videoId}/comments`), {
        text: newComment,
        timestamp: time,
        author,
        resolved: false,
        annotationDataUrl: pendingAnnotation || null,
        createdAt: serverTimestamp(),
      });
      setNewComment("");
      setPendingAnnotation(null);
    } catch (error) {
      console.error("Error adding comment: ", error);
    }
  };

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seekTo(time, "seconds");
    setIsPlaying(true);
  }, []);

  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, "0");
    if (hh) return `${hh}:${mm.toString().padStart(2, "0")}:${ss}`;
    return `${mm}:${ss}`;
  };

  const handleAnnotationSave = (dataUrl: string) => {
    setPendingAnnotation(dataUrl);
    setAnnotationMode(false);
    setIsPlaying(false);
  };

  const toggleAnnotationMode = () => {
    if (!annotationMode) setIsPlaying(false);
    setAnnotationMode(!annotationMode);
  };

  const filteredComments = showResolved
    ? comments
    : comments.filter((c) => !c.resolved);

  const resolvedCount = comments.filter((c) => c.resolved).length;

  if (!mounted)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );

  return (
    <>
      {/* Author Picker */}
      <AuthorPickerModal
        open={showAuthorPicker}
        initialValue={author || ""}
        onSelect={(name) => {
          setAuthor(name);
          setShowAuthorPicker(false);
        }}
      />

      {/* Add Video Modal */}
      <AddVideoModal
        open={showAddModal}
        author={author || ""}
        onSave={handleVideoSaved}
        onClose={() => setShowAddModal(false)}
      />

      <div className="min-h-screen flex flex-col md:flex-row bg-background overflow-hidden font-sans">
        {/* ── LEFT: Video Area ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col relative">
          {/* Header */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-16 border-b border-border/40 flex items-center px-6 justify-between bg-card/30 backdrop-blur-xl z-10 gap-4"
          >
            {/* Logo + back-to-dashboard */}
            <div className="flex items-center gap-3">
              {videoId && (
                <button
                  onClick={() => {
                    setVideoId(null);
                    setVideoUrl("");
                    setVideoTitle("");
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                  title="Back to dashboard"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/50 shadow-[0_0_15px_rgba(255,42,109,0.3)]">
                <Video className="w-4 h-4 text-primary" />
              </div>
              <h1 className="font-heading font-bold text-xl tracking-tight text-foreground">
                NEON{" "}
                <span className="text-primary font-bold">REVIEWER</span>
              </h1>
              {videoTitle && (
                <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[260px]">
                  — {videoTitle}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* + Add Video button */}
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary/60 transition-all gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Video
              </Button>

              {/* Author badge */}
              {author && (
                <AuthorBadge
                  author={author}
                  onEdit={() => setShowAuthorPicker(true)}
                />
              )}
            </div>
          </motion.div>

          {/* Video / Dashboard area */}
          <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-secondary/40 via-background to-background relative">
            {/* Glow orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            {!videoId || !videoUrl ? (
              /* ── Dashboard ── */
              <div className="w-full h-full flex flex-col items-center justify-center p-8 z-10 overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-center max-w-md w-full mb-10"
                >
                  <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(255,42,109,0.15)]">
                    <Video className="w-10 h-10 text-primary/60" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold mb-2">
                    Video Review Dashboard
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    Add a video to start a review session. All comments sync
                    in real-time across every reviewer.
                  </p>
                  <Button
                    onClick={() => setShowAddModal(true)}
                    className="bg-primary hover:bg-primary/80 text-white shadow-[0_0_25px_rgba(255,42,109,0.4)] gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Video
                  </Button>
                </motion.div>

                {/* Saved videos grid */}
                {savedVideos.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="w-full max-w-4xl"
                  >
                    <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4 px-1">
                      Saved Videos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedVideos.map((video) => {
                        const displayTitle =
                          video.title ||
                          video.url?.replace(
                            /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
                            ""
                          ) ||
                          video.id;
                        return (
                          <motion.button
                            key={video.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setVideoId(video.id);
                              setVideoUrl(
                                video.url || buildYouTubeUrl(video.id)
                              );
                              setVideoTitle(video.title || "");
                            }}
                            className="flex flex-col text-left p-5 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-primary/30 transition-all group"
                          >
                            {/* Thumbnail placeholder */}
                            <div className="w-full aspect-video rounded-lg bg-black/60 mb-4 overflow-hidden border border-white/5 relative flex items-center justify-center">
                              <img
                                src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                                alt={displayTitle}
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                  <Video className="w-5 h-5 text-white ml-0.5" />
                                </div>
                              </div>
                            </div>

                            <p className="text-sm font-semibold text-foreground truncate mb-1">
                              {displayTitle}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Added by{" "}
                              <span className="text-white/70">
                                {video.addedBy || video.author || "—"}
                              </span>
                            </p>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              /* ── Video Player ── */
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: 0.8,
                  delay: 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 ring-1 ring-white/10 relative z-10 bg-black group"
                ref={videoContainerRef}
              >
                <VideoPlayer
                  url={videoUrl}
                  playing={isPlaying}
                  playerRef={playerRef}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onProgress={(p) =>
                    setCurrentTime(p?.playedSeconds || 0)
                  }
                />

                {/* Annotation canvas overlay */}
                <AnnotationCanvas
                  active={annotationMode}
                  onSave={handleAnnotationSave}
                  onCancel={() => setAnnotationMode(false)}
                  viewDataUrl={viewAnnotation}
                  containerRef={videoContainerRef}
                />

                {/* Annotate button */}
                {!annotationMode && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    onClick={toggleAnnotationMode}
                    className="absolute top-3 right-3 z-40 bg-[#111116]/90 backdrop-blur-sm border border-white/10 hover:border-primary/50 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                  >
                    <Pen className="w-3.5 h-3.5" />
                    Annotate
                  </motion.button>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Comment Sidebar ────────────────────────────────────── */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full md:w-[400px] lg:w-[450px] border-l border-white/10 bg-card/80 backdrop-blur-3xl flex flex-col shadow-2xl z-20"
        >
          {/* Sidebar header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/20">
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
              Feedback &amp; Notes
              <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-mono border border-primary/30">
                {comments.length}
              </span>
              {resolvedCount > 0 && (
                <span className="bg-green-500/15 text-green-400 text-xs px-2 py-0.5 rounded-full font-mono border border-green-500/25">
                  <CheckCircle2 className="w-3 h-3 inline mr-0.5 -mt-px" />
                  {resolvedCount}
                </span>
              )}
            </h2>

            {resolvedCount > 0 && (
              <button
                onClick={() => setShowResolved(!showResolved)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                title={showResolved ? "Hide resolved" : "Show resolved"}
              >
                {showResolved ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {showResolved ? "Hide" : "Show"} resolved
              </button>
            )}
          </div>

          {/* Comments list */}
          <ScrollArea className="flex-1 p-5">
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {!videoUrl ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-muted-foreground pt-12 text-sm flex flex-col items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-full border border-white/5 border-dashed flex items-center justify-center">
                      <Video className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    Select a video to start reviewing
                  </motion.div>
                ) : filteredComments.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-muted-foreground pt-12 text-sm flex flex-col items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-full border border-white/5 border-dashed flex items-center justify-center">
                      <Clock className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    {!showResolved && resolvedCount > 0
                      ? "All comments are resolved!"
                      : "No comments yet. Play the video and add feedback!"}
                  </motion.div>
                ) : (
                  filteredComments.map((comment, i) => (
                    <CommentThread
                      key={comment.id}
                      comment={comment}
                      videoId={videoId || ""}
                      currentAuthor={author || "Anonymous"}
                      onSeek={seekTo}
                      onViewAnnotation={setViewAnnotation}
                      index={i}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>

          {/* Comment Input Box */}
          {videoUrl && (
            <div className="p-5 border-t border-white/10 bg-black/40 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

              {/* Pending annotation preview */}
              <AnimatePresence>
                {pendingAnnotation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-3"
                  >
                    <div className="relative rounded-lg overflow-hidden border border-primary/30 bg-black/40">
                      <img
                        src={pendingAnnotation}
                        alt="Pending annotation"
                        className="w-full h-16 object-contain"
                      />
                      <button
                        onClick={() => setPendingAnnotation(null)}
                        className="absolute top-1 right-1 bg-black/80 text-destructive rounded-md p-0.5 text-xs hover:bg-destructive/20 transition-all"
                      >
                        ✕
                      </button>
                      <div className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[10px] text-primary font-mono bg-black/60 px-1 py-0.5 rounded">
                        <Pen className="w-2.5 h-2.5" />
                        Annotation attached
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleAddComment} className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Adding comment at{" "}
                    <strong className="text-primary font-mono">
                      {formatTime(currentTime)}
                    </strong>
                  </span>
                </div>

                <div className="relative group">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment(e);
                      }
                    }}
                    placeholder="Write your feedback... (Press Enter to send)"
                    className="min-h-[80px] resize-none bg-[#0a0a0c] border-white/10 focus-visible:ring-primary mb-3 text-sm rounded-xl p-4 pr-12 transition-all"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!newComment.trim()}
                    className="absolute bottom-6 right-3 rounded-lg w-8 h-8 bg-primary hover:bg-primary/80 transition-all shadow-[0_0_15px_rgba(255,42,109,0.4)] disabled:opacity-50 disabled:shadow-none"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </Button>
                </div>
              </form>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function VideoReviewer() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      }
    >
      <VideoReviewerContent />
    </Suspense>
  );
}
