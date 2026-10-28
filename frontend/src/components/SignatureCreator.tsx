import React, { useState, useRef, useEffect } from 'react';
import { Save, Trash2, Download, Type, PenTool } from 'lucide-react';

interface SignatureCreatorProps {
  onBack: () => void;
}

const SignatureCreator: React.FC<SignatureCreatorProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [selectedFont, setSelectedFont] = useState('cursive');
  const [savedSignatures, setSavedSignatures] = useState<string[]>([]);

  const fonts = [
    { name: 'Cursive', value: 'cursive', style: 'font-cursive' },
    { name: 'Signature', value: 'Dancing Script', style: 'font-signature' },
    { name: 'Elegant', value: 'Great Vibes', style: 'font-elegant' },
    { name: 'Professional', value: 'Pacifico', style: 'font-professional' },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Set drawing styles
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

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

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (signatureMode === 'draw') {
      const dataUrl = canvas.toDataURL();
      setSavedSignatures([...savedSignatures, dataUrl]);
    } else {
      // For typed signatures, we would generate a canvas with the text
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
        setSavedSignatures([...savedSignatures, dataUrl]);
      }
    }
  };

  const downloadSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'signature.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Signature</h1>
        <p className="text-gray-600">Create and save your signature for use in documents</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        {/* Mode Selection */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setSignatureMode('draw')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              signatureMode === 'draw'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Draw</span>
          </button>
          <button
            onClick={() => setSignatureMode('type')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              signatureMode === 'type'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>Type</span>
          </button>
        </div>

        {signatureMode === 'draw' ? (
          <div>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Draw your signature below:</p>
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="border-2 border-gray-300 rounded-lg cursor-crosshair w-full h-48"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
            </div>
            <div className="flex space-x-4">
              <button
                onClick={clearCanvas}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
              <button
                onClick={saveSignature}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
              <button
                onClick={downloadSignature}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type your name:
              </label>
              <input
                type="text"
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select font style:
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {fonts.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => setSelectedFont(font.value)}
                    className={`p-4 border rounded-lg text-center transition-colors ${
                      selectedFont === font.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className={`text-2xl mb-1`} style={{ fontFamily: font.value }}>
                      {typedSignature || 'Sample'}
                    </div>
                    <div className="text-xs text-gray-600">{font.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {typedSignature && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Preview:</p>
                <div 
                  className="border border-gray-300 rounded-lg p-8 text-center bg-gray-50"
                  style={{ fontFamily: selectedFont, fontSize: '32px' }}
                >
                  {typedSignature}
                </div>
              </div>
            )}

            <button
              onClick={saveSignature}
              disabled={!typedSignature}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Signature</span>
            </button>
          </div>
        )}
      </div>

      {/* Saved Signatures */}
      {savedSignatures.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Signatures</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedSignatures.map((signature, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <img
                  src={signature}
                  alt={`Saved signature ${index + 1}`}
                  className="w-full h-16 object-contain mb-2"
                />
                <div className="flex space-x-2">
                  <button className="flex-1 text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                    Use
                  </button>
                  <button className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Back Button */}
      <div className="flex justify-end">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default SignatureCreator;