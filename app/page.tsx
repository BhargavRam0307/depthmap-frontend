"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Send, X, ImageIcon, Download, UploadCloud, Trash2, RotateCcw, Camera, CameraOff, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // --- FEATURE: MOBILE-SAFE IMAGE PROCESSING (Fixes PIL Error & 0% Upload Hang) ---
  const processImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 800; // Optimal for mobile Wi-Fi
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Blob conversion failed"));
          }, "image/jpeg", 0.8);
        };
      };
      reader.onerror = (e) => reject(e);
    });
  };

  // --- FEATURE: CAMERA MODULE LOGIC ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 800 }, height: { ideal: 800 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera access denied", err);
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = 384; 
      canvasRef.current.height = 384;
      context?.drawImage(videoRef.current, 0, 0, 384, 384);
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `cam_${Date.now()}.jpg`, { type: "image/jpeg" });
          setImages(prev => [...prev, file]);
          stopCamera();
        }
      }, "image/jpeg", 0.9);
    }
  };

  // --- FEATURE: FULL SCREEN DRAG AND DROP LOGIC ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setImages((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    accept: { "image/*": [] },
  });

  // --- FEATURE: GENERAL HANDLERS (Files, Clear, Downloads) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    setMessages([]);
    setImages([]);
    setShowConfirmClear(false);
  };

  const downloadImage = (base64Data: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- FEATURE: SUBMIT LOGIC WITH PROGRESS AND OPTIMISTIC UI ---
  const handleSubmit = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setUploadProgress(0);

    const inputPreviews = images.map((img) => URL.createObjectURL(img));
    const formData = new FormData();

    try {
      // Step 1: Process images for mobile compatibility
      const processedBlobs = await Promise.all(images.map(img => processImage(img)));
      processedBlobs.forEach((blob, i) => {
        formData.append("files", blob, `upload_${i}.jpg`);
      });

      // Step 2: Optimistic Update
      const userMsg = { type: "input", content: inputPreviews };
      setMessages((prev) => [...prev, userMsg]);
      setImages([]);

      // Step 3: API call
      // const response = await axios.post("http://10.129.30.28:8000/predict", formData, {
      //   onUploadProgress: (progressEvent) => {
      //     const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
      //     setUploadProgress(percent);
      //   },
      // });
      const response = await axios.post("https://bhargav0307-depth-reconstruction-api.hf.space/predict", formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
          setUploadProgress(percent);
        },
      });

      setMessages((prev) => [
        ...prev,
        { type: "output", depthmaps: response.data.depthmaps },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { type: "error", content: "Inference failed. Check backend connection and Laptop IP." },
      ]);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div {...getRootProps()} className="relative flex flex-col h-screen bg-[#171717] text-gray-200 overflow-hidden font-sans">
      <input {...getInputProps()} />

      {/* --- TOP HEADER / CLEAR CHAT FEATURE --- */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#171717]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <h1 className="font-bold tracking-tight text-lg uppercase italic">DepthMap GPT</h1>
        </div>
        
        {messages.length > 0 && (
            <div className="relative">
                {!showConfirmClear ? (
                    <button 
                        onClick={() => setShowConfirmClear(true)}
                        className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                        <Trash2 size={16} /> Clear Chat
                    </button>
                ) : (
                    <div className="flex items-center gap-3 bg-[#2f2f2f] p-1.5 px-3 rounded-lg border border-red-500/50">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">Confirm?</span>
                        <button onClick={clearChat} className="text-xs hover:underline text-white font-bold">YES</button>
                        <button onClick={() => setShowConfirmClear(false)} className="text-xs hover:underline text-gray-400">CANCEL</button>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* --- FULL SCREEN DROP OVERLAY FEATURE --- */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 m-4 rounded-3xl transition-all animate-in fade-in">
          <UploadCloud size={64} className="text-blue-400 animate-bounce" />
          <p className="text-2xl font-bold text-blue-400 mt-4">Drop images to analyze</p>
        </div>
      )}

      {/* --- CHAT HISTORY AREA FEATURE --- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
        {messages.length === 0 && !isCameraOpen && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center animate-in zoom-in duration-500">
            <div className="p-8 rounded-full bg-white/5 mb-6 ring-1 ring-white/10 shadow-2xl">
              <ImageIcon size={64} className="opacity-20 text-blue-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2 italic">Ready to see in 3D?</h2>
            <p className="max-w-xs text-sm opacity-60">Drag images anywhere, capture from camera, or use the plus button to generate depth maps.</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.type === "input" ? "justify-end" : "justify-start animate-in fade-in slide-in-from-bottom-2 duration-300"}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${msg.type === "input" ? "bg-[#2f2f2f] shadow-lg border border-white/5" : "bg-transparent border border-white/5"}`}>
              
              {/* INPUT PREVIEWS */}
              {msg.type === "input" && (
                <div className="flex flex-wrap gap-2">
                  {msg.content.map((src: string, i: number) => (
                    <img key={i} src={src} className="w-48 h-auto rounded-lg border border-white/10 shadow-md" alt="Input Preview" />
                  ))}
                </div>
              )}

              {/* OUTPUT DEPTH MAPS FEATURE */}
              {msg.type === "output" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <p className="text-[10px] uppercase tracking-widest text-green-500 font-bold tracking-widest">Neural Results</p>
                    {msg.depthmaps.length > 1 && (
                      <button 
                        onClick={() => msg.depthmaps.forEach((img: string, i: number) => downloadImage(img, `depth_batch_${i}.png`))}
                        className="flex items-center gap-1.5 text-[10px] font-bold bg-green-500/10 hover:bg-green-500/20 text-green-500 px-2 py-1 rounded border border-green-500/30 transition-all uppercase"
                      >
                        <Download size={12} /> SAVE ALL
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-4">
                    {msg.depthmaps.map((img: string, i: number) => (
                      <div key={i} className="group relative">
                        <img 
                          src={`data:image/png;base64,${img}`} 
                          className="w-64 h-auto rounded-lg border border-white/10 shadow-2xl transition-transform hover:scale-[1.02]" 
                          alt="Depth Map" 
                        />
                        <button 
                          onClick={() => downloadImage(img, `depth_${Date.now()}.png`)}
                          className="absolute bottom-2 right-2 p-2 bg-black/60 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90 border border-white/10 shadow-lg"
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
                    <RotateCcw size={14} /> {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-3 text-sm text-green-500 font-mono italic">
            <Loader2 className="animate-spin" size={16} />
            {uploadProgress < 100 ? `Syncing Data: ${uploadProgress}%` : "Calculating Neural Depth..."}
          </div>
        )}
      </div>

      {/* --- CAMERA VIEWPORT OVERLAY FEATURE --- */}
      {isCameraOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg aspect-square bg-black rounded-[2rem] overflow-hidden border-2 border-white/20 shadow-2xl">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute bottom-8 inset-x-0 flex justify-center items-center gap-10">
              <button onClick={stopCamera} className="p-4 bg-red-500/80 hover:bg-red-600 rounded-full text-white transition-all shadow-xl">
                <X size={24} />
              </button>
              <button 
                onClick={capturePhoto} 
                className="w-20 h-20 bg-white rounded-full border-8 border-gray-400/50 shadow-2xl active:scale-90 transition-transform" 
              />
            </div>
          </div>
        </div>
      )}

      {/* --- INPUT BAR FEATURE (GEMINI STYLE) --- */}
      <div className="max-w-4xl w-full mx-auto p-4 z-10">
        <div className="bg-[#212121] rounded-3xl border border-white/10 p-2 shadow-2xl focus-within:border-white/20 transition-all">
          
          {/* PREVIEW THUMBNAILS TRAY */}
          {images.length > 0 && (
            <div className="flex gap-2 p-2 overflow-x-auto border-b border-white/5 mb-2 scrollbar-hide">
              {images.map((file, i) => (
                <div key={i} className="relative group flex-shrink-0">
                  <img src={URL.createObjectURL(file)} className="w-20 h-20 object-cover rounded-xl border border-white/10 shadow-lg" alt="Thumbnail" />
                  <button 
                    onClick={() => removeImage(i)} 
                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-xl transition-colors border-2 border-[#212121]"
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
              title="Upload images"
            >
              <Plus size={24} />
            </button>
            <button 
              onClick={isCameraOpen ? stopCamera : startCamera} 
              className={`p-3 rounded-full transition-all ${isCameraOpen ? 'text-red-400 bg-red-400/10' : 'text-gray-400 hover:bg-white/5'}`}
              title="Use Camera"
            >
              {isCameraOpen ? <CameraOff size={24} /> : <Camera size={24} />}
            </button>
            <input 
              type="file" multiple hidden 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*"
            />
            
            <div className="flex-1 text-sm text-gray-500 px-2 select-none italic cursor-default truncate">
              {images.length > 0 ? `${images.length} images ready for analysis` : "Drag and drop images or click +"}
            </div>

            <button 
              disabled={images.length === 0 || loading}
              onClick={handleSubmit}
              className={`p-3 rounded-2xl transition-all shadow-lg ${images.length > 0 ? 'bg-white text-black hover:bg-gray-100 active:scale-95' : 'text-gray-600 cursor-not-allowed bg-white/5'}`}
            >
              <Send size={20} fill={images.length > 0 ? "black" : "none"} />
            </button>
          </div>
        </div>
        
        {/* SASTRA BRANDING FOOTER */}
        <p className="text-[9px] text-center text-gray-600 mt-3 tracking-[0.3em] uppercase font-bold">
          Neural Depth Reconstruction • SASTRA University • Major Project v1.2
        </p>
      </div>
    </div>
  );
}