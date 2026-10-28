import React, { useState, useRef, useEffect } from 'react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
}

const fonts = [
  { name: 'Cursive', value: 'cursive' },
  { name: 'Signature', value: 'Dancing Script' },
  { name: 'Elegant', value: 'Great Vibes' },
  { name: 'Professional', value: 'Pacifico' },
];

const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [selectedFont, setSelectedFont] = useState('cursive');

  // Debug logging when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 Debug: Signature modal opened');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [isOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    console.log('🔍 Debug: Saving signature, mode:', signatureMode);
    
    if (signatureMode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.error('❌ Canvas not available for drawing');
        return;
      }
      const dataUrl = canvas.toDataURL();
      console.log('🔍 Debug: Drawing signature saved, dataUrl length:', dataUrl.length);
      onSave(dataUrl);
    } else {
      // For typed signatures, generate a canvas with the text
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 100;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.font = `32px ${selectedFont}`;
        tempCtx.fillStyle = '#000000';
        tempCtx.textAlign = 'center';
        tempCtx.fillText(typedSignature, 200, 60);
        const dataUrl = tempCanvas.toDataURL();
        console.log('🔍 Debug: Typed signature saved, dataUrl length:', dataUrl.length);
        onSave(dataUrl);
      } else {
        console.error('❌ Canvas context not available for typed signature');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg relative">
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4">Sign Document</h2>
        <div className="flex space-x-4 mb-4">
          <button
            onClick={() => setSignatureMode('draw')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${signatureMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Draw
          </button>
          <button
            onClick={() => setSignatureMode('type')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${signatureMode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Type
          </button>
        </div>
        {signatureMode === 'draw' ? (
          <div>
            <canvas
              ref={canvasRef}
              width={400}
              height={100}
              className="border-2 border-gray-300 rounded-lg cursor-crosshair w-full h-24 mb-2"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            <div className="flex space-x-2 mb-2">
              <button onClick={clearCanvas} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded">Clear</button>
            </div>
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={typedSignature}
              onChange={e => setTypedSignature(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
              placeholder="Enter your name"
            />
            <div className="flex space-x-2 mb-2">
              {fonts.map(font => (
                <button
                  key={font.value}
                  onClick={() => setSelectedFont(font.value)}
                  className={`px-2 py-1 rounded ${selectedFont === font.value ? 'bg-blue-200' : 'bg-gray-100'}`}
                  style={{ fontFamily: font.value }}
                >
                  {font.name}
                </button>
              ))}
            </div>
            {typedSignature && (
              <div className="border border-gray-300 rounded p-2 text-center mb-2" style={{ fontFamily: selectedFont, fontSize: '28px' }}>
                {typedSignature}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end space-x-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            disabled={signatureMode === 'type' && !typedSignature}
          >
            Save Signature
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;