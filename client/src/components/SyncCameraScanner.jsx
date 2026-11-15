import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Icon from './Icons.jsx';

export default function SyncCameraScanner({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);

  const [cameraError, setCameraError] = useState(null);
  const [currentHash, setCurrentHash] = useState(null);
  const [totalParts, setTotalParts] = useState(0);
  const [collectedParts, setCollectedParts] = useState({});
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);

  // Inicializa a câmera ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    setCameraError(null);
    setCurrentHash(null);
    setTotalParts(0);
    setCollectedParts({});
    setSuccess(false);

    let active = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Seu navegador não suporta captura direta por câmera. Utilize a transferência manual por código.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setScanning(true);
        }
      } catch (err) {
        if (!active) return;
        console.error('Falha ao acessar câmera:', err);
        const msg = err.name === 'NotAllowedError'
          ? 'Permissão de acesso à câmera negada. Permita o acesso nas configurações do navegador ou use o código manual.'
          : err.name === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste dispositivo. Utilize o código de sincronização por texto.'
            : `Não foi possível iniciar a câmera: ${err.message}`;
        setCameraError(msg);
      }
    }

    startCamera();

    return () => {
      active = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Loop contínuo de leitura de quadros do vídeo via jsQR
  useEffect(() => {
    if (!scanning || !isOpen || success) return;

    let localParts = { ...collectedParts };
    let localHash = currentHash;
    let localTotal = totalParts;

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code?.data) {
        const raw = code.data.trim();

        // Código com fragmentação dinâmica proprietária: FMP1:<hash>:<idx>:<total>:<slice>
        if (raw.startsWith('FMP1:')) {
          const parts = raw.split(':');
          if (parts.length >= 5) {
            const [, pkgHash, idxStr, totalStr, ...rest] = parts;
            const slice = rest.join(':');
            const idx = Number(idxStr);
            const tot = Number(totalStr);

            if (pkgHash && idx && tot) {
              if (localHash !== pkgHash) {
                localHash = pkgHash;
                localTotal = tot;
                localParts = {};
                setCurrentHash(pkgHash);
                setTotalParts(tot);
              }

              if (!localParts[idx]) {
                localParts[idx] = slice;
                setCollectedParts({ ...localParts });
              }

              // Verifica se todos os quadros foram capturados
              if (Object.keys(localParts).length >= localTotal) {
                const complete = [];
                let ok = true;
                for (let i = 1; i <= localTotal; i++) {
                  if (!localParts[i]) { ok = false; break; }
                  complete.push(localParts[i]);
                }

                if (ok) {
                  const assembled = complete.join('');
                  setSuccess(true);
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                  }
                  navigator.vibrate?.([50, 40, 100]);
                  setTimeout(() => {
                    onScan(assembled);
                    onClose();
                  }, 600);
                  return;
                }
              }
            }
          }
        } else if (raw.startsWith('FMSYNC1.')) {
          // Código completo em quadro único
          setSuccess(true);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          navigator.vibrate?.([60, 40, 100]);
          setTimeout(() => {
            onScan(raw);
            onClose();
          }, 400);
          return;
        }
      }

      animRef.current = requestAnimationFrame(scanFrame);
    }

    animRef.current = requestAnimationFrame(scanFrame);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [scanning, isOpen, success, onScan, onClose, currentHash, totalParts, collectedParts]);

  if (!isOpen) return null;

  const collectedCount = Object.keys(collectedParts).length;
  const progressPercent = totalParts > 0 ? Math.round((collectedCount / totalParts) * 100) : 0;

  return (
    <div className="camera-modal-backdrop" onClick={onClose}>
      <div className="camera-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <Icon name="camera" size={20} />
            <span>Leitor Óptico de Sincronização</span>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="camera-modal-body">
          {cameraError ? (
            <div className="camera-error-box">
              <Icon name="close" size={32} />
              <p><strong>Câmera Indisponível</strong></p>
              <p className="muted">{cameraError}</p>
              <button type="button" className="btn primary" onClick={onClose} style={{ marginTop: 12 }}>
                Usar transferência manual por código
              </button>
            </div>
          ) : (
            <div className="camera-viewport-wrap">
              <video ref={videoRef} className="camera-video-element" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Moldura guia do leitor óptico */}
              <div className={`camera-guide-box ${success ? 'guide-success' : ''}`}>
                <div className="guide-corner top-left" />
                <div className="guide-corner top-right" />
                <div className="guide-corner bottom-left" />
                <div className="guide-corner bottom-right" />
                <div className="camera-scan-beam" />
              </div>

              {success && (
                <div className="camera-success-overlay">
                  <div className="success-badge">
                    <Icon name="check" size={28} />
                    <span>Sincronização capturada!</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!cameraError && (
            <div className="camera-status-panel">
              {totalParts > 1 ? (
                <div>
                  <div className="camera-progress-info">
                    <span>Capturando fluxo óptico:</span>
                    <strong>{collectedCount} de {totalParts} quadros ({progressPercent}%)</strong>
                  </div>
                  <div className="camera-progress-bar">
                    <div
                      className="camera-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="camera-fragment-dots">
                    {Array.from({ length: totalParts }).map((_, i) => (
                      <span
                        key={i}
                        className={`fragment-dot ${collectedParts[i + 1] ? 'received' : ''}`}
                        title={`Quadro ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: '0.85rem' }}>
                  Aponte a câmera para o Código Visual Dinâmico na outra tela para capturar automaticamente.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="camera-modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
