"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import dynamic from "next/dynamic";
import {
  Plus, Send, X, ImageIcon, Download, UploadCloud,
  Trash2, RotateCcw, Camera, CameraOff, Loader2,
  Box, Image as ImageIconLucide, ZoomIn
} from "lucide-react";
import { useDropzone } from "react-dropzone";

// ── Plotly — client-side only (touches `window`) ──────────────────────────────
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface PointCloud {
  xyz:   number[];
  rgb:   number[];
  count: number;
}

interface Result3D {
  depth_raw_b64:  string;
  depth_corr_b64: string;
  pointcloud:     PointCloud;
  delta_d:        number;
  alpha_f:        number;
  fov_deg:        number;
}

interface Message {
  type:       "input" | "output" | "output3d" | "error";
  content?:   string[];
  depthmaps?: string[];
  results?:   Result3D[];
  errorMsg?:  string;
}

// ── PointCloudViewer ──────────────────────────────────────────────────────────
function PointCloudViewer({ pc }: { pc: PointCloud }) {
  const [zScale,    setZScale]    = useState(0.4);
  const [pointSize, setPointSize] = useState(2);

  const { x, y, z, colors } = useMemo(() => {
    const n      = pc.count;
    const xArr: number[] = new Array(n);
    const yArr: number[] = new Array(n);
    const zArr: number[] = new Array(n);
    const cols: string[] = new Array(n);

    for (let i = 0; i < n; i++) {
      xArr[i] =  pc.xyz[i * 3];
      yArr[i] = -pc.xyz[i * 3 + 1];             
      zArr[i] = -pc.xyz[i * 3 + 2] * zScale;    
      const r = Math.round(pc.rgb[i * 3]     * 255);
      const g = Math.round(pc.rgb[i * 3 + 1] * 255);
      const b = Math.round(pc.rgb[i * 3 + 2] * 255);
      cols[i] = `rgb(${r},${g},${b})`;
    }
    return { x: xArr, y: yArr, z: zArr, colors: cols };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, zScale]);

  const plotData = useMemo<Plotly.Data[]>(() => [{
    type:      "scatter3d" as const,
    mode:      "markers"   as const,
    x, y, z,
    marker:    { size: pointSize, color: colors, opacity: 1 },
    hoverinfo: "none" as const,
  }], [x, y, z, colors, pointSize]);

  const layout = useMemo((): Partial<Plotly.Layout> => ({
    paper_bgcolor: "#0a0a0a",
    scene: {
      bgcolor: "#0a0a0a",
      xaxis:   { visible: false },
      yaxis:   { visible: false },
      zaxis:   { visible: false },
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

  // ── 3D Point Cloud (.ply) Exporter ──────────────────────────────────────────
  const downloadPLY = useCallback(() => {
    const n = pc.count;
    let plyContent = `ply\nformat ascii 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`;

    for (let i = 0; i < n; i++) {
      const px = pc.xyz[i * 3];
      const py = -pc.xyz[i * 3 + 1];
      const pz = -pc.xyz[i * 3 + 2] * zScale; 
      const r = Math.round(pc.rgb[i * 3] * 255);
      const g = Math.round(pc.rgb[i * 3 + 1] * 255);
      const b = Math.round(pc.rgb[i * 3 + 2] * 255);
      plyContent += `${px.toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)} ${r} ${g} ${b}\n`;
    }

    const blob = new Blob([plyContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3d_reconstruction_${Date.now()}.ply`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pc, zScale]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* WebGL canvas */}
      <div className="flex-1 rounded-t-xl overflow-hidden cursor-move relative">
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
        
        {/* Universal 3D Download Button */}
        <button
          onClick={downloadPLY}
          className="absolute bottom-4 right-4 p-2.5 bg-black/60 backdrop-blur-md rounded-full hover:bg-black/90 border border-white/10 z-10 shadow-lg transition-transform active:scale-95"
          title="Download 3D Model (.ply)"
        >
          <Download size={16} className="text-white" />
        </button>
      </div>

      {/* Control strip */}
      <div className="bg-[#141414] p-3 border-t border-white/5 flex items-center gap-6 rounded-b-xl">
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[10px] text-gray-500 font-mono uppercase w-14 shrink-0">Depth Z</span>
          <input
            type="range" min="0.1" max="1.5" step="0.05" value={zScale}
            onChange={e => setZScale(parseFloat(e.target.value))}
            className="w-full accent-green-500 cursor-pointer"
          />
          <span className="text-[10px] text-white font-mono w-10">{zScale.toFixed(2)}x</span>
        </div>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[10px] text-gray-500 font-mono uppercase w-14 shrink-0">Pt Size</span>
          <input
            type="range" min="1" max="6" step="0.5" value={pointSize}
            onChange={e => setPointSize(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <span className="text-[10px] text-white font-mono w-10">{pointSize.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Result3DCard ──────────────────────────────────────────────────────────────
function Result3DCard({ result, index }: { result: Result3D; index: number }) {
  const [tab, setTab] = useState<"3d" | "corr" | "raw">("3d");

  const dl = (b64: string, name: string) => {
    const a    = document.createElement("a");
    a.href     = `data:image/png;base64,${b64}`;
    a.download = name;
    a.click();
  };

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#1a1a1a]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-2 border-b border-white/5 bg-[#141414]">
        {(["3d", "corr", "raw"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all ${
              tab === t
                ? t === "3d"
                  ? "bg-green-500/20  text-green-400  border border-green-500/30"
                  : t === "corr"
                  ? "bg-blue-500/20   text-blue-400   border border-blue-500/30"
                  : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "3d"
              ? <><Box size={11} /> 3D Cloud</>
              : t === "corr"
              ? <><ImageIconLucide size={11} /> Corrected</>
              : <><ImageIconLucide size={11} /> Raw MiDaS</>}
          </button>
        ))}

        <div className="ml-auto hidden md:flex items-center gap-3 text-[9px] text-gray-600 font-mono pr-1">
          <span>Δd {result.delta_d > 0 ? "+" : ""}{result.delta_d}</span>
          <span>αf {result.alpha_f}</span>
          <span>FOV {result.fov_deg}°</span>
        </div>
      </div>

      {/* Content */}
      <div className="relative" style={{ height: "420px" }}>
        {tab === "3d" && (
          <div className="w-full h-full relative">
            <PointCloudViewer pc={result.pointcloud} />
            <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2 py-1 rounded-md text-[9px] text-white/70 font-mono pointer-events-none">
              {result.pointcloud.count.toLocaleString()} pts
            </div>
          </div>
        )}

        {(tab === "corr" || tab === "raw") && (
          <div className="relative w-full h-full flex items-center justify-center p-3 bg-[#0d0d0d]">
            <img
              src={`data:image/png;base64,${
                tab === "corr" ? result.depth_corr_b64 : result.depth_raw_b64
              }`}
              className="max-h-full max-w-full rounded-lg border border-white/10 shadow-2xl object-contain"
              alt={tab === "corr" ? "Corrected depth" : "Raw MiDaS depth"}
            />
            <button
              onClick={() => dl(
                tab === "corr" ? result.depth_corr_b64 : result.depth_raw_b64,
                `depth_${tab}_${index}.png`
              )}
              className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full hover:bg-black/90 border border-white/10"
            >
              <Download size={14} className="text-white" />
            </button>
          </div>
        )}
      </div>
    </div>
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
  
  // Camera & Zoom State
  const [isCameraOpen,     setIsCameraOpen]     = useState(false);
  const [cameraZoom,       setCameraZoom]       = useState(1);
  const initialPinchDist = useRef<number | null>(null);
  const initialZoomRef   = useRef<number>(1);

  const [mode3D,           setMode3D]           = useState(true);

  const scrollRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  const processImage = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = e => {
        const img  = new Image();
        img.src    = e.target?.result as string;
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
          canvas.toBlob(
            b => b ? resolve(b) : reject(new Error("blob fail")),
            "image/jpeg", 0.8
          );
        };
      };
      reader.onerror = reject;
    });

  // ── Camera Functions ──
  const startCamera = async () => {
    setIsCameraOpen(true);
    setCameraZoom(1); // Reset zoom on open
    try {
      // Request high-resolution widescreen format to prevent automatic sensor cropping
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setIsCameraOpen(false);
    }
  };
  
  const stopCamera = () => {
    (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
    setIsCameraOpen(false);
  };
  
  const capturePhoto = () => {
    if (!canvasRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Maintain aspect ratio while applying digital zoom
    const cropWidth = vw / cameraZoom;
    const cropHeight = vh / cameraZoom;
    const sx = (vw - cropWidth) / 2;
    const sy = (vh - cropHeight) / 2;

    // Output a standard resolution image for the ML pipeline
    const targetWidth = 1024;
    const targetHeight = (vh / vw) * targetWidth;
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(blob => {
      if (blob) {
        setImages(p => [...p, new File([blob], `cam_${Date.now()}.jpg`, { type: "image/jpeg" })]);
        stopCamera();
      }
    }, "image/jpeg", 0.9);
  };

  // ── Pinch to Zoom Handlers ──
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      initialZoomRef.current = cameraZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / initialPinchDist.current;
      const newZoom = Math.min(Math.max(1, initialZoomRef.current * scale), 5); // Max 5x zoom
      setCameraZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialPinchDist.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const newZoom = Math.min(Math.max(1, cameraZoom + (e.deltaY < 0 ? 0.1 : -0.1)), 5);
    setCameraZoom(newZoom);
  };

  const onDrop = useCallback((files: File[]) => setImages(p => [...p, ...files]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, noClick: true, accept: { "image/*": [] },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setImages(p => [...p, ...Array.from(e.target.files!)]);
  };
  
  const removeImage = (i: number) => setImages(images.filter((_, idx) => idx !== i));
  const clearChat   = () => { setMessages([]); setImages([]); setShowConfirmClear(false); };

  const handleSubmit = async () => {
    if (!images.length) return;
    setLoading(true);
    setUploadProgress(0);
    const previews = images.map(f => URL.createObjectURL(f));
    const formData = new FormData();
    try {
      const blobs = await Promise.all(images.map(processImage));
      blobs.forEach((b, i) => formData.append("files", b, `upload_${i}.jpg`));
      setMessages(p => [...p, { type: "input", content: previews }]);
      setImages([]);
      setTimeout(scrollToBottom, 50);

      if (mode3D) {
        const res = await axios.post(`${API_BASE}/predict-3d`, formData, {
          onUploadProgress: e =>
            setUploadProgress(Math.round((e.loaded * 100) / (e.total || 100))),
        });
        setMessages(p => [...p, { type: "output3d", results: res.data.results }]);
      } else {
        const res = await axios.post(`${API_BASE}/predict`, formData, {
          onUploadProgress: e =>
            setUploadProgress(Math.round((e.loaded * 100) / (e.total || 100))),
        });
        setMessages(p => [...p, { type: "output", depthmaps: res.data.depthmaps }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(p => [
        ...p, { type: "error", errorMsg: "Inference failed. Check backend status." },
      ]);
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setTimeout(scrollToBottom, 50);
    }
  };

  return (
    <div
      {...getRootProps()}
      className="relative flex flex-col h-screen bg-[#171717] text-gray-200 overflow-hidden font-sans"
    >
      <input {...getInputProps()} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#171717]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
          <h1 className="font-bold tracking-tight text-lg uppercase italic">DepthMap GPT</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode3D(m => !m)}
            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-all ${
              mode3D
                ? "bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500/25"
                : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"
            }`}
          >
            <Box size={12} />
            {mode3D ? "3D Mode ON" : "2D Mode"}
          </button>

          {messages.length > 0 && (
            !showConfirmClear ? (
              <button
                onClick={() => setShowConfirmClear(true)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} /> Clear Chat
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-[#2f2f2f] p-1.5 px-3 rounded-lg border border-red-500/50">
                <span className="text-[10px] font-bold text-red-400 uppercase">Confirm?</span>
                <button onClick={clearChat} className="text-xs hover:underline text-white font-bold">YES</button>
                <button onClick={() => setShowConfirmClear(false)} className="text-xs hover:underline text-gray-400">CANCEL</button>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Drag overlay ───────────────────────────────────────────────────── */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 m-4 rounded-3xl">
          <UploadCloud size={64} className="text-blue-400 animate-bounce" />
          <p className="text-2xl font-bold text-blue-400 mt-4">Drop images to analyze</p>
        </div>
      )}

      {/* ── Chat feed ──────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && !isCameraOpen && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
            <div className="p-8 rounded-full bg-white/5 mb-6 ring-1 ring-white/10 shadow-2xl">
              <ImageIcon size={64} className="opacity-20 text-blue-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2 italic">Ready to see in 3D?</h2>
            <p className="max-w-xs text-sm opacity-60">
              {mode3D
                ? "3D Mode — MiDaS depth + PCM correction + interactive point cloud."
                : "2D Mode — MiDaS depth map only."}
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.type === "input" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-2xl p-4 ${
                msg.type === "input"
                  ? "bg-[#2f2f2f] shadow-lg border border-white/5"
                  : "bg-transparent border border-white/5 w-full md:max-w-3xl"
              }`}
            >
              {msg.type === "input" && (
                <div className="flex flex-wrap gap-2">
                  {msg.content?.map((src, i) => (
                    <img key={i} src={src}
                      className="w-48 h-auto rounded-lg border border-white/10 shadow-md"
                      alt="Input" />
                  ))}
                </div>
              )}

              {msg.type === "output3d" && (
                <div className="space-y-4">
                  <p className="text-[10px] uppercase tracking-widest text-green-500 font-bold pb-2 border-b border-white/5">
                    Neural Results · 3D Reconstruction
                  </p>
                  {msg.results?.map((r, i) => <Result3DCard key={i} result={r} index={i} />)}
                </div>
              )}

              {msg.type === "output" && (
                <div className="space-y-4">
                  <p className="text-[10px] uppercase tracking-widest text-green-500 font-bold pb-2 border-b border-white/5">
                    Neural Results
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {msg.depthmaps?.map((img, i) => (
                      <div key={i} className="group relative">
                        <img src={`data:image/png;base64,${img}`}
                          className="w-64 h-auto rounded-lg border border-white/10 shadow-2xl"
                          alt="Depth Map" />
                        <button
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `data:image/png;base64,${img}`;
                            a.download = `depth_${Date.now()}.png`;
                            a.click();
                          }}
                          className="absolute bottom-2 right-2 p-2 bg-black/60 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-white/10"
                        >
                          <Download size={16} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {msg.type === "error" && (
                <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                  <RotateCcw size={14} /> {msg.errorMsg}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-green-500 font-mono italic">
            <Loader2 className="animate-spin" size={16} />
            {uploadProgress < 100
              ? `Uploading: ${uploadProgress}%`
              : mode3D ? "Running MiDaS + PCM reconstruction…" : "Calculating depth…"}
          </div>
        )}
      </div>

      {/* ── Native Fullscreen Camera Overlay ───────────────────────────────── */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-200">
          {/* Top Header */}
          <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
            <button 
              onClick={stopCamera} 
              className="p-2 text-white bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all pointer-events-auto"
            >
              <X size={28} />
            </button>
          </div>

          {/* Video Feed with Pinch-to-Zoom */}
          <div 
            className="flex-1 relative overflow-hidden bg-black flex items-center justify-center touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* The object-contain class ensures you see the full, uncropped camera view */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              style={{ transform: `scale(${cameraZoom})`, transition: 'transform 0.1s ease-out' }}
              className="absolute w-full h-full object-contain" 
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Zoom Slider Overlay */}
          <div className="absolute bottom-40 inset-x-0 flex justify-center z-20">
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-3 border border-white/10">
              <ZoomIn size={14} className="text-white/70" />
              <input
                type="range" min="1" max="5" step="0.1" value={cameraZoom}
                onChange={(e) => setCameraZoom(parseFloat(e.target.value))}
                className="w-32 accent-white h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-white text-xs font-mono w-6">{cameraZoom.toFixed(1)}x</span>
            </div>
          </div>

          {/* Bottom Native Camera Controls */}
          <div className="h-36 bg-black pb-8 pt-4 px-10 flex items-center justify-between shrink-0 z-20">
            {/* Gallery Picker */}
            <button
              onClick={() => {
                stopCamera();
                fileInputRef.current?.click();
              }}
              className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all border border-white/10"
              title="Pick from Gallery"
            >
              <ImageIconLucide size={28} />
            </button>

            {/* Shutter Button */}
            <button
              onClick={capturePhoto}
              className="w-20 h-20 bg-white rounded-full border-[6px] border-gray-400 shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-90 transition-transform"
              title="Take Photo"
            />

            {/* Empty placeholder for flex alignment balance */}
            <div className="w-16" />
          </div>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div className="max-w-4xl w-full mx-auto p-4 z-10">
        <div className="bg-[#212121] rounded-3xl border border-white/10 p-2 shadow-2xl focus-within:border-white/20 transition-all">
          {images.length > 0 && (
            <div className="flex gap-2 p-2 overflow-x-auto border-b border-white/5 mb-2">
              {images.map((file, i) => (
                <div key={i} className="relative group flex-shrink-0">
                  <img
                    src={URL.createObjectURL(file)}
                    className="w-20 h-20 object-cover rounded-xl border border-white/10"
                    alt="Thumb"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 border-2 border-[#212121]"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-2 py-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all"
            >
              <Plus size={24} />
            </button>
            <button
              onClick={isCameraOpen ? stopCamera : startCamera}
              className={`p-3 rounded-full transition-all ${
                isCameraOpen ? "text-red-400 bg-red-400/10" : "text-gray-400 hover:bg-white/5"
              }`}
            >
              {isCameraOpen ? <CameraOff size={24} /> : <Camera size={24} />}
            </button>
            <input
              type="file" multiple hidden ref={fileInputRef}
              onChange={handleFileChange} accept="image/*"
            />
            <div className="flex-1 text-sm text-gray-500 px-2 select-none italic cursor-default truncate">
              {images.length > 0
                ? `${images.length} image${images.length > 1 ? "s" : ""} ready`
                : "Drag and drop images or click +"}
            </div>
            <button
              disabled={!images.length || loading}
              onClick={handleSubmit}
              className={`p-3 rounded-2xl transition-all shadow-lg ${
                images.length > 0
                  ? "bg-white text-black hover:bg-gray-100 active:scale-95"
                  : "text-gray-600 cursor-not-allowed bg-white/5"
              }`}
            >
              <Send size={20} fill={images.length > 0 ? "black" : "none"} />
            </button>
          </div>
        </div>

        <p className="text-[9px] text-center text-gray-600 mt-3 tracking-[0.3em] uppercase font-bold">
          Neural Depth Reconstruction • SASTRA University • Major Project v2.0
        </p>
      </div>
    </div>
  );
}