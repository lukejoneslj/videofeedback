"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

const STORAGE_KEY = "vr-author";

// Color palette for avatars — assigned by hashing the name
const AVATAR_COLORS = [
  { bg: "rgba(255,42,109,0.25)", border: "rgba(255,42,109,0.5)", text: "#ff2a6d" },
  { bg: "rgba(5,217,232,0.25)", border: "rgba(5,217,232,0.5)", text: "#05d9e8" },
  { bg: "rgba(255,196,0,0.25)", border: "rgba(255,196,0,0.5)", text: "#ffc400" },
  { bg: "rgba(0,255,135,0.25)", border: "rgba(0,255,135,0.5)", text: "#00ff87" },
  { bg: "rgba(157,78,255,0.25)", border: "rgba(157,78,255,0.5)", text: "#9d4eff" },
];

export function getAuthorColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getStoredAuthor(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function AuthorBadge({
  author,
  onEdit,
}: {
  author: string;
  onEdit: () => void;
}) {
  const color = getAuthorColor(author);
  return (
    <button
      onClick={onEdit}
      className="flex items-center gap-2 group cursor-pointer"
      title="Change name"
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold uppercase transition-all group-hover:scale-110"
        style={{
          background: color.bg,
          border: `1.5px solid ${color.border}`,
          color: color.text,
        }}
      >
        {author[0]}
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors hidden sm:inline">
        {author}
      </span>
      <Pencil className="w-3 h-3 text-muted-foreground/50 group-hover:text-accent transition-colors" />
    </button>
  );
}

export function AuthorPickerModal({
  open,
  onSelect,
  initialValue,
}: {
  open: boolean;
  onSelect: (name: string) => void;
  initialValue?: string;
}) {
  const [name, setName] = useState(initialValue || "");

  useEffect(() => {
    if (open && initialValue) setName(initialValue);
  }, [open, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    onSelect(trimmed);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm mx-4"
          >
            <div className="rounded-2xl border border-white/10 bg-[#111116] p-8 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">
              {/* Decorative glow */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />

              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4 shadow-[0_0_25px_rgba(255,42,109,0.2)]">
                  <span className="text-2xl">✍️</span>
                </div>
                <h2 className="font-heading text-xl font-bold tracking-tight">
                  Who&apos;s reviewing?
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Enter your name so your editor knows who left the feedback.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Luke, Editor Mike..."
                  className="bg-black/50 border-white/10 h-11 text-center font-medium focus-visible:ring-primary"
                  maxLength={24}
                />
                <Button
                  type="submit"
                  disabled={!name.trim()}
                  className="w-full bg-primary hover:bg-primary/80 text-white h-11 font-semibold shadow-[0_0_20px_rgba(255,42,109,0.35)] disabled:shadow-none transition-all"
                >
                  Start Reviewing
                </Button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
