"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trash2, Send, Clock, Video, Loader2 } from "lucide-react";
import { format } from "date-fns";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

type Comment = {
  id: string;
  text: string;
  timestamp: number;
  createdAt: any;
};

export default function VideoReviewer() {
  const [mounted, setMounted] = useState(false);
  const [videoUrl, setVideoUrl] = useState("https://www.youtube.com/watch?v=LXb3EKWsInQ");
  const [inputUrl, setInputUrl] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const playerRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    // Unique session ID for comments on this specific video URL
    const videoId = btoa(videoUrl).slice(0, 20); 
    
    const q = query(
      collection(db, `videos/${videoId}/comments`),
      orderBy("timestamp", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(fetchedComments);
    });

    return () => unsubscribe();
  }, [videoUrl]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const time = playerRef.current?.getCurrentTime() || 0;
    const videoId = btoa(videoUrl).slice(0, 20);

    try {
      await addDoc(collection(db, `videos/${videoId}/comments`), {
        text: newComment,
        timestamp: time,
        createdAt: serverTimestamp(),
      });
      setNewComment("");
    } catch (error) {
      console.error("Error adding comment: ", error);
    }
  };

  const handleDelete = async (id: string) => {
    const videoId = btoa(videoUrl).slice(0, 20);
    await deleteDoc(doc(db, `videos/${videoId}/comments`, id));
  };

  const seekTo = (time: number) => {
    playerRef.current?.seekTo(time, "seconds");
    setIsPlaying(true);
  };

  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) {
      return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  if (!mounted) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" /></div>;

  return (
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
              NEON <span className="text-primary font-bold">REVIEWER</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3 max-w-md w-full ml-8">
            <Input 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste Video URL (YouTube, Vimeo, MP4)..." 
              className="bg-black/50 border-white/10 focus-visible:ring-primary h-9 font-mono text-xs"
            />
            <Button 
              size="sm" 
              className="bg-white text-black hover:bg-gray-200"
              onClick={() => {
                if(inputUrl) setVideoUrl(inputUrl);
                setInputUrl("");
              }}
            >
              Load
            </Button>
          </div>
        </motion.div>

        {/* Video Player Wrapper */}
        <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-secondary/40 via-background to-background relative">
          
          {/* Subtle glowing orb behind video */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 ring-1 ring-white/10 relative z-10 bg-black group"
          >
            <ReactPlayer
              {...({
                ref: playerRef,
                url: videoUrl,
                width: "100%",
                height: "100%",
                controls: true,
                playing: isPlaying,
                onPlay: () => setIsPlaying(true),
                onPause: () => setIsPlaying(false),
                onProgress: (p: any) => setCurrentTime(p?.playedSeconds || 0),
                config: {
                  youtube: { playerVars: { origin: typeof window !== 'undefined' ? window.location.origin : '' } }
                }
              } as any)}
            />
          </motion.div>
        </div>
      </div>

      {/* RIGHT: Comment Sidebar */}
      <motion.div 
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full md:w-[400px] lg:w-[450px] border-l border-white/10 bg-card/80 backdrop-blur-3xl flex flex-col shadow-2xl z-20"
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/20">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            Feedback & Notes
            <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-mono border border-primary/30">
              {comments.length}
            </span>
          </h2>
        </div>

        <ScrollArea className="flex-1 p-5">
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {comments.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="text-center text-muted-foreground pt-12 text-sm flex flex-col items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full border border-white/5 border-dashed flex items-center justify-center">
                    <Clock className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  No comments yet. Play the video and add feedback!
                </motion.div>
              ) : (
                comments.map((comment, i) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    className="group relative bg-[#0e0e11] hover:bg-[#15151a] border border-white/5 hover:border-accent/40 rounded-xl p-4 transition-all hover:shadow-[0_0_20px_rgba(5,217,232,0.1)] cursor-pointer"
                    onClick={() => seekTo(comment.timestamp)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 border border-white/10">
                          <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                            U
                          </AvatarFallback>
                        </Avatar>
                        <span 
                          className="text-xs font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20"
                        >
                          {formatTime(comment.timestamp)}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(comment.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                      {comment.text}
                    </p>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Comment Input Box */}
        <div className="p-5 border-t border-white/10 bg-black/40 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          
          <form onSubmit={handleAddComment} className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Adding comment at <strong className="text-primary font-mono">{formatTime(currentTime)}</strong>
              </span>
            </div>
            
            <div className="relative group">
              <Textarea 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment(e);
                  }
                }}
                placeholder="Write your feedback... (Press Enter to send)"
                className="min-h-[100px] resize-none bg-[#0a0a0c] border-white/10 focus-visible:ring-primary mb-3 text-sm rounded-xl p-4 pr-12 transition-all"
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
      </motion.div>
      
    </div>
  );
}
