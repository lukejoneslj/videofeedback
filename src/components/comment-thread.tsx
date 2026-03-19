"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  Send,
  MessageSquare,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getAuthorColor } from "@/components/author-picker";

export type Comment = {
  id: string;
  text: string;
  timestamp: number;
  author: string;
  resolved: boolean;
  annotationDataUrl?: string | null;
  createdAt: any;
};

type Reply = {
  id: string;
  text: string;
  author: string;
  createdAt: any;
};

function AuthorAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const c = getAuthorColor(name || "?");
  const dim = size === "sm" ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-[11px]";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold uppercase shrink-0`}
      style={{ background: c.bg, border: `1.5px solid ${c.border}`, color: c.text }}
      title={name}
    >
      {(name || "?")[0]}
    </div>
  );
}

function formatTime(seconds: number) {
  const d = new Date(seconds * 1000);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const ss = d.getUTCSeconds().toString().padStart(2, "0");
  if (hh) return `${hh}:${mm.toString().padStart(2, "0")}:${ss}`;
  return `${mm}:${ss}`;
}

export function CommentThread({
  comment,
  videoId,
  currentAuthor,
  onSeek,
  onViewAnnotation,
  index,
}: {
  comment: Comment;
  videoId: string;
  currentAuthor: string;
  onSeek: (time: number) => void;
  onViewAnnotation: (dataUrl: string | null) => void;
  index: number;
}) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [hoveredAnnotation, setHoveredAnnotation] = useState(false);

  // Listen to replies sub-collection
  useEffect(() => {
    const q = query(
      collection(db, `videos/${videoId}/comments/${comment.id}/replies`),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reply)));
    });
    return () => unsub();
  }, [videoId, comment.id]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    await addDoc(collection(db, `videos/${videoId}/comments/${comment.id}/replies`), {
      text: replyText.trim(),
      author: currentAuthor,
      createdAt: serverTimestamp(),
    });
    setReplyText("");
  };

  const handleToggleResolve = async () => {
    await updateDoc(doc(db, `videos/${videoId}/comments`, comment.id), {
      resolved: !comment.resolved,
    });
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, `videos/${videoId}/comments`, comment.id));
  };

  const handleDeleteReply = async (replyId: string) => {
    await deleteDoc(
      doc(db, `videos/${videoId}/comments/${comment.id}/replies`, replyId)
    );
  };

  const replyCount = replies.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative rounded-xl border transition-all ${
        comment.resolved
          ? "bg-[#0a0e0a] border-green-900/30 opacity-70 hover:opacity-100"
          : "bg-[#0e0e11] hover:bg-[#15151a] border-white/5 hover:border-accent/30"
      }`}
    >
      {/* Main comment */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => onSeek(comment.timestamp)}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <AuthorAvatar name={comment.author} />
            <span className="text-xs font-medium text-foreground/70">
              {comment.author}
            </span>
            <span className="text-xs font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              {formatTime(comment.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Resolve toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleResolve();
              }}
              className={`p-1.5 rounded-md transition-all ${
                comment.resolved
                  ? "text-green-400 hover:text-green-300 bg-green-400/10"
                  : "text-muted-foreground hover:text-green-400 hover:bg-green-400/10"
              }`}
              title={comment.resolved ? "Unresolve" : "Resolve"}
            >
              {comment.resolved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p
          className={`text-sm leading-relaxed font-medium ${
            comment.resolved
              ? "line-through text-muted-foreground"
              : "text-foreground/90"
          }`}
        >
          {comment.text}
        </p>

        {/* Annotation thumbnail */}
        {comment.annotationDataUrl && (
          <div
            className="mt-3 relative rounded-lg overflow-hidden border border-white/5 cursor-pointer group/anno"
            onMouseEnter={() => {
              setHoveredAnnotation(true);
              onViewAnnotation(comment.annotationDataUrl!);
            }}
            onMouseLeave={() => {
              setHoveredAnnotation(false);
              onViewAnnotation(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(comment.timestamp);
              onViewAnnotation(comment.annotationDataUrl!);
            }}
          >
            <img
              src={comment.annotationDataUrl}
              alt="Annotation"
              className="w-full h-20 object-contain bg-black/60 group-hover/anno:brightness-125 transition-all"
            />
            <div className="absolute bottom-1 right-1 bg-black/70 text-[10px] text-accent px-1.5 py-0.5 rounded-md flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              Annotation
            </div>
          </div>
        )}
      </div>

      {/* Footer: reply count + reply toggle */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReplyInput(!showReplyInput);
            if (!showReplies && replyCount > 0) setShowReplies(true);
          }}
          className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Reply
        </button>

        {replyCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowReplies(!showReplies);
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            {showReplies ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {comment.resolved && (
          <span className="text-[10px] text-green-500/80 font-mono ml-auto flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        )}
      </div>

      {/* Replies */}
      <AnimatePresence>
        {showReplies && replies.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="px-4 py-3 space-y-3 ml-4 border-l-2 border-accent/15">
              {replies.map((reply) => (
                <div key={reply.id} className="group/reply flex items-start gap-2">
                  <AuthorAvatar name={reply.author} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-foreground/60">
                      {reply.author}
                    </span>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {reply.text}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReply(reply.id)}
                    className="opacity-0 group-hover/reply:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply input */}
      <AnimatePresence>
        {showReplyInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleReply}
              className="px-4 pb-3 pt-1 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <AuthorAvatar name={currentAuthor} size="sm" />
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 h-8 text-xs bg-black/40 border-white/10 focus-visible:ring-accent"
                autoFocus
              />
              <Button
                type="submit"
                size="icon"
                disabled={!replyText.trim()}
                className="w-7 h-7 rounded-md bg-accent/80 hover:bg-accent text-black disabled:opacity-40"
              >
                <Send className="w-3 h-3" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
