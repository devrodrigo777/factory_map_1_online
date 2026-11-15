import { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import Icon from './Icons.jsx';

// Divide o pacote de sincronização em fragmentos menores para transmissão óptica dinâmica
function splitIntoChunks(fullText, chunkSize = 450) {
  if (!fullText) return [];
  // Gera hash curto simples de 8 caracteres para vincular os fragmentos
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

export default function DynamicSyncCode({ code, size = 300, onCopy }) {
  const canvasRef = useRef(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(160); // ms por quadro
  const [copied, setCopied] = useState(false);

  const chunks = useMemo(() => splitIntoChunks(code, 450), [code]);
  const totalFrames = chunks.length || 1;

  // Ciclo de rotação dos quadros da animação
  useEffect(() => {
    if (paused || totalFrames <= 1) return;
    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % totalFrames);
    }, speed);
    return () => clearInterval(timer);
  }, [paused, totalFrames, speed]);

  // Renderiza o QR Code do quadro atual no canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chunks.length) return;
    const currentChunk = chunks[frameIdx % chunks.length];

    QRCode.toCanvas(canvas, currentChunk, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'L',
      color: {
        dark: '#ffffff',
        light: '#0e1724',
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
        <div className="dynamic-sync-header">
          <div className="sync-badge">
            <span className="sync-pulse-dot" />
            <span>Código Visual Dinâmico</span>
          </div>
          <span className="sync-frame-counter">
            Quadro <strong>{frameIdx + 1}</strong> de <strong>{totalFrames}</strong>
          </span>
        </div>

        {/* Viewport do código com moldura industrial */}
        <div className="dynamic-sync-viewport">
          <div className="sync-corner top-left" />
          <div className="sync-corner top-right" />
          <div className="sync-corner bottom-left" />
          <div className="sync-corner bottom-right" />
          
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="dynamic-sync-canvas"
          />

          {!paused && totalFrames > 1 && (
            <div className="sync-scanline" />
          )}
        </div>

        {/* Barra de progresso dos quadros transmitidos */}
        <div className="sync-progress-bar">
          <div
            className="sync-progress-fill"
            style={{ width: `${((frameIdx + 1) / totalFrames) * 100}%` }}
          />
        </div>

        {/* Controles de reprodução do fluxo visual */}
        <div className="sync-controls">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPaused(!paused)}
            title={paused ? 'Retomar animação' : 'Pausar animação'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={15} />
            <span>{paused ? 'Continuar' : 'Pausar'}</span>
          </button>

          {paused && totalFrames > 1 && (
            <div className="seg">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setFrameIdx((prev) => (prev - 1 + totalFrames) % totalFrames)}
                title="Quadro anterior"
              >
                ◀
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setFrameIdx((prev) => (prev + 1) % totalFrames)}
                title="Próximo quadro"
              >
                ▶
              </button>
            </div>
          )}

          <div className="sync-speed-toggle">
            <span className="muted" style={{ fontSize: '0.8rem' }}>Velocidade:</span>
            <button
              type="button"
              className={`btn btn-xs ${speed === 240 ? 'active' : ''}`}
              onClick={() => setSpeed(240)}
            >
              Lenta
            </button>
            <button
              type="button"
              className={`btn btn-xs ${speed === 160 ? 'active' : ''}`}
              onClick={() => setSpeed(160)}
            >
              Padrão
            </button>
            <button
              type="button"
              className={`btn btn-xs ${speed === 110 ? 'active' : ''}`}
              onClick={() => setSpeed(110)}
            >
              Rápida
            </button>
          </div>
        </div>

        <p className="sync-notice">
          Código proprietário dinâmico legível exclusivamente pelo leitor óptico em <strong>Receber sincronização</strong>. Não compatível com câmeras comuns de celular.
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
