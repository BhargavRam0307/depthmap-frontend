"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import {
  Plus, Send, X, ImageIcon, Download, UploadCloud,
  Trash2, RotateCcw, Camera, CameraOff, Loader2,
  Box, Image as ImageIconLucide, ZoomIn, Activity,
  Crosshair, Cpu, Radio, Layers
} from "lucide-react";
import { useDropzone } from "react-dropzone";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface PointCloud {
  xyz:   number[];
  rgb:   number[];
  count: number;
}

interface Result3D {
  depth_raw_b64:   string;
  depth_corr_b64:  string;
  pointcloud_raw:  PointCloud;
  pointcloud_corr: PointCloud;
  delta_d:         number;
  alpha_f:         number;
  fov_deg:         number;
}

interface Message {
  type:       "input" | "output" | "output3d" | "error";
  content?:   string[];
  depthmaps?: string[];
  results?:   Result3D[];
  errorMsg?:  string;
  timestamp?: string;
}

// ── Scanline effect CSS ───────────────────────────────────────────────────────
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

  :root {
    --c-bg:       #020d0a;
    --c-surface:  #061410;
    --c-border:   #0d3528;
    --c-border2:  #0a2a1f;
    --c-green:    #00ff88;
    --c-green2:   #00cc66;
    --c-cyan:     #00e5ff;
    --c-amber:    #ffb300;
    --c-red:      #ff3d3d;
    --c-dim:      #1a4a35;
    --c-text:     #7fffd4;
    --c-text2:    #4da87a;
    --font-mono:  'Share Tech Mono', monospace;
    --font-disp:  'Orbitron', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--c-bg);
    color: var(--c-text);
    font-family: var(--font-mono);
    overflow: hidden;
  }

  /* Scanline overlay */
  .scanlines::after {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.08) 2px,
      rgba(0,0,0,0.08) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  /* Corner brackets */
  .corner-tl::before, .corner-tr::after,
  .corner-bl::before, .corner-br::after {
    content: '';
    position: absolute;
    width: 12px; height: 12px;
    border-color: var(--c-green);
    border-style: solid;
  }
  .corner-tl::before { top:0; left:0;  border-width: 1px 0 0 1px; }
  .corner-tr::after  { top:0; right:0; border-width: 1px 1px 0 0; }
  .corner-bl::before { bottom:0; left:0;  border-width: 0 0 1px 1px; }
  .corner-br::after  { bottom:0; right:0; border-width: 0 1px 1px 0; }

  /* Glow pulse */
  @keyframes glow-pulse {
    0%,100% { box-shadow: 0 0 4px var(--c-green), 0 0 8px var(--c-green2); }
    50%      { box-shadow: 0 0 8px var(--c-green), 0 0 20px var(--c-green2), 0 0 40px rgba(0,255,136,0.2); }
  }
  .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }

  /* Blink cursor */
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  .blink { animation: blink 1s step-end infinite; }

  /* Slide in */
  @keyframes slide-in-up {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .slide-in { animation: slide-in-up 0.25s ease forwards; }

  /* Radar ring */
  @keyframes radar-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .radar-spin { animation: radar-spin 3s linear infinite; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--c-bg); }
  ::-webkit-scrollbar-thumb { background: var(--c-dim); border-radius: 2px; }

  /* Range sliders */
  input[type=range] { -webkit-appearance: none; height: 2px; background: var(--c-border); border-radius: 1px; outline: none; }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; cursor: pointer;
    border: 1px solid;
  }
  input[type=range].green-slider::-webkit-slider-thumb { background: var(--c-green); border-color: var(--c-green2); box-shadow: 0 0 6px var(--c-green); }
  input[type=range].cyan-slider::-webkit-slider-thumb  { background: var(--c-cyan);  border-color: var(--c-cyan);   box-shadow: 0 0 6px var(--c-cyan); }

  /* Tab active */
  .tab-active-raw   { background: rgba(0,229,255,0.1);  color: var(--c-cyan);  border-color: rgba(0,229,255,0.4); }
  .tab-active-corr  { background: rgba(0,255,136,0.1);  color: var(--c-green); border-color: rgba(0,255,136,0.4); }
  .tab-active-depth { background: rgba(255,179,0,0.1);  color: var(--c-amber); border-color: rgba(255,179,0,0.4); }
  .tab-active-rdepth{ background: rgba(255,61,61,0.08); color: #ff8080;        border-color: rgba(255,61,61,0.3); }
`;

// ── LiveClock ─────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().replace("T", " ").slice(0, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-text2)", fontSize: 10 }}>{t} UTC</span>;
}

// ── PointCloudViewer ──────────────────────────────────────────────────────────
function PointCloudViewer({ pc, label, accentColor }: { pc: PointCloud; label: string; accentColor: string }) {
  const [zScale,    setZScale]    = useState(0.4);
  const [pointSize, setPointSize] = useState(2);

  const { x, y, z, colors, renderedCount } = useMemo(() => {
    const isMobile  = typeof window !== "undefined" && window.innerWidth < 768;
    const MAX_POINTS = isMobile ? 30_000 : pc.count;
    const step = Math.max(1, Math.ceil(pc.count / MAX_POINTS));
    const n    = Math.ceil(pc.count / step);

    const xArr: number[] = new Array(n);
    const yArr: number[] = new Array(n);
    const zArr: number[] = new Array(n);
    const cols: string[] = new Array(n);

    let j = 0;
    for (let i = 0; i < pc.count; i += step) {
      if (j >= n) break;
      xArr[j] =  pc.xyz[i * 3];
      yArr[j] =  pc.xyz[i * 3 + 1];   // already y-up from backend
      zArr[j] =  pc.xyz[i * 3 + 2] * zScale;
      const r = Math.round(pc.rgb[i * 3]     * 255);
      const g = Math.round(pc.rgb[i * 3 + 1] * 255);
      const b = Math.round(pc.rgb[i * 3 + 2] * 255);
      cols[j] = `rgb(${r},${g},${b})`;
      j++;
    }
    return { x: xArr, y: yArr, z: zArr, colors: cols, renderedCount: j };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, zScale]);

  const plotData = useMemo<Plotly.Data[]>(() => [{
    type: "scatter3d" as const,
    mode: "markers"   as const,
    x, y, z,
    marker:    { size: pointSize, color: colors, opacity: 1 },
    hoverinfo: "none" as const,
  }], [x, y, z, colors, pointSize]);

  const layout = useMemo((): Partial<Plotly.Layout> => ({
    paper_bgcolor: "rgba(2,13,10,0)",
    scene: {
      bgcolor:    "rgba(2,13,10,0)",
      xaxis:      { visible: false },
      yaxis:      { visible: false },
      zaxis:      { visible: false },
      aspectmode: "data",
    },
    margin:     { l: 0, r: 0, t: 0, b: 0 },
    uirevision: "constant",
  }), []);

  const config: Partial<Plotly.Config> = {
    displaylogo:    false,
    modeBarButtons: [["zoom3d", "pan3d", "orbitRotation", "resetCameraDefault3d"]],
    responsive:     true,
  };

  const downloadPLY = useCallback(() => {
    const n = pc.count;
    let s = `ply\nformat ascii 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`;
    for (let i = 0; i < n; i++) {
      const px = pc.xyz[i * 3];
      const py = pc.xyz[i * 3 + 1];
      const pz = pc.xyz[i * 3 + 2] * zScale;
      const r  = Math.round(pc.rgb[i * 3]     * 255);
      const g  = Math.round(pc.rgb[i * 3 + 1] * 255);
      const b  = Math.round(pc.rgb[i * 3 + 2] * 255);
      s += `${px.toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)} ${r} ${g} ${b}\n`;
    }
    const url = URL.createObjectURL(new Blob([s], { type: "text/plain" }));
    const a   = document.createElement("a");
    a.href = url; a.download = `pc_${label.toLowerCase()}_${Date.now()}.ply`; a.click();
    URL.revokeObjectURL(url);
  }, [pc, zScale, label]);

  return (
    <div style={{ display:"flex", flexDirection:"column", width:"100%", height:"100%" }}>
      {/* 3D canvas */}
      <div style={{ flex:1, overflow:"hidden", position:"relative", cursor:"move" }}>
        <Plot
          data={plotData} layout={layout} config={config}
          style={{ width:"100%", height:"100%" }}
          useResizeHandler
        />
        {/* HUD overlay */}
        <div style={{
          position:"absolute", top:8, left:8, padding:"4px 8px",
          background:"rgba(2,13,10,0.85)", border:"1px solid var(--c-border)",
          fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)",
          pointerEvents:"none",
        }}>
          <span style={{ color: accentColor }}>{label}</span>
          {" · "}{renderedCount.toLocaleString()} PTS
        </div>
        <button
          onClick={downloadPLY}
          title={`Download ${label} .ply`}
          style={{
            position:"absolute", bottom:8, right:8, padding:"6px 10px",
            background:"rgba(2,13,10,0.9)", border:`1px solid ${accentColor}`,
            color: accentColor, cursor:"pointer", fontFamily:"var(--font-mono)",
            fontSize:9, display:"flex", alignItems:"center", gap:4,
          }}
        >
          <Download size={10} /> PLY
        </button>
      </div>

      {/* Control strip */}
      <div style={{
        padding:"8px 12px", borderTop:"1px solid var(--c-border2)",
        display:"flex", gap:16, background:"rgba(6,20,16,0.95)",
      }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)", width:40 }}>DEPTH-Z</span>
          <input type="range" min="0.1" max="1.5" step="0.05" value={zScale}
            onChange={e => setZScale(parseFloat(e.target.value))}
            className="green-slider" style={{ flex:1 }} />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-green)", width:30 }}>{zScale.toFixed(2)}x</span>
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)", width:40 }}>PT-SZ</span>
          <input type="range" min="1" max="6" step="0.5" value={pointSize}
            onChange={e => setPointSize(parseFloat(e.target.value))}
            className="cyan-slider" style={{ flex:1 }} />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-cyan)", width:30 }}>{pointSize.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Result3DCard ──────────────────────────────────────────────────────────────
type Tab3D = "raw3d" | "corr3d" | "rawdepth" | "corrdepth";

function Result3DCard({ result, index }: { result: Result3D; index: number }) {
  const [tab, setTab] = useState<Tab3D>("corr3d");

  const dl = (b64: string, name: string) => {
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`; a.download = name; a.click();
  };

  const tabs: { id: Tab3D; label: string; cls: string }[] = [
    { id: "corr3d",   label: "PCM CORRECTED 3D",  cls: "tab-active-corr"  },
    { id: "raw3d",    label: "RAW 3D",             cls: "tab-active-raw"   },
    { id: "corrdepth",label: "CORRECTED DEPTH",    cls: "tab-active-depth" },
    { id: "rawdepth", label: "RAW DEPTH",          cls: "tab-active-rdepth"},
  ];

  return (
    <div style={{
      border:"1px solid var(--c-border)", background:"var(--c-surface)",
      position:"relative",
    }} className="corner-tl corner-tr corner-bl corner-br slide-in">
      {/* Tab bar */}
      <div style={{
        display:"flex", alignItems:"center", gap:4, padding:"6px 8px",
        borderBottom:"1px solid var(--c-border2)", flexWrap:"wrap",
        background:"rgba(2,13,10,0.9)",
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700,
              padding:"3px 8px", border:"1px solid transparent", cursor:"pointer",
              letterSpacing:"0.08em", background:"transparent", color:"var(--c-text2)",
              transition:"all 0.15s",
              ...(tab === t.id ? {} : {}),
            }}
            className={tab === t.id ? t.cls : ""}
          >
            {tab === t.id && <span style={{ marginRight:4 }}>▶</span>}{t.label}
          </button>
        ))}
        {/* PCM metrics */}
        <div style={{
          marginLeft:"auto", display:"flex", gap:12, fontFamily:"var(--font-mono)",
          fontSize:9, color:"var(--c-text2)", paddingRight:4,
        }}>
          <span>Δd <span style={{ color:"var(--c-amber)" }}>{result.delta_d > 0 ? "+" : ""}{result.delta_d}</span></span>
          <span>αf <span style={{ color:"var(--c-cyan)" }}>{result.alpha_f}</span></span>
          <span>FOV <span style={{ color:"var(--c-green)" }}>{result.fov_deg}°</span></span>
        </div>
      </div>

      {/* Content area */}
      <div style={{ height: 420, position:"relative" }}>
        {tab === "corr3d" && (
          <PointCloudViewer pc={result.pointcloud_corr} label="PCM CORRECTED" accentColor="var(--c-green)" />
        )}
        {tab === "raw3d" && (
          <PointCloudViewer pc={result.pointcloud_raw} label="RAW MiDaS" accentColor="var(--c-cyan)" />
        )}
        {(tab === "corrdepth" || tab === "rawdepth") && (
          <div style={{
            width:"100%", height:"100%", display:"flex", alignItems:"center",
            justifyContent:"center", padding:12, background:"rgba(2,13,10,0.8)",
            position:"relative",
          }}>
            <img
              src={`data:image/png;base64,${tab === "corrdepth" ? result.depth_corr_b64 : result.depth_raw_b64}`}
              style={{ maxHeight:"100%", maxWidth:"100%", border:"1px solid var(--c-border)", objectFit:"contain" }}
              alt={tab === "corrdepth" ? "Corrected depth" : "Raw MiDaS depth"}
            />
            <button
              onClick={() => dl(
                tab === "corrdepth" ? result.depth_corr_b64 : result.depth_raw_b64,
                `depth_${tab}_${index}.png`
              )}
              style={{
                position:"absolute", bottom:12, right:12, padding:"5px 10px",
                background:"rgba(2,13,10,0.9)", border:"1px solid var(--c-border)",
                cursor:"pointer", color:"var(--c-text2)", fontFamily:"var(--font-mono)", fontSize:9,
                display:"flex", alignItems:"center", gap:4,
              }}
            >
              <Download size={10}/> PNG
            </button>
            {/* Label badge */}
            <div style={{
              position:"absolute", top:12, left:12, padding:"3px 8px",
              background:"rgba(2,13,10,0.9)", border:`1px solid ${tab === "corrdepth" ? "var(--c-amber)" : "rgba(255,61,61,0.4)"}`,
              fontFamily:"var(--font-mono)", fontSize:9,
              color: tab === "corrdepth" ? "var(--c-amber)" : "#ff8080",
            }}>
              {tab === "corrdepth" ? "PCM CORRECTED" : "RAW MiDaS"}
            </div>
          </div>
        )}
      </div>

      {/* Point count footer */}
      <div style={{
        padding:"4px 10px", borderTop:"1px solid var(--c-border2)",
        display:"flex", gap:16, fontFamily:"var(--font-mono)", fontSize:9,
        color:"var(--c-text2)", background:"rgba(2,13,10,0.95)",
      }}>
        <span>RAW: <span style={{ color:"var(--c-cyan)" }}>{result.pointcloud_raw.count.toLocaleString()} pts</span></span>
        <span>CORR: <span style={{ color:"var(--c-green)" }}>{result.pointcloud_corr.count.toLocaleString()} pts</span></span>
        <span style={{ marginLeft:"auto", color:"var(--c-dim)" }}>FRAME {String(index + 1).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

// ── Radar decoration ──────────────────────────────────────────────────────────
function RadarIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ opacity: 0.7 }}>
      <circle cx="18" cy="18" r="16" fill="none" stroke="var(--c-border)" strokeWidth="0.5"/>
      <circle cx="18" cy="18" r="10" fill="none" stroke="var(--c-border)" strokeWidth="0.5"/>
      <circle cx="18" cy="18" r="4"  fill="none" stroke="var(--c-green2)" strokeWidth="0.5"/>
      <g className="radar-spin" style={{ transformOrigin:"18px 18px" }}>
        <line x1="18" y1="18" x2="18" y2="2" stroke="var(--c-green)" strokeWidth="1" strokeOpacity="0.8"/>
        <path d="M18,18 L18,2 A16,16 0 0,1 30,10 Z" fill="var(--c-green)" fillOpacity="0.12"/>
      </g>
      <circle cx="18" cy="18" r="1.5" fill="var(--c-green)"/>
    </svg>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const API_BASE = "https://bhargav0307-depth-reconstruction-api.hf.space";

export default function Home() {
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [images,           setImages]           = useState<File[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isCameraOpen,     setIsCameraOpen]     = useState(false);
  const [cameraZoom,       setCameraZoom]       = useState(1);
  const [mode3D,           setMode3D]           = useState(true);
  const [statusLog,        setStatusLog]        = useState<string[]>(["SYSTEM READY", "AWAITING INPUT"]);

  const initialPinchDist = useRef<number | null>(null);
  const initialZoomRef   = useRef<number>(1);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const pushLog = (msg: string) =>
    setStatusLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 8));

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  const processImage = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = e => {
        const img = new Image();
        img.src   = e.target?.result as string;
        img.onload = () => {
          const MAX = 800;
          let { width: w, height: h } = img;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else       { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/jpeg", 0.8);
        };
      };
      reader.onerror = reject;
    });

  const startCamera = async () => {
    setIsCameraOpen(true); setCameraZoom(1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      pushLog("CAMERA ONLINE");
    } catch { setIsCameraOpen(false); pushLog("CAMERA ACCESS DENIED"); }
  };

  const stopCamera = () => {
    (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
    setIsCameraOpen(false);
    pushLog("CAMERA OFFLINE");
  };

  const capturePhoto = () => {
    if (!canvasRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    const cropW = vw / cameraZoom, cropH = vh / cameraZoom;
    const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;
    const tw = 1024, th = (vh / vw) * tw;
    canvas.width = tw; canvas.height = th;
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, tw, th);
    canvas.toBlob(blob => {
      if (blob) {
        setImages(p => [...p, new File([blob], `cam_${Date.now()}.jpg`, { type: "image/jpeg" })]);
        stopCamera();
        pushLog("FRAME CAPTURED");
      }
    }, "image/jpeg", 0.9);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist.current = Math.sqrt(dx*dx + dy*dy);
      initialZoomRef.current   = cameraZoom;
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      setCameraZoom(Math.min(Math.max(1, initialZoomRef.current * dist / initialPinchDist.current), 5));
    }
  };
  const handleTouchEnd = () => { initialPinchDist.current = null; };
  const handleWheel = (e: React.WheelEvent) =>
    setCameraZoom(z => Math.min(Math.max(1, z + (e.deltaY < 0 ? 0.1 : -0.1)), 5));

  const onDrop = useCallback((files: File[]) => {
    setImages(p => [...p, ...files]);
    pushLog(`${files.length} FILE(S) QUEUED`);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, noClick: true, accept: { "image/*": [] },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { setImages(p => [...p, ...Array.from(e.target.files!)]); pushLog("FILE(S) LOADED"); }
  };

  const removeImage = (i: number) => setImages(images.filter((_, idx) => idx !== i));
  const clearChat   = () => { setMessages([]); setImages([]); setShowConfirmClear(false); setStatusLog(["SESSION CLEARED"]); };

  const handleSubmit = async () => {
    if (!images.length) return;
    setLoading(true); setUploadProgress(0);
    const previews = images.map(f => URL.createObjectURL(f));
    const formData = new FormData();
    try {
      pushLog(`PROCESSING ${images.length} IMAGE(S)…`);
      const blobs = await Promise.all(images.map(processImage));
      blobs.forEach((b, i) => formData.append("files", b, `upload_${i}.jpg`));
      setMessages(p => [...p, {
        type: "input", content: previews,
        timestamp: new Date().toLocaleTimeString(),
      }]);
      setImages([]);
      setTimeout(scrollToBottom, 50);

      if (mode3D) {
        pushLog("STAGE 1: MiDaS DPT_Large…");
        const res = await axios.post(`${API_BASE}/predict-3d`, formData, {
          onUploadProgress: e => {
            const pct = Math.round((e.loaded * 100) / (e.total || 100));
            setUploadProgress(pct);
            if (pct === 100) pushLog("STAGE 2: PCM shift_combined…");
          },
        });
        pushLog("RECONSTRUCTION COMPLETE ✓");
        setMessages(p => [...p, {
          type: "output3d", results: res.data.results,
          timestamp: new Date().toLocaleTimeString(),
        }]);
      } else {
        const res = await axios.post(`${API_BASE}/predict`, formData, {
          onUploadProgress: e =>
            setUploadProgress(Math.round((e.loaded * 100) / (e.total || 100))),
        });
        pushLog("DEPTH MAP READY ✓");
        setMessages(p => [...p, {
          type: "output", depthmaps: res.data.depthmaps,
          timestamp: new Date().toLocaleTimeString(),
        }]);
      }
    } catch (err) {
      console.error(err);
      pushLog("ERROR: INFERENCE FAILED");
      setMessages(p => [...p, { type: "error", errorMsg: "Inference failed. Check backend status." }]);
    } finally {
      setLoading(false); setUploadProgress(0);
      setTimeout(scrollToBottom, 50);
    }
  };

  return (
    <>
      <style>{globalStyles}</style>
      <div
        {...getRootProps()}
        className="scanlines"
        style={{ display:"flex", flexDirection:"column", height:"100vh", background:"var(--c-bg)", overflow:"hidden" }}
      >
        <input {...getInputProps()} />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 20px", borderBottom:"1px solid var(--c-border)",
          background:"rgba(2,13,10,0.95)", backdropFilter:"blur(8px)",
          position:"relative", zIndex:20,
        }}>
          {/* Left: brand */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <RadarIcon />
            <div>
              <div style={{
                fontFamily:"var(--font-disp)", fontSize:14, fontWeight:900,
                color:"var(--c-green)", letterSpacing:"0.15em",
              }}>
                MonoDepth3D
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)", letterSpacing:"0.2em" }}>
                STAGE-1 MiDaS · STAGE-2 PCM · DUAL POINT CLOUD
              </div>
            </div>
          </div>

          {/* Center: status */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:6, height:6, borderRadius:"50%", background:"var(--c-green)",
              boxShadow:"0 0 8px var(--c-green)",
            }} className="glow-pulse"/>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-green)", letterSpacing:"0.15em" }}>
              {loading ? "PROCESSING" : "ACTIVE"}
            </span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-border)", margin:"0 4px" }}>|</span>
            <LiveClock />
          </div>

          {/* Right: controls */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button
              onClick={() => { setMode3D(m => !m); pushLog(mode3D ? "2D MODE ACTIVE" : "3D MODE ACTIVE"); }}
              style={{
                display:"flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)",
                fontSize:9, fontWeight:700, padding:"5px 10px", cursor:"pointer",
                border:`1px solid ${mode3D ? "var(--c-green)" : "var(--c-border)"}`,
                background: mode3D ? "rgba(0,255,136,0.1)" : "transparent",
                color: mode3D ? "var(--c-green)" : "var(--c-text2)",
                letterSpacing:"0.1em",
              }}
            >
              <Box size={11} />
              {mode3D ? "3D MODE" : "2D MODE"}
            </button>

            {messages.length > 0 && (
              !showConfirmClear ? (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  style={{
                    display:"flex", alignItems:"center", gap:4, fontFamily:"var(--font-mono)",
                    fontSize:9, color:"var(--c-text2)", cursor:"pointer",
                    background:"transparent", border:"1px solid var(--c-border2)", padding:"5px 8px",
                  }}
                >
                  <Trash2 size={11} /> CLEAR
                </button>
              ) : (
                <div style={{
                  display:"flex", alignItems:"center", gap:8, padding:"4px 10px",
                  border:"1px solid rgba(255,61,61,0.5)", background:"rgba(255,61,61,0.05)",
                  fontFamily:"var(--font-mono)", fontSize:9,
                }}>
                  <span style={{ color:"var(--c-red)" }}>CONFIRM?</span>
                  <button onClick={clearChat} style={{ color:"#fff", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:9 }}>YES</button>
                  <button onClick={() => setShowConfirmClear(false)} style={{ color:"var(--c-text2)", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:9 }}>NO</button>
                </div>
              )
            )}
          </div>
        </div>

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* Sidebar status log */}
          <div style={{
            width:180, borderRight:"1px solid var(--c-border2)", padding:"12px 0",
            display:"flex", flexDirection:"column", gap:0, overflowY:"auto",
            background:"rgba(6,20,16,0.6)",
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)",
              padding:"0 12px 8px", borderBottom:"1px solid var(--c-border2)",
              letterSpacing:"0.12em",
            }}>
              ▸ SYS LOG
            </div>
            {statusLog.map((line, i) => (
              <div key={i} style={{
                fontFamily:"var(--font-mono)", fontSize:8,
                color: i === 0 ? "var(--c-green)" : "var(--c-dim)",
                padding:"4px 12px", borderBottom:"1px solid rgba(13,53,40,0.3)",
              }}>
                {line}
              </div>
            ))}

            {/* Sidebar metadata */}
            <div style={{ marginTop:"auto", padding:"12px", borderTop:"1px solid var(--c-border2)" }}>
              {[
                { label:"MODEL",  val:"DPT_Large" },
                { label:"STAGE2", val:"PVCNN" },
                { label:"CORR",   val:"shift_combined" },
                { label:"FOV",    val:"60.0°" },
              ].map(r => (
                <div key={r.label} style={{
                  display:"flex", justifyContent:"space-between",
                  fontFamily:"var(--font-mono)", fontSize:8,
                  color:"var(--c-text2)", padding:"2px 0",
                }}>
                  <span style={{ color:"var(--c-dim)" }}>{r.label}</span>
                  <span>{r.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Feed */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* ── Chat feed ─────────────────────────────────────────────────── */}
            <div ref={scrollRef} style={{
              flex:1, overflowY:"auto", padding:"20px 24px", display:"flex",
              flexDirection:"column", gap:24,
            }}>

              {/* Empty state */}
              {messages.length === 0 && !isCameraOpen && (
                <div style={{
                  flex:1, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", textAlign:"center", gap:16,
                  opacity: 0.7,
                }}>
                  <div style={{ position:"relative" }}>
                    <div style={{
                      width:80, height:80, border:"1px solid var(--c-border)",
                      borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      <div style={{
                        width:60, height:60, border:"1px solid var(--c-border2)",
                        borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        <Crosshair size={24} color="var(--c-green)" strokeWidth={1} />
                      </div>
                    </div>
                    <div className="radar-spin" style={{
                      position:"absolute", inset:0, border:"1px solid transparent",
                      borderTopColor:"var(--c-green2)", borderRadius:"50%",
                      opacity:0.5,
                    }}/>
                  </div>
                  <div>
                    <div style={{ fontFamily:"var(--font-disp)", fontSize:18, fontWeight:700, color:"var(--c-green)", letterSpacing:"0.1em" }}>
                      AWAITING TARGET
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-text2)", marginTop:6, letterSpacing:"0.12em" }}>
                      {mode3D
                        ? "3D MODE — MIDAS DEPTH · SHIFT_COMBINED · DUAL POINT CLOUD"
                        : "2D MODE — MIDAS DEPTH MAP ONLY"}
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-dim)", marginTop:4 }}>
                      DRAG & DROP IMAGE OR USE INPUT BELOW
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, idx) => (
                <div key={idx} style={{
                  display:"flex",
                  flexDirection: msg.type === "input" ? "row-reverse" : "row",
                  gap:10,
                }} className="slide-in">
                  {/* Avatar dot */}
                  <div style={{
                    width:24, height:24, borderRadius:"50%", flexShrink:0, marginTop:2,
                    border:`1px solid ${msg.type === "input" ? "var(--c-cyan)" : "var(--c-green)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background: msg.type === "input" ? "rgba(0,229,255,0.1)" : "rgba(0,255,136,0.1)",
                  }}>
                    {msg.type === "input"
                      ? <ImageIconLucide size={10} color="var(--c-cyan)"/>
                      : <Cpu size={10} color="var(--c-green)"/>}
                  </div>

                  <div style={{
                    maxWidth: msg.type === "input" ? "60%" : "100%",
                    flex: msg.type === "input" ? "none" : 1,
                  }}>
                    {/* Timestamp */}
                    {msg.timestamp && (
                      <div style={{
                        fontFamily:"var(--font-mono)", fontSize:8, color:"var(--c-dim)",
                        marginBottom:4, letterSpacing:"0.08em",
                        textAlign: msg.type === "input" ? "right" : "left",
                      }}>
                        {msg.type === "input" ? "USER INPUT" : "SYS OUTPUT"} · {msg.timestamp}
                      </div>
                    )}

                    {msg.type === "input" && (
                      <div style={{
                        display:"flex", flexWrap:"wrap", gap:6, justifyContent:"flex-end",
                        padding:8, border:"1px solid var(--c-border2)",
                        background:"rgba(0,229,255,0.04)",
                      }}>
                        {msg.content?.map((src, i) => (
                          <img key={i} src={src}
                            style={{ width:160, height:"auto", border:"1px solid var(--c-border)", objectFit:"cover" }}
                            alt="Input" />
                        ))}
                      </div>
                    )}

                    {msg.type === "output3d" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                        <div style={{
                          fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-green2)",
                          letterSpacing:"0.2em", paddingBottom:6,
                          borderBottom:"1px solid var(--c-border2)",
                        }}>
                          ▸ NEURAL RECONSTRUCTION COMPLETE · {msg.results?.length} FRAME(S)
                        </div>
                        {msg.results?.map((r, i) => <Result3DCard key={i} result={r} index={i} />)}
                      </div>
                    )}

                    {msg.type === "output" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{
                          fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-green2)",
                          letterSpacing:"0.2em", paddingBottom:6,
                          borderBottom:"1px solid var(--c-border2)",
                        }}>
                          ▸ DEPTH MAPS READY · {msg.depthmaps?.length} IMAGE(S)
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                          {msg.depthmaps?.map((img, i) => (
                            <div key={i} style={{ position:"relative" }}>
                              <img src={`data:image/png;base64,${img}`}
                                style={{ width:240, height:"auto", border:"1px solid var(--c-border)" }}
                                alt="Depth Map" />
                              <button
                                onClick={() => { const a=document.createElement("a"); a.href=`data:image/png;base64,${img}`; a.download=`depth_${Date.now()}.png`; a.click(); }}
                                style={{
                                  position:"absolute", bottom:6, right:6,
                                  padding:"4px 8px", background:"rgba(2,13,10,0.9)",
                                  border:"1px solid var(--c-border)", cursor:"pointer",
                                  color:"var(--c-text2)", fontFamily:"var(--font-mono)", fontSize:9,
                                }}
                              >
                                <Download size={10}/>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.type === "error" && (
                      <div style={{
                        display:"flex", alignItems:"center", gap:8,
                        fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-red)",
                        padding:"8px 12px", border:"1px solid rgba(255,61,61,0.4)",
                        background:"rgba(255,61,61,0.05)",
                      }}>
                        <RotateCcw size={12}/> ERROR: {msg.errorMsg}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div style={{
                  display:"flex", alignItems:"center", gap:10,
                  fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-green)",
                  letterSpacing:"0.12em",
                }}>
                  <div style={{
                    width:12, height:12, border:"1px solid var(--c-green)",
                    borderTopColor:"transparent", borderRadius:"50%",
                    animation:"radar-spin 0.8s linear infinite",
                  }}/>
                  {uploadProgress < 100
                    ? `UPLOADING ${uploadProgress}%`
                    : mode3D
                      ? "RUNNING MiDaS + PCM RECONSTRUCTION…"
                      : "COMPUTING DEPTH MAP…"}
                  <span className="blink">_</span>
                </div>
              )}
            </div>

            {/* ── Input bar ───────────────────────────────────────────────── */}
            <div style={{
              padding:"12px 16px", borderTop:"1px solid var(--c-border)",
              background:"rgba(2,13,10,0.95)", backdropFilter:"blur(8px)",
            }}>
              {/* Image previews */}
              {images.length > 0 && (
                <div style={{
                  display:"flex", gap:6, marginBottom:8, overflowX:"auto",
                  paddingBottom:4, borderBottom:"1px solid var(--c-border2)",
                }}>
                  {images.map((file, i) => (
                    <div key={i} style={{ position:"relative", flexShrink:0 }}>
                      <img src={URL.createObjectURL(file)}
                        style={{ width:56, height:56, objectFit:"cover", border:"1px solid var(--c-border)" }}
                        alt="Thumb" />
                      <button onClick={() => removeImage(i)} style={{
                        position:"absolute", top:-4, right:-4, width:14, height:14,
                        background:"var(--c-red)", border:"none", cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%",
                      }}>
                        <X size={8} color="#fff"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {/* Attach */}
                <button onClick={() => fileInputRef.current?.click()} style={{
                  padding:"8px", background:"transparent", border:"1px solid var(--c-border2)",
                  cursor:"pointer", color:"var(--c-text2)", display:"flex",
                }}>
                  <Plus size={18}/>
                </button>
                {/* Camera */}
                <button onClick={isCameraOpen ? stopCamera : startCamera} style={{
                  padding:"8px", background: isCameraOpen ? "rgba(255,61,61,0.1)" : "transparent",
                  border:`1px solid ${isCameraOpen ? "var(--c-red)" : "var(--c-border2)"}`,
                  cursor:"pointer", color: isCameraOpen ? "var(--c-red)" : "var(--c-text2)",
                  display:"flex",
                }}>
                  {isCameraOpen ? <CameraOff size={18}/> : <Camera size={18}/>}
                </button>
                <input type="file" multiple hidden ref={fileInputRef}
                  onChange={handleFileChange} accept="image/*" />

                {/* Status text */}
                <div style={{
                  flex:1, fontFamily:"var(--font-mono)", fontSize:10,
                  color:"var(--c-text2)", padding:"8px 12px",
                  border:"1px solid var(--c-border2)", background:"rgba(6,20,16,0.8)",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  {images.length > 0 ? (
                    <>
                      <Radio size={10} color="var(--c-green)"/>
                      <span style={{ color:"var(--c-green)" }}>{images.length} FILE(S) QUEUED — READY TO TRANSMIT</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color:"var(--c-dim)" }}>DRAG & DROP OR CLICK</span>
                      <Plus size={10} style={{ color:"var(--c-dim)" }}/>
                      <span style={{ color:"var(--c-dim)" }}>TO LOAD IMAGE</span>
                      <span className="blink" style={{ color:"var(--c-dim)", marginLeft:"auto" }}>▌</span>
                    </>
                  )}
                </div>

                {/* Send */}
                <button
                  disabled={!images.length || loading}
                  onClick={handleSubmit}
                  style={{
                    padding:"8px 16px", fontFamily:"var(--font-disp)", fontSize:10,
                    fontWeight:700, letterSpacing:"0.1em",
                    border:`1px solid ${images.length && !loading ? "var(--c-green)" : "var(--c-border2)"}`,
                    background: images.length && !loading ? "rgba(0,255,136,0.15)" : "transparent",
                    color: images.length && !loading ? "var(--c-green)" : "var(--c-dim)",
                    cursor: images.length && !loading ? "pointer" : "not-allowed",
                    display:"flex", alignItems:"center", gap:6,
                    boxShadow: images.length && !loading ? "0 0 12px rgba(0,255,136,0.2)" : "none",
                    transition:"all 0.15s",
                  }}
                >
                  {loading ? <Loader2 size={14} style={{ animation:"radar-spin 0.8s linear infinite" }}/> : <Send size={14}/>}
                  {loading ? "…" : "SCAN"}
                </button>
              </div>

              <div style={{
                fontFamily:"var(--font-mono)", fontSize:8, color:"var(--c-dim)",
                textAlign:"center", marginTop:6, letterSpacing:"0.25em",
              }}>
                MONODEPTH3D · SASTRA UNIVERSITY · NEURAL 3D RECONSTRUCTION v2.0
              </div>
            </div>
          </div>
        </div>

        {/* ── Drag overlay ──────────────────────────────────────────────────── */}
        {isDragActive && (
          <div style={{
            position:"fixed", inset:0, zIndex:50,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            background:"rgba(0,255,136,0.05)", backdropFilter:"blur(4px)",
            border:"2px solid var(--c-green)", margin:12,
          }}>
            <UploadCloud size={48} color="var(--c-green)" style={{ marginBottom:12 }}/>
            <div style={{ fontFamily:"var(--font-disp)", fontSize:18, color:"var(--c-green)", letterSpacing:"0.15em" }}>
              DROP TO SCAN
            </div>
          </div>
        )}

        {/* ── Camera overlay ─────────────────────────────────────────────── */}
        {isCameraOpen && (
          <div style={{
            position:"fixed", inset:0, zIndex:100, background:"#000",
            display:"flex", flexDirection:"column",
          }}>
            <div style={{
              position:"absolute", top:0, left:0, right:0, padding:12,
              display:"flex", justifyContent:"space-between", alignItems:"center",
              background:"linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)", zIndex:10,
            }}>
              <button onClick={stopCamera} style={{
                padding:"6px 12px", background:"rgba(0,0,0,0.5)", border:"1px solid var(--c-border)",
                cursor:"pointer", color:"var(--c-text)", fontFamily:"var(--font-mono)", fontSize:10,
              }}>
                ✕ CLOSE
              </button>
              <div style={{ fontFamily:"var(--font-disp)", fontSize:10, color:"var(--c-green)", letterSpacing:"0.2em" }}>
                OPTICAL SENSOR ACTIVE
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-text2)" }}>
                {cameraZoom.toFixed(1)}x
              </div>
            </div>

            <div
              style={{ flex:1, position:"relative", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}
              onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            >
              <video ref={videoRef} autoPlay playsInline
                style={{ position:"absolute", width:"100%", height:"100%", objectFit:"contain",
                  transform:`scale(${cameraZoom})`, transition:"transform 0.1s ease-out" }} />
              <canvas ref={canvasRef} style={{ display:"none" }}/>
              {/* Crosshair */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Crosshair size={48} color="var(--c-green)" strokeWidth={0.5} style={{ opacity:0.5 }}/>
              </div>
            </div>

            {/* Zoom slider */}
            <div style={{
              position:"absolute", bottom:120, left:0, right:0,
              display:"flex", justifyContent:"center", zIndex:20,
            }}>
              <div style={{
                display:"flex", alignItems:"center", gap:8, padding:"6px 16px",
                background:"rgba(0,0,0,0.6)", border:"1px solid var(--c-border)", backdropFilter:"blur(8px)",
              }}>
                <ZoomIn size={12} color="var(--c-text2)"/>
                <input type="range" min="1" max="5" step="0.1" value={cameraZoom}
                  onChange={e => setCameraZoom(parseFloat(e.target.value))}
                  className="green-slider" style={{ width:120 }}/>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-green)", width:28 }}>{cameraZoom.toFixed(1)}x</span>
              </div>
            </div>

            {/* Camera bottom bar */}
            <div style={{
              height:120, background:"#000", padding:"12px 32px",
              display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:20,
            }}>
              <button onClick={() => { stopCamera(); fileInputRef.current?.click(); }}
                style={{
                  padding:"10px", background:"rgba(255,255,255,0.1)", border:"1px solid var(--c-border)",
                  cursor:"pointer", display:"flex",
                }}>
                <ImageIconLucide size={24} color="var(--c-text)"/>
              </button>
              {/* Shutter */}
              <button onClick={capturePhoto} style={{
                width:64, height:64, borderRadius:"50%", background:"#fff",
                border:"4px solid rgba(255,255,255,0.4)", cursor:"pointer",
                boxShadow:"0 0 20px rgba(0,255,136,0.4)",
              }}/>
              <div style={{ width:44 }}/>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
