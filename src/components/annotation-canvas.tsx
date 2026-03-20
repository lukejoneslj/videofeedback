"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Check, X, Circle, Camera, Loader2 } from "lucide-react";

const COLORS = [
  { value: "#ff2a6d", label: "Pink" },
  { value: "#05d9e8", label: "Cyan" },
  { value: "#ffc400", label: "Yellow" },
  { value: "#ffffff", label: "White" },
  { value: "#00ff87", label: "Green" },
];

type Tool = "pen" | "arrow";

interface AnnotationCanvasProps {
  active: boolean;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  viewDataUrl?: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// ── Screen capture helper ─────────────────────────────────────────────────────
// Uses getDisplayMedia (OS-level, bypasses iframe cross-origin restriction)
// to grab the exact visible frame the user paused on. Crops to the video
// container's bounding rect.
async function captureVideoFrame(
  containerRef: React.RefObject<HTMLDivElement | null>
): Promise<string | null> {
  try {
    const stream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { frameRate: 1 },
      // Chrome 94+ hint to skip the picker and pre-select current tab
      preferCurrentTab: true,
    });

    const track = stream.getVideoTracks()[0];

    // Grab frame using ImageCapture API (preferred) or fallback to video element
    let bitmap: ImageBitmap;
    if (typeof ImageCapture !== "undefined") {
      const capture = new (ImageCapture as any)(track);
      bitmap = await capture.grabFrame();
    } else {
      // Safari / Firefox fallback
      const vid = document.createElement("video");
      vid.srcObject = stream;
      vid.muted = true;
      await new Promise<void>((res) => {
        vid.onloadedmetadata = () => res();
      });
      await vid.play();
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      bitmap = await createImageBitmap(vid);
      vid.pause();
      vid.remove();
    }

    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());

    // Crop to the video container position within the full captured frame
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // The display capture is at the physical pixel resolution of the screen
    const scaleX = bitmap.width / (window.innerWidth * dpr);
    const scaleY = bitmap.height / (window.innerHeight * dpr);

    const sx = rect.left * dpr * scaleX;
    const sy = rect.top * dpr * scaleY;
    const sw = rect.width * dpr * scaleX;
    const sh = rect.height * dpr * scaleY;

    const crop = document.createElement("canvas");
    crop.width = rect.width;
    crop.height = rect.height;
    const ctx = crop.getContext("2d")!;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, rect.width, rect.height);

    return crop.toDataURL("image/jpeg", 0.88);
  } catch {
    // User cancelled the picker or browser denied — silently return null
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AnnotationCanvas({
  active,
  onSave,
  onCancel,
  viewDataUrl,
  containerRef,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0].value);
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<Tool>("pen");
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);

  // Background frame captured via screen capture
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Reset when annotation mode is closed
  useEffect(() => {
    if (!active) {
      setBgImageUrl(null);
      historyRef.current = [];
    }
  }, [active]);

  // Resize canvas to match container
  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      const ctx = canvas.getContext("2d");
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = rect.width;
      canvas.height = rect.height;
      if (imageData && ctx) ctx.putImageData(imageData, 0, 0);
    }
  }, [containerRef]);

  useEffect(() => {
    if (active) {
      syncSize();
      window.addEventListener("resize", syncSize);
      return () => window.removeEventListener("resize", syncSize);
    }
  }, [active, syncSize]);

  // View-mode: render saved annotation image
  useEffect(() => {
    if (viewDataUrl && canvasRef.current) {
      syncSize();
      const ctx = canvasRef.current.getContext("2d");
      const img = new Image();
      img.onload = () => {
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      };
      img.src = viewDataUrl;
    }
  }, [viewDataUrl, syncSize]);

  // ── Capture handler ──────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    setCapturing(true);
    try {
      const url = await captureVideoFrame(containerRef);
      if (url) {
        setBgImageUrl(url);
        // Clear canvas so drawings start fresh on top of the new background
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          historyRef.current = [];
        }
      }
    } finally {
      setCapturing(false);
    }
  }, [containerRef]);

  // ── Drawing ──────────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (historyRef.current.length > 30) historyRef.current.shift();
    }
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!active) return;
    e.preventDefault();
    saveHistory();
    const pos = getPos(e);
    if (tool === "arrow") {
      setArrowStart(pos);
    } else {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
    lastPointRef.current = pos;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !active) return;
    e.preventDefault();
    const pos = getPos(e);
    if (tool === "pen") {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    }
    lastPointRef.current = pos;
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const headLen = 16;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(angle - Math.PI / 6),
      to.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(angle + Math.PI / 6),
      to.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (tool === "arrow" && arrowStart && lastPointRef.current) {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawArrow(ctx, arrowStart, lastPointRef.current);
      setArrowStart(null);
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.closePath();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      saveHistory();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx && historyRef.current.length > 0) {
      const prev = historyRef.current.pop()!;
      ctx.putImageData(prev, 0, 0);
    }
  };

  // Save = composite background frame + canvas drawings into one image
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const composite = document.createElement("canvas");
    composite.width = canvas.width;
    composite.height = canvas.height;
    const ctx = composite.getContext("2d")!;

    const finalize = () => {
      // Draw annotations on top
      ctx.drawImage(canvas, 0, 0);
      const dataUrl = composite.toDataURL("image/jpeg", 0.88);
      onSave(dataUrl);
      // Clean up
      const drawCtx = canvas.getContext("2d");
      drawCtx?.clearRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
      setBgImageUrl(null);
    };

    if (bgImageUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, composite.width, composite.height);
        finalize();
      };
      img.src = bgImageUrl;
    } else {
      // Dark background fallback
      ctx.fillStyle = "#0a0a0e";
      ctx.fillRect(0, 0, composite.width, composite.height);
      finalize();
    }
  };

  // ── View mode ────────────────────────────────────────────────────────────
  if (viewDataUrl && !active) {
    return (
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
        style={{ opacity: 0.85 }}
      />
    );
  }

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Background frame (rendered as <img> behind the drawing canvas) */}
          <AnimatePresence>
            {bgImageUrl && (
              <motion.img
                key="bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                src={bgImageUrl}
                alt="Captured frame"
                className="absolute inset-0 w-full h-full object-cover z-28 pointer-events-none select-none"
                draggable={false}
              />
            )}
          </AnimatePresence>

          {/* Semi-transparent dark overlay when no background captured yet */}
          {!bgImageUrl && (
            <div className="absolute inset-0 z-28 bg-black/60 pointer-events-none" />
          )}

          {/* Drawing canvas (transparent — drawings only) */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full z-30"
            style={{
              cursor:
                tool === "arrow"
                  ? "crosshair"
                  : "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><circle cx=%228%22 cy=%228%22 r=%224%22 fill=%22%23ff2a6d%22 opacity=%220.9%22/></svg>') 8 8, crosshair",
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />

          {/* "No background" hint overlay */}
          {!bgImageUrl && !capturing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-29 flex items-center justify-center pointer-events-none"
            >
              <div className="text-center text-white/40 text-sm max-w-xs px-4">
                <Camera className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Click <strong className="text-white/60">Capture Frame</strong> below to snapshot the paused video</p>
              </div>
            </motion.div>
          )}

          {/* Capturing spinner overlay */}
          {capturing && (
            <div className="absolute inset-0 z-35 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="text-center text-white space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-sm font-medium">Select this tab in the browser dialog…</p>
                <p className="text-xs text-white/50">Click "Share" then choose "This Tab"</p>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#111116]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-[0_15px_50px_rgba(0,0,0,0.5)]"
          >
            {/* 📸 Capture Frame button */}
            <button
              onClick={handleCapture}
              disabled={capturing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                bgImageUrl
                  ? "text-green-400 border-green-500/30 bg-green-400/10 hover:bg-green-400/20"
                  : "text-primary border-primary/40 bg-primary/10 hover:bg-primary/20"
              } disabled:opacity-50`}
              title="Capture the current video frame as background"
            >
              {capturing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              {bgImageUrl ? "Recapture" : "Capture Frame"}
            </button>

            <div className="w-px h-6 bg-white/10" />

            {/* Tool selector */}
            <div className="flex items-center gap-1 border-r border-white/10 pr-3 mr-1">
              <button
                onClick={() => setTool("pen")}
                className={`p-1.5 rounded-lg transition-all ${
                  tool === "pen" ? "bg-white/15 text-white" : "text-muted-foreground hover:text-white"
                }`}
                title="Freehand"
              >
                <Pen className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool("arrow")}
                className={`p-1.5 rounded-lg transition-all ${
                  tool === "arrow" ? "bg-white/15 text-white" : "text-muted-foreground hover:text-white"
                }`}
                title="Arrow"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="19" x2="19" y2="5" />
                  <polyline points="12 5 19 5 19 12" />
                </svg>
              </button>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-1.5 border-r border-white/10 pr-3 mr-1">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className="w-5 h-5 rounded-full transition-all hover:scale-125"
                  style={{
                    background: c.value,
                    boxShadow:
                      color === c.value
                        ? `0 0 0 2px #111116, 0 0 0 3.5px ${c.value}`
                        : "none",
                    opacity: color === c.value ? 1 : 0.55,
                  }}
                  title={c.label}
                />
              ))}
            </div>

            {/* Line width */}
            <div className="flex items-center gap-1.5 border-r border-white/10 pr-3 mr-1">
              {[2, 4, 7].map((w) => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${
                    lineWidth === w ? "bg-white/15" : "hover:bg-white/5"
                  }`}
                  title={`Width ${w}`}
                >
                  <Circle
                    className="text-white"
                    style={{ width: w + 4, height: w + 4 }}
                    fill="currentColor"
                  />
                </button>
              ))}
            </div>

            {/* Actions */}
            <button
              onClick={handleUndo}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-all text-xs font-mono"
              title="Undo"
            >
              ↩
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Clear drawings"
            >
              <Eraser className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />

            <Button
              size="sm"
              onClick={handleSave}
              className="bg-primary hover:bg-primary/80 text-white h-8 px-3 text-xs font-semibold shadow-[0_0_15px_rgba(255,42,109,0.3)]"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Save &amp; Comment
            </Button>
            <button
              onClick={() => {
                handleClear();
                setBgImageUrl(null);
                onCancel();
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-all"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
