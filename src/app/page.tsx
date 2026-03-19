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
  getDocs,
  doc,
  where,
  limit,
  serverTimestamp,
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
} from "lucide-react";

import {
  AuthorPickerModal,
  AuthorBadge,
  getStoredAuthor,
} from "@/components/author-picker";
import { CommentThread, type Comment } from "@/components/comment-thread";
import { AnnotationCanvas } from "@/components/annotation-canvas";

import ReactPlayer from "react-player";

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
    <>
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
    </>
  );
}

function VideoReviewerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [mounted, setMounted] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(searchParams.get("id"));
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [recentVideos, setRecentVideos] = useState<any[]>([]);

  // Author
  const [author, setAuthor] = useState<string | null>(null);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);

  // Annotations
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [viewAnnotation, setViewAnnotation] = useState<string | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Resolved filter
  const [showResolved, setShowResolved] = useState(true);

  const playerRef = useRef<any>(null);

  // Load author from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const storedAuthor = getStoredAuthor();
    if (storedAuthor) {
      setAuthor(storedAuthor);
    } else {
      setShowAuthorPicker(true);
    }
  }, []);

  // Sync videoId setting to the browser URL
  useEffect(() => {
    if (!mounted) return;
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
    if (videoId) {
      if (currentParams.get("id") !== videoId) {
        currentParams.set("id", videoId);
        currentParams.delete("video");
        router.push(`/?${currentParams.toString()}`);
      }
    } else {
      if (currentParams.has("id") || currentParams.has("video")) {
        currentParams.delete("id");
        currentParams.delete("video");
        router.push(`/?${currentParams.toString()}`);
      }
    }
  }, [videoId, searchParams, router, mounted]);

  // Load video URL from Firestore when videoId changes
  useEffect(() => {
    if (!videoId) {
      setVideoUrl("");
      setComments([]);
      return;
    }
    
    // If videoUrl is already set (e.g. from handleLoadVideo optimistic update), we don't need to fetch
    if (videoUrl) return;

    const fetchVideo = async () => {
      try {
        const snap = await getDoc(doc(db, "videos", videoId));
        if (snap.exists()) {
          setVideoUrl(snap.data().url);
        } else {
          console.error("Video document not found for ID:", videoId);
        }
      } catch (err) {
        console.error("Error fetching video doc:", err);
      }
    };
    fetchVideo();
  }, [videoId, videoUrl]);

  const handleLoadVideo = async () => {
    if (!inputUrl.trim() || !author) {
      alert("Please enter a URL and make sure you are signed in.");
      return;
    }
    
    try {
      // First, try to find an existing video session
      const urlQuery = query(collection(db, "videos"), where("url", "==", inputUrl.trim()), limit(1));
      const snap = await getDocs(urlQuery);
      
      if (!snap.empty) {
        setVideoId(snap.docs[0].id);
        setVideoUrl(snap.docs[0].data().url);
      } else {
        // Create a new session if none exists
        const docRef = await addDoc(collection(db, "videos"), {
          url: inputUrl.trim(),
          createdAt: serverTimestamp(),
          author: author,
        });
        setVideoId(docRef.id);
        setVideoUrl(inputUrl.trim());
      }
      setInputUrl("");
    } catch (e: any) {
      console.error("Error loading video:", e);
      alert(`Error loading video: ${e.message}`);
    }
  };

  // Subscribe to Recent Videos
  useEffect(() => {
    const q = query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(12));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecentVideos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to comments
  // Subscribe to comments
  useEffect(() => {
    if (!videoId) return;

    const q = query(
      collection(db, `videos/${videoId}/comments`),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Comment[];
      setComments(fetched);
    });

    return () => unsubscribe();
  }, [videoUrl]);

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
    if (!annotationMode) {
      setIsPlaying(false);
    }
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

      <div className="min-h-screen flex flex-col md:flex-row bg-background overflow-hidden font-sans">
        {/* LEFT: Video Area */}
        <div className="flex-1 flex flex-col relative">
          {/* Header bar */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-16 border-b border-border/40 flex items-center px-6 justify-between bg-card/30 backdrop-blur-xl z-10"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/50 shadow-[0_0_15px_rgba(255,42,109,0.3)]">
                <Video className="w-4 h-4 text-primary" />
              </div>
              <h1 className="font-heading font-bold text-xl tracking-tight text-foreground">
                NEON{" "}
                <span className="text-primary font-bold">REVIEWER</span>
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* URL input */}
              <div className="flex items-center gap-2 max-w-md w-full">
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inputUrl) {
                      handleLoadVideo();
                    }
                  }}
                  placeholder="Paste Video URL (YouTube, Vimeo, MP4)..."
                  className="bg-black/50 border-white/10 focus-visible:ring-primary h-9 font-mono text-xs"
                />
                <Button
                  size="sm"
                  className="bg-white text-black hover:bg-gray-200 shrink-0"
                  onClick={handleLoadVideo}
                >
                  Load
                </Button>
              </div>

              {/* Author badge */}
              {author && (
                <AuthorBadge
                  author={author}
                  onEdit={() => setShowAuthorPicker(true)}
                />
              )}
            </div>
          </motion.div>

          {/* Video Player Wrapper */}
          <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-secondary/40 via-background to-background relative">
            {/* Glowing orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            {!videoId || !videoUrl ? (
              /* Empty state / Recent Videos */
              <div className="w-full h-full flex flex-col items-center justify-center p-8 z-10 overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-center max-w-md w-full mb-12"
                >
                  <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(255,42,109,0.15)]">
                    <Video className="w-10 h-10 text-primary/60" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold mb-2">
                    Start a Review Session
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Paste a YouTube, Vimeo, or MP4 URL in the bar above. Or select a recent session below to continue reviewing.
                  </p>
                </motion.div>

                {recentVideos.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="w-full max-w-4xl"
                  >
                    <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase mb-4 px-2">Recent Sessions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentVideos.map((video) => (
                        <button
                          key={video.id}
                          onClick={() => {
                            setVideoId(video.id);
                            setVideoUrl(video.url);
                          }}
                          className="flex flex-col text-left p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all group"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <Video className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 truncate">
                              <p className="text-sm font-medium text-foreground truncate">
                                {video.url.replace(/^https?:\/\/(www\.)?/, '')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Added by <span className="text-white/80">{video.author}</span>
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground/50 mt-auto flex items-center justify-between">
                            <span>ID: {video.id.slice(0, 8)}</span>
                            <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">Review &rarr;</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
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
                  onProgress={(p) => setCurrentTime(p?.playedSeconds || 0)}
                />

                {/* Annotation canvas overlay */}
                <AnnotationCanvas
                  active={annotationMode}
                  onSave={handleAnnotationSave}
                  onCancel={() => setAnnotationMode(false)}
                  viewDataUrl={viewAnnotation}
                  containerRef={videoContainerRef}
                />

                {/* Annotate button (floating, top-right) */}
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

        {/* RIGHT: Comment Sidebar */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full md:w-[400px] lg:w-[450px] border-l border-white/10 bg-card/80 backdrop-blur-3xl flex flex-col shadow-2xl z-20"
        >
          {/* Sidebar header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/20">
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
              Feedback & Notes
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

            {/* Toggle resolved visibility */}
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
                    Load a video to start reviewing
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
