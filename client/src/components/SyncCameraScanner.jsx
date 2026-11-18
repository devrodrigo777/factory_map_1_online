import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Icon from './Icons.jsx';

const SCAN_VIEWPORT_SIZE = 480;

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

  // Inicializa a câmera com configurações otimizadas para leitura rápida de códigos
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
          throw new Error('Navegador sem suporte a acesso direto à câmera. Utilize a opção de copiar/colar código.');
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
        console.error('Falha ao abrir câmera:', err);
        const msg = err.name === 'NotAllowedError'
          ? 'Permissão de acesso à câmera negada. Permita o uso da câmera nas configurações ou use a colagem manual de código.'
          : err.name === 'NotFoundError'
            ? 'Nenhuma câmera detectada neste aparelho. Utilize a colagem manual de código.'
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

  // Loop de alta performance com leitura em resolução calibrada (evita travamentos em celulares)
  useEffect(() => {
    if (!scanning || !isOpen || success) return;

    let localParts = { ...collectedParts };
    let localHash = currentHash;
    let localTotal = totalParts;
    let frameCounter = 0;

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        animRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = SCAN_VIEWPORT_SIZE;
      canvas.height = SCAN_VIEWPORT_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      frameCounter++;

      // Alterna estrategicamente entre recorte central (área da mira) e quadro completo redimensionado
      let code = null;
      if (frameCounter % 4 !== 0) {
        // Modo foco central: 85% do menor lado (alta precisão e velocidade)
        const crop = Math.min(vw, vh) * 0.85;
        const sx = (vw - crop) / 2;
        const sy = (vh - crop) / 2;
        ctx.drawImage(video, sx, sy, crop, crop, 0, 0, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE);
        const img = ctx.getImageData(0, 0, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE);
        code = jsQR(img.data, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE, { inversionAttempts: 'dontInvert' });
      } else {
        // Modo visão ampla: quadro completo redimensionado caso a mira esteja ligeiramente desalinhada
        ctx.drawImage(video, 0, 0, vw, vh, 0, 0, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE);
        const img = ctx.getImageData(0, 0, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE);
        code = jsQR(img.data, SCAN_VIEWPORT_SIZE, SCAN_VIEWPORT_SIZE, { inversionAttempts: 'dontInvert' });
      }

      if (code?.data) {
        const raw = code.data.trim();

        // Código com fragmentação dinâmica: FMP1:<hash>:<idx>:<total>:<slice>
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
                  navigator.vibrate?.([60, 40, 100]);
                  setTimeout(() => {
                    onScan(assembled);
                    onClose();
                  }, 400);
                  return;
                }
              }
            }
          }
        } else if (raw.startsWith('FMSYNC1.')) {
          // Pacote completo em quadro único
          setSuccess(true);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          navigator.vibrate?.([60, 40, 100]);
          setTimeout(() => {
            onScan(raw);
            onClose();
          }, 350);
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

              {/* Mira visual de enquadramento com guias de canto */}
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
                <div className="camera-sync-progress-compact">
                  <div className="camera-progress-info">
                    <span className="camera-progress-label">
                      <span className="pulse-indicator" /> Lendo fluxo contínuo:
                    </span>
                    <strong className="camera-progress-badge">
                      {progressPercent}% <span className="camera-progress-sub">({collectedCount} de {totalParts} quadros)</span>
                    </strong>
                  </div>
                  <div className="camera-progress-bar">
                    <div
                      className="camera-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
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
