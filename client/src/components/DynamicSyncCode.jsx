import { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import Icon from './Icons.jsx';

// Intervalo automático e acelerado para transmissão visual contínua
const AUTO_FRAME_INTERVAL_MS = 200;

// Divide o pacote de sincronização em fragmentos de tamanho ideal para módulos QR grandes e de fácil leitura
function splitIntoChunks(fullText, chunkSize = 220) {
  if (!fullText) return [];
  // Hash curto de 8 caracteres para vincular e validar o lote de transmissão
  let hashVal = 0;
  for (let i = 0; i < fullText.length; i++) {
    hashVal = ((hashVal << 5) - hashVal) + fullText.charCodeAt(i);
    hashVal |= 0;
  }
  const hash = Math.abs(hashVal).toString(16).padStart(8, '0').slice(0, 8);
  const total = Math.ceil(fullText.length / chunkSize);
  const chunks = [];
  for (let i = 0; i < total; i++) {
    const slice = fullText.slice(i * chunkSize, (i + 1) * chunkSize);
    chunks.push(`FMP1:${hash}:${i + 1}:${total}:${slice}`);
  }
  return chunks;
}

export default function DynamicSyncCode({ code, size = 320, onCopy }) {
  const canvasRef = useRef(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const chunks = useMemo(() => splitIntoChunks(code, 220), [code]);
  const totalFrames = chunks.length || 1;

  // Ciclo 100% automático e estável na velocidade padrão calibrada
  useEffect(() => {
    if (totalFrames <= 1) return;
    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % totalFrames);
    }, AUTO_FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [totalFrames]);

  // Renderiza o QR Code com alto contraste (preto no branco) para leitura instantânea por sensores móveis
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chunks.length) return;
    const currentChunk = chunks[frameIdx % chunks.length];

    QRCode.toCanvas(canvas, currentChunk, {
      width: size,
      margin: 3,
      errorCorrectionLevel: 'L',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).catch(() => {});
  }, [frameIdx, chunks, size]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      onCopy?.();
    }).catch(() => {});
  };

  return (
    <div className="dynamic-sync-container">
      <div className="dynamic-sync-card">
        {/* Viewport do código com moldura de foco de alto contraste */}
        <div className="dynamic-sync-viewport high-contrast">
          <div className="sync-corner top-left" />
          <div className="sync-corner top-right" />
          <div className="sync-corner bottom-left" />
          <div className="sync-corner bottom-right" />
          
          <div className="canvas-white-backer">
            <canvas
              ref={canvasRef}
              width={size}
              height={size}
              className="dynamic-sync-canvas"
            />
          </div>
        </div>

        <p className="sync-notice">
          Aponte a câmera em <strong>Receber sincronização</strong> na outra instância para leitura direta.
        </p>

        <div className="sync-card-footer">
          <button
            type="button"
            className={`btn ${copied ? 'primary' : ''}`}
            onClick={handleCopy}
          >
            <Icon name={copied ? 'check' : 'swap'} size={16} />
            {copied ? 'Código copiado!' : 'Copiar código para transferência manual'}
          </button>
        </div>
      </div>
    </div>
  );
}
