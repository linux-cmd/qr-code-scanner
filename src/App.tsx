import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clipboard,
  Download,
  FileImage,
  Loader2,
  ScanLine,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkUrl, getAiAnalysis } from './lib/api';
import { canvasFromFile, canvasFromVideo, cropQr, detectQr, pointsToCssPolygon } from './lib/qr';
import { getUrlCandidate, hostnameFromUrl } from './lib/url';
import type { AiAnalysisResult, CropResult, QrResult, UrlCheckResult } from './types';

type Status = 'idle' | 'working' | 'success' | 'error';

type TurnstileWindow = Window & {
  turnstile?: {
    render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
    reset: (widgetId?: string) => void;
  };
};

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const adsenseClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined;

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileRef = useRef<(file: File) => Promise<void>>(async () => undefined);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('Drop, paste, upload, or use your camera to scan a QR code.');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [qrResult, setQrResult] = useState<QrResult | null>(null);
  const [crop, setCrop] = useState<CropResult | null>(null);
  const [urlCheck, setUrlCheck] = useState<UrlCheckResult | null>(null);
  const [urlCheckLoading, setUrlCheckLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const urlCandidate = useMemo(() => (qrResult ? getUrlCandidate(qrResult.text) : null), [qrResult]);
  const qrHost = urlCandidate ? hostnameFromUrl(urlCandidate) : '';

  useEffect(() => {
    if (!adsenseClientId) {
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      adsenseClientId
    )}`;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    handleFileRef.current = handleFile;
  });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((nextItem) => nextItem.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        void handleFileRef.current(file);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      if (crop?.url) {
        URL.revokeObjectURL(crop.url);
      }
    };
  }, [crop?.url, imageUrl]);

  async function handleFile(file: File) {
    resetResultState();
    stopCamera();
    setStatus('working');
    setMessage('Scanning the image for a QR code...');

    try {
      const canvas = await canvasFromFile(file);
      const result = await detectQr(canvas);

      if (!result) {
        setStatus('error');
        setMessage('No QR code was found. Try a clearer image or crop closer to the code.');
        return;
      }

      await applyQrResult(canvas, result, URL.createObjectURL(file));
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not read that image.');
    }
  }

  async function applyQrResult(canvas: HTMLCanvasElement, result: QrResult, previewUrl: string) {
    previewCanvasRef.current = canvas;
    setImageUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return previewUrl;
    });
    setImageSize({ width: canvas.width, height: canvas.height });
    setQrResult(result);
    const cropped = await cropQr(canvas, result.points);
    setCrop((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.url);
      }
      return cropped;
    });
    setStatus('success');
    setMessage(`QR code found using ${result.source === 'jsqr' ? 'fallback decoder' : 'browser detector'}.`);

    const candidate = getUrlCandidate(result.text);
    if (candidate) {
      setUrlCheckLoading(true);
      try {
        const nextCheck = await checkUrl(candidate);
        setUrlCheck(nextCheck);
      } catch (error) {
        setUrlCheck(null);
        setMessage(error instanceof Error ? error.message : 'QR decoded, but URL safety check failed.');
      } finally {
        setUrlCheckLoading(false);
      }
    }
  }

  async function startCamera() {
    resetResultState();
    setStatus('working');
    setMessage('Starting camera scanner...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      setCameraActive(true);
      const video = videoRef.current;
      if (!video) {
        throw new Error('Camera preview is not available.');
      }

      video.srcObject = stream;
      await video.play();
      setMessage('Point the camera at a QR code.');

      scanTimerRef.current = window.setInterval(async () => {
        if (!video.videoWidth || !video.videoHeight) {
          return;
        }

        const canvas = canvasFromVideo(video);
        const result = await detectQr(canvas);
        if (result) {
          stopCamera();
          await applyQrResult(canvas, result, canvas.toDataURL('image/png'));
        }
      }, 650);
    } catch (error) {
      stopCamera();
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Camera access failed.');
    }
  }

  function stopCamera() {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  async function requestAiAnalysis() {
    if (!urlCheck) {
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const result = await getAiAnalysis({
        normalizedUrl: urlCheck.normalizedUrl,
        riskScore: urlCheck.riskScore,
        riskLevel: urlCheck.riskLevel,
        signals: urlCheck.signals,
        title: urlCheck.title,
        description: urlCheck.description,
        turnstileToken
      });
      setAiAnalysis(result);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI analysis is unavailable right now.');
    } finally {
      setAiLoading(false);
    }
  }

  function resetResultState() {
    setQrResult(null);
    setUrlCheck(null);
    setAiAnalysis(null);
    setAiError(null);
    setTurnstileToken(null);
    setUrlCheckLoading(false);
    previewCanvasRef.current = null;
    setCrop((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.url);
      }
      return null;
    });
  }

  const overlayPolygon = qrResult ? pointsToCssPolygon(qrResult.points, imageSize.width, imageSize.height) : '';

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Private browser-first QR utility</p>
          <h1>Scan, check, crop, and save QR codes.</h1>
        </div>
        <div className="hero-actions">
          <button className="button primary" onClick={() => fileInputRef.current?.click()} type="button">
            <Upload size={18} />
            Upload
          </button>
          <button className="button secondary" onClick={cameraActive ? stopCamera : startCamera} type="button">
            {cameraActive ? <X size={18} /> : <Camera size={18} />}
            {cameraActive ? 'Stop' : 'Camera'}
          </button>
        </div>
      </section>

      <input
        ref={fileInputRef}
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.currentTarget.value = '';
        }}
        type="file"
      />

      <section className="workspace">
        <div
          className="scanner-panel"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) {
              void handleFile(file);
            }
          }}
        >
          <div className="drop-zone">
            {cameraActive ? (
              <video ref={videoRef} autoPlay muted playsInline className="camera-preview" />
            ) : imageUrl ? (
              <div className="image-preview">
                <img alt="Uploaded QR source" src={imageUrl} />
                {qrResult ? <div className="qr-outline" style={{ clipPath: `polygon(${overlayPolygon})` }} /> : null}
              </div>
            ) : (
              <div className="empty-state">
                <ScanLine size={42} />
                <p>Drop an image here</p>
                <span>
                  <FileImage size={16} />
                  Upload raster images
                </span>
                <span>
                  <Clipboard size={16} />
                  Paste screenshots
                </span>
              </div>
            )}
          </div>
          <StatusMessage status={status} message={message} />
        </div>

        <aside className="results-panel">
          <section className="panel-section">
            <h2>Decoded result</h2>
            {qrResult ? (
              <>
                <div className="result-box">{qrResult.text}</div>
                {urlCandidate ? <p className="host-line">URL host: {qrHost}</p> : <p className="host-line">Plain text QR code</p>}
              </>
            ) : (
              <p className="muted">Scan a QR code to see the payload and crop tools.</p>
            )}
          </section>

          <section className="panel-section">
            <h2>Reliability</h2>
            {urlCheckLoading ? (
              <LoadingLabel label="Checking URL reliability" />
            ) : urlCheck ? (
              <RiskReport urlCheck={urlCheck} />
            ) : qrResult && !urlCandidate ? (
              <p className="muted">Reliability checks are only available for URLs.</p>
            ) : (
              <p className="muted">URL checks run after a QR code is decoded.</p>
            )}
          </section>

          <section className="panel-section">
            <h2>Crop</h2>
            {crop ? (
              <div className="crop-output">
                <img alt="Cropped QR code" src={crop.url} />
                <a className="button primary full" download="cropped-qr-code.png" href={crop.url}>
                  <Download size={18} />
                  Save crop
                </a>
              </div>
            ) : (
              <p className="muted">The crop will appear as soon as a QR code is found.</p>
            )}
          </section>

          <section className="panel-section">
            <h2>AI analysis</h2>
            {urlCheck ? (
              <>
                <Turnstile onToken={setTurnstileToken} />
                <button
                  className="button secondary full"
                  disabled={aiLoading || Boolean(turnstileSiteKey && !turnstileToken)}
                  onClick={requestAiAnalysis}
                  type="button"
                >
                  {aiLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                  Get AI analysis
                </button>
                {aiError ? <p className="error-text">{aiError}</p> : null}
                {aiAnalysis ? (
                  <div className="ai-box">
                    <p>{aiAnalysis.explanation}</p>
                    <span>
                      {aiAnalysis.cached ? 'Cached' : 'Fresh'} via {aiAnalysis.provider} {aiAnalysis.model}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">AI stays off until you request it for a decoded URL.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function StatusMessage({ status, message }: { status: Status; message: string }) {
  const Icon = status === 'success' ? CheckCircle2 : status === 'error' ? AlertTriangle : status === 'working' ? Loader2 : ShieldQuestion;
  return (
    <div className={`status-line ${status}`}>
      <Icon className={status === 'working' ? 'spin' : ''} size={18} />
      <span>{message}</span>
    </div>
  );
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <div className="loading-label">
      <Loader2 className="spin" size={18} />
      {label}
    </div>
  );
}

function RiskReport({ urlCheck }: { urlCheck: UrlCheckResult }) {
  return (
    <div className="risk-report">
      <div className={`risk-meter ${urlCheck.riskLevel}`}>
        <div>
          <ShieldCheck size={20} />
          <span>{urlCheck.riskLevel} risk</span>
        </div>
        <strong>{urlCheck.riskScore}/100</strong>
      </div>
      <div className="meter-track">
        <span style={{ width: `${urlCheck.riskScore}%` }} />
      </div>
      {urlCheck.title ? <p className="site-title">{urlCheck.title}</p> : null}
      {urlCheck.description ? <p className="muted">{urlCheck.description}</p> : null}
      <ul className="signals">
        {urlCheck.signals.map((signal) => (
          <li className={signal.severity} key={signal.key}>
            {signal.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileSiteKey || !ref.current) {
      return;
    }

    const scriptId = 'turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.defer = true;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      document.head.appendChild(script);
    }

    let widgetId: string | undefined;
    const timer = window.setInterval(() => {
      const turnstile = (window as TurnstileWindow).turnstile;
      if (turnstile && ref.current && !widgetId) {
        widgetId = turnstile.render(ref.current, {
          sitekey: turnstileSiteKey,
          callback: onToken
        });
        clearInterval(timer);
      }
    }, 150);

    return () => {
      clearInterval(timer);
      (window as TurnstileWindow).turnstile?.reset(widgetId);
    };
  }, [onToken]);

  if (!turnstileSiteKey) {
    return <p className="muted">AI endpoint protection is configured in production with Turnstile.</p>;
  }

  return <div className="turnstile-box" ref={ref} />;
}
