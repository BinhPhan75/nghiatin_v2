import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, RefreshCw, Upload, Zap, Loader2, Sparkles, CheckCircle2, ChevronRight, CornerDownRight, QrCode } from 'lucide-react';
import { analyzeCCCDImage, CCCDAnalysisResult } from '../services/geminiService';
import jsQR from 'jsqr';
import { parseCCCD } from '../lib/utils';

interface QRScannerProps {
  onScan: (data: string | object) => void;
  onClose: () => void;
  mode?: 'ocr' | 'qr';
  title?: string;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, mode = 'ocr', title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScanningFile, setIsScanningFile] = useState(false);
  const [scannedData, setScannedData] = useState<CCCDAnalysisResult | null>(null);
  const [showBackPrompt, setShowBackPrompt] = useState(false);
  const [isQRDetected, setIsQRDetected] = useState(false);
  const detectionTimeout = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const isScanningActive = useRef(true);
  const lastScanTime = useRef(0);

  const handleFinishEarly = useCallback(() => {
    if (scannedData) {
      onScan(scannedData);
    }
  }, [scannedData, onScan]);

  const processResult = useCallback((result: CCCDAnalysisResult) => {
    // Basic validation
    if (!result.id && !result.name) return;

    // User Rule: OCR mode only needs 1 side (Front). Finish immediately.
    if (mode === 'ocr') {
      onScan(result);
      return;
    }

    // QR Mode handles detection via the high-speed loop, but if capture is used:
    if (result.cardType === 'NEW' && result.side === 'FRONT' && !showBackPrompt) {
       // Only for NEW cards in specific flows we might prompt, 
       // but based on user feedback, let's keep it simple.
       setScannedData(result);
       setShowBackPrompt(true);
    } else {
      onScan(result);
    }
  }, [onScan, mode, showBackPrompt]);

  const startCamera = useCallback(async () => {
    // Basic cleanup before starting
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    setIsInitializing(true);
    setError(null);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Trình duyệt này không hỗ trợ truy cập máy ảnh.");
      setIsInitializing(false);
      return;
    }

    // Small delay to ensure hardware is released
    await new Promise(resolve => setTimeout(resolve, 300));

    const tryStream = async (constraints: MediaStreamConstraints) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for metadata
          await new Promise((resolve) => {
             if (!videoRef.current) return resolve(null);
             videoRef.current.onloadedmetadata = () => resolve(null);
             setTimeout(resolve, 1000);
          });
          await videoRef.current.play().catch(e => console.warn("Auto-play failed:", e));
          // Success!
          return true;
        }
      } catch (err) {
        console.warn("Stream attempt failed:", constraints, err);
        return false;
      }
      return false;
    };

    let success = false;
    // Attempt 1: Back camera with ideal resolution
    success = await tryStream({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    if (!success) {
      success = await tryStream({
        video: { facingMode: 'environment' }
      });
    }

    if (!success) {
      success = await tryStream({ video: true });
    }

    if (!success) {
      const isIframe = window.self !== window.top;
      setError(isIframe ? "Mở trong tab mới để cấp quyền camera." : "Không thể kết nối máy ảnh.");
    }
    
    setIsInitializing(false);
  }, []);

  const scanQRCode = useCallback(() => {
    // Stable loop: don't depend on state for the loop itself
    if (mode !== 'qr' || !isScanningActive.current) return;

    if (!videoRef.current || showBackPrompt) {
      requestRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    const now = Date.now();
    if (now - lastScanTime.current < 200) { 
      requestRef.current = requestAnimationFrame(scanQRCode);
      return;
    }
    lastScanTime.current = now;

    try {
      const video = videoRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        if (!scanCanvasRef.current) scanCanvasRef.current = document.createElement('canvas');
        const canvas = scanCanvasRef.current;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          const scale = 0.7; // Increased scale for better QR density handling
          canvas.width = video.videoWidth * scale;
          canvas.height = video.videoHeight * scale;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const jsqrFunc = (jsQR as any).default || jsQR;
          const code = jsqrFunc(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

          if (code && code.data) {
            const data = code.data;
            // Detect either CCCD (|) or Bank QR (000201)
            if (data.includes('|') || data.startsWith('000201')) {
              setIsQRDetected(true);
              isScanningActive.current = false;
              setTimeout(() => onScan(data), 400);
              return;
            }
          }
        }
      }
    } catch (e) { 
      console.error("QR Scan Loop Error:", e);
    }
    requestRef.current = requestAnimationFrame(scanQRCode);
  }, [mode, showBackPrompt, onScan]);

  useEffect(() => {
    startCamera();
    if (mode === 'qr') {
      isScanningActive.current = true;
      requestRef.current = requestAnimationFrame(scanQRCode);
    }
    return () => {
      isScanningActive.current = false;
      cancelAnimationFrame(requestRef.current);
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode]); // Only depend on mode to avoid loops

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    
    setIsProcessing(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context || video.videoWidth === 0) return;

      const containerAspect = 1.586;
      const videoAspect = video.videoWidth / video.videoHeight;
      
      let sWidth, sHeight, sx, sy;

      if (videoAspect > containerAspect) {
        sHeight = video.videoHeight;
        sWidth = sHeight * containerAspect;
        sx = (video.videoWidth - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = video.videoWidth;
        sHeight = sWidth / containerAspect;
        sx = 0;
        sy = (video.videoHeight - sHeight) / 2;
      }

      canvas.width = 1200;
      canvas.height = 756;
      context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, 1200, 756);

      const base64Image = canvas.toDataURL('image/jpeg', 0.85);
      const info = await analyzeCCCDImage(base64Image);
      
      if (info) {
        processResult(info);
      } else {
        alert("AI không thể nhận diện. Hãy thử lại với ảnh rõ nét hơn.");
      }
    } catch (err) {
      console.error("Capture Error:", err);
      alert("Đã xảy ra lỗi khi phân tích ảnh.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanningFile(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        // Step 1: Try to decode as QR first (High priority for accuracy)
        const img = new Image();
        img.src = base64;
        await new Promise((resolve) => { img.onload = resolve; });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = img.width;
          canvas.height = img.height;
          context.drawImage(img, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const jsqrFunc = (jsQR as any).default || jsQR;
          const code = jsqrFunc(imageData.data, imageData.width, imageData.height);
          
          if (code && code.data) {
            console.log("QR detected in uploaded file:", code.data);
            onScan(code.data);
            setIsScanningFile(false);
            return;
          }
        }

        // Step 2: Fallback to AI OCR analysis only if mode is 'ocr'
        if (mode === 'ocr') {
          const info = await analyzeCCCDImage(base64);
          if (info) {
            processResult(info);
          } else {
            alert("AI không thể nhận diện được thông tin CCCD từ ảnh tải lên. Vui lòng dùng ảnh rõ nét hơn.");
          }
        } else {
          // If we are in 'qr' mode and no QR was found above
          alert("Không tìm thấy Mã QR hợp lệ trong ảnh tải lên. Vui lòng kiểm tra lại file ảnh.");
        }
      } catch (err: any) {
        console.error("Upload Scan Error:", err);
        alert(err?.message || "Lỗi khi phân tích ảnh tải lên.");
      } finally {
        setIsScanningFile(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-sm w-full max-w-sm overflow-hidden relative shadow-2xl border-2 border-gold-primary/30">
        <div className="p-4 border-b flex justify-between items-center bg-ink text-paper text-sm">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-gold-primary" />
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] m-0">
              {title || (showBackPrompt ? 'Quét Mã QR Mặt Sau' : mode === 'qr' ? 'Quét Mã QR CCCD Chip' : 'Chụp CCCD Cũ / Điện tử')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="hover:text-gold-primary transition-colors p-1">
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div className="relative aspect-[1.586/1] bg-black overflow-hidden shadow-inner border-y border-gold-primary/20">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          
          {(isScanningFile || isProcessing) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/40 backdrop-blur-[2px] z-10 transition-all duration-300">
              <div className="flex flex-col items-center bg-ink/80 p-5 rounded-sm border border-gold-primary/20 shadow-2xl">
                <Loader2 className="animate-spin mb-3 text-gold-primary" size={24} />
                <p className="text-[9px] uppercase font-black tracking-widest text-center px-4">
                  {isScanningFile ? 'Đang phân tích file ảnh...' : mode === 'ocr' ? 'AI đang phân tích chữ (OCR)...' : 'AI đang xử lý thông tin...'}
                </p>
                <p className="mt-2 text-[7px] text-paper/40 uppercase tracking-tight italic text-center">Vui lòng giữ bảng mạch xử lý ổn định</p>
              </div>
            </div>
          )}

          {isInitializing && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
               <div className="flex flex-col items-center">
                  <div className="w-12 h-1 border-2 border-gold-primary/20 bg-neutral-800 overflow-hidden rounded-full mb-3">
                     <div className="h-full bg-gold-primary animate-[loading_1.5s_infinite_linear] origin-left"></div>
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-paper/60 italic">Đang tải máy ảnh...</p>
               </div>
            </div>
          )}

          {showBackPrompt && !isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-white bg-ink/80 backdrop-blur-md z-30 animate-in fade-in duration-300">
               <div className="bg-gold-primary/20 p-4 rounded-full mb-4 ring-4 ring-gold-primary/10">
                 <CheckCircle2 size={40} className="text-gold-primary" />
               </div>
               <h4 className="text-sm font-black uppercase tracking-widest mb-2">Đã nhận diện mặt trước</h4>
               <p className="text-[10px] leading-tight font-medium text-neutral-300 text-center mb-6">
                 Đây là thẻ Căn cước mẫu mới. Vui lòng lật <strong className="text-white">mặt sau</strong> và hướng camera vào <strong className="text-white">Mã QR</strong> để lấy đầy đủ thông tin địa chỉ và các dữ liệu khác.
               </p>
               <div className="flex flex-col gap-3 w-full">
                 <button 
                  onClick={() => setShowBackPrompt(false)}
                  className="bg-gold-primary text-ink py-3 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center gap-2"
                 >
                   Quét Mã QR ngay <ChevronRight size={14} />
                 </button>
                 <button 
                   onClick={handleFinishEarly}
                   className="bg-white/10 text-white py-3 px-6 font-black uppercase text-[10px] tracking-widest border border-white/20"
                 >
                   Không, tôi sẽ tự nhập địa chỉ
                 </button>
               </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 text-white bg-red-950/90 backdrop-blur-md z-20">
              <div className="bg-white/10 p-4 rounded-full mb-6 ring-4 ring-white/5">
                <Camera size={24} className="text-red-400" />
              </div>
              <h4 className="text-sm font-black uppercase tracking-widest mb-3">Lỗi Camera</h4>
              <p className="text-[10px] leading-tight font-medium text-red-100 mb-6">
                {error}
              </p>
              <button 
                onClick={startCamera}
                className="bg-red-500 text-white py-3 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg"
              >
                Thử lại ngay
              </button>
            </div>
          )}

          {!isInitializing && !error && !showBackPrompt && (
            <>
              {/* Static Framing corners - Zalo Style (Consistent, Non-flashing) */}
              <div className="absolute inset-x-6 top-6 bottom-6 pointer-events-none z-10">
                <div className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 ${mode === 'qr' ? 'border-white' : 'border-gold-primary'} rounded-tl-sm`}></div>
                <div className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 ${mode === 'qr' ? 'border-white' : 'border-gold-primary'} rounded-tr-sm`}></div>
                <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 ${mode === 'qr' ? 'border-white' : 'border-gold-primary'} rounded-bl-sm`}></div>
                <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 ${mode === 'qr' ? 'border-white' : 'border-gold-primary'} rounded-br-sm`}></div>
                
                {/* Horizontal Scanning Line (Laser) */}
                {mode === 'qr' && !isQRDetected && (
                  <div className="absolute inset-x-2 h-0.5 bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-[scanLine_2.5s_infinite_ease-in-out]"></div>
                )}
              </div>
              
              {isQRDetected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-600/20 backdrop-blur-sm z-30 animate-in fade-in duration-300">
                  <div className="bg-white p-6 rounded-full shadow-2xl animate-[bounce_0.5s_ease-in-out]">
                    <CheckCircle2 size={64} className="text-green-500" />
                  </div>
                  <p className="mt-4 text-white font-black uppercase tracking-widest text-[12px] bg-ink/60 px-4 py-2 rounded-full backdrop-blur-md">Đã nhận diện QR!</p>
                </div>
              )}
              
              {!isQRDetected && (
                <div className="absolute bottom-6 inset-x-0 flex flex-col items-center gap-4 z-20">
                  {mode === 'qr' && (
                    <div className="bg-ink/60 px-4 py-1.5 rounded-full text-[9px] uppercase font-black tracking-widest text-white/90 border border-white/20 backdrop-blur-md shadow-lg">
                      Hướng camera vào Mã QR
                    </div>
                  )}
                  
                  <button 
                    onClick={handleCapture}
                    disabled={isProcessing}
                    className="group relative flex items-center justify-center"
                  >
                    <div className={`w-18 h-18 ${mode === 'qr' ? 'bg-white/20' : 'bg-gold-primary'} rounded-full flex items-center justify-center shadow-2xl relative z-10 border-4 border-white group-active:scale-95 transition-all`}>
                      <Camera size={32} className={mode === 'qr' ? 'text-white' : 'text-ink'} />
                    </div>
                    {mode === 'ocr' && (
                       <div className="absolute -bottom-14 flex flex-col items-center">
                         <p className="text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap bg-ink/70 px-3 py-1.5 rounded shadow-xl mb-1">
                          NHẤN ĐỂ CHỤP MẶT TRƯỚC
                        </p>
                        <p className="text-[7px] font-bold text-gold-primary uppercase tracking-tighter animate-pulse">Giữ thẻ thẳng & đủ sáng</p>
                       </div>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        
        {!isInitializing && (
          <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex flex-col gap-3">
            <div className="flex justify-between items-center italic">
              <p className="text-[9px] text-ink font-bold leading-tight max-w-[200px]">
                {error ? 'Bạn có thể chọn tải ảnh chụp sẵn từ thư viện nếu không thể mở camera.' : 
                 showBackPrompt ? 'Vui lòng lật mặt sau và chụp Mã QR để lấy đủ thông tin.' : 
                 mode === 'qr' ? 'Hướng camera vào mã QR ở mặt sau thẻ để trích xuất 100% dữ liệu nhanh nhất.' :
                 'Giữ thẻ phẳng, đủ ánh sáng và tránh bị lóa đèn để AI nhận diện tốt nhất.'}
              </p>
              <div className="flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-paper border border-ink/10 p-2.5 rounded shadow-sm text-ink hover:bg-gold-primary transition-all flex items-center gap-2 text-[9px] font-black uppercase tracking-widest"
                >
                  <Upload size={14} /> Tải ảnh
                </button>
              </div>
            </div>
            
            {scannedData && (
              <div className="flex items-center gap-2 py-2 px-3 bg-green-50 border border-green-100 rounded-sm">
                 <div className="flex-1">
                   <p className="text-[8px] font-black uppercase text-green-600 mb-0.5">Tiến độ quét</p>
                   <p className="text-[10px] font-bold text-ink truncate">{scannedData.name}</p>
                 </div>
                 <div className="flex items-center gap-1 text-[8px] font-black text-green-600">
                    <CheckCircle2 size={12} /> CẦN QUÉT QR MẶT SAU
                 </div>
              </div>
            )}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default QRScanner;
