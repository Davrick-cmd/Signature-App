import React, { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Download, Share2, Eye, PenTool, Calendar, Type, CheckCircle, Trash2 } from 'lucide-react';
import { Document } from '../types';
import { getCurrentUser } from '../services/authService';
import { API_ENDPOINTS, apiFetch, apiUrl, authHeaders, downloadFile } from '../config/api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf';
// Import the correct worker from the installed pdfjs-dist so versions match
// Vite: `?url` ensures the file is served as an URL string
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite handles this import query
// Import the worker from the pdfjs-dist that react-pdf depends on
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SignatureModal from './SignatureModal';

// Set up PDF.js worker (must match the pdfjs-dist version used by react-pdf)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
  onDocumentSigned?: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ document, onBack, onDocumentSigned }) => {
  const [selectedTool, setSelectedTool] = useState<'signature' | 'initial' | 'date' | 'text' | null>(null);
  // Store signature field positions relative to PDF content
  const [signatureFields, setSignatureFields] = useState<Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: string;
    signer: string;
    signerColor?: string; // Color assigned to the signer
    // Add relative positioning data
    relativeX?: number; // Percentage relative to PDF width
    relativeY?: number; // Percentage relative to PDF height
    relativeWidth?: number; // Percentage relative to PDF width
    relativeHeight?: number; // Percentage relative to PDF height
    signatureDataUrl?: string; // URL of the signature image
    pageNumber?: number; // Page where the field belongs (1-indexed)
  }>>([]);
  
  // Load existing signature fields for this document
  React.useEffect(() => {
    const loadDocumentFields = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.DOCUMENT_FIELDS(document.id));
        if (response.ok) {
          const data = await response.json();
           if (data.signatureFields) {
            // Normalize loaded fields to ensure pageNumber defaults to 1
            const normalized = data.signatureFields.map((f: any) => ({
              ...f,
              pageNumber: f.pageNumber ?? 1,
            }));
            setSignatureFields(normalized);
          }
        }
      } catch (error) {
        console.log('No existing fields found or error loading fields:', error);
      }
    };
    
    loadDocumentFields();
    // Also fetch server-side document for authoritative signatures/signers
    const loadServerDoc = async () => {
      try {
        const res = await apiFetch(API_ENDPOINTS.DOCUMENT(document.id));
        if (res.ok) {
          const data = await res.json();
          setServerSignatures(Array.isArray(data.signatures) ? data.signatures : []);
          setServerSigners(Array.isArray(data.signers) ? data.signers : (document.signers || []));
          setServerUploader(data.uploaded_by || document.uploaded_by || null);
        }
      } catch (e) {
        // ignore
      }
    };
    loadServerDoc();
  }, [document.id]);
  
  // Auto-save signature fields when they change
  React.useEffect(() => {
    const saveDocumentFields = async () => {
      if (signatureFields.length === 0) return;
      // Only the owner can edit the layout, and only before anyone has signed
      if (!isDocumentOwner || (serverSignatures && serverSignatures.length > 0) || docStatus === 'completed') return;

      try {
        await apiFetch(API_ENDPOINTS.DOCUMENT_FIELDS(document.id), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signatureFields
          })
        });
      } catch (error) {
        console.log('Error saving signature fields:', error);
      }
    };
    
    // Debounce the save operation
    const timeoutId = setTimeout(saveDocumentFields, 1000);
    return () => clearTimeout(timeoutId);
  }, [signatureFields, document.id]);

  // Explicit save function for immediate saving
  const saveSignatureFields = async () => {
    if (signatureFields.length === 0) return true;
    
    try {
      const response = await apiFetch(API_ENDPOINTS.DOCUMENT_FIELDS(document.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signatureFields
        })
      });
      
      if (response.ok) {
        console.log('Signature fields saved successfully');
        return true;
      } else {
        console.error('Failed to save signature fields');
        return false;
      }
    } catch (error) {
      console.error('Error saving signature fields:', error);
      return false;
    }
  };

  // Handle opening preview with explicit save
  const handleOpenPreview = async () => {
    // Save current signature field positions before opening preview
    const saved = await saveSignatureFields();
    if (saved) {
      setPreviewOpen(true);
    } else {
      alert('Failed to save signature field positions. Please try again.');
    }
  };

  // Enhanced positioning calculation with debug logging
  const getPreviewFieldPosition = (field: any) => {
    console.log('🔍 Debug: Calculating preview position for field:', field);
    
    // Get the actual container dimensions
    const mainContainer = documentContentRef.current;
    const previewContainer = previewPdfContainerRef.current;
    
    if (mainContainer && previewContainer) {
      const mainRect = mainContainer.getBoundingClientRect();
      const previewRect = previewContainer.getBoundingClientRect();
      
      console.log('📏 Main container dimensions:', {
        width: mainRect.width,
        height: mainRect.height
      });
      
      console.log('📏 Preview container dimensions:', {
        width: previewRect.width,
        height: previewRect.height
      });
      
      // Use relative positions if available, otherwise calculate from absolute
      let xPercent, yPercent, widthPercent, heightPercent;
      
      if (field.relativeX !== undefined && field.relativeY !== undefined) {
        // Use stored relative positions
        xPercent = field.relativeX;
        yPercent = field.relativeY;
        widthPercent = field.relativeWidth || 10;
        heightPercent = field.relativeHeight || 5;
        
        console.log('📊 Using stored relative positions:', {
          xPercent: xPercent.toFixed(2) + '%',
          yPercent: yPercent.toFixed(2) + '%',
          widthPercent: widthPercent.toFixed(2) + '%',
          heightPercent: heightPercent.toFixed(2) + '%'
        });
      } else {
        // Calculate from absolute positions
        xPercent = (field.x / mainRect.width) * 100;
        yPercent = (field.y / mainRect.height) * 100;
        widthPercent = (field.width / mainRect.width) * 100;
        heightPercent = (field.height / mainRect.height) * 100;
        
        console.log('📊 Calculated position percentages:', {
          xPercent: xPercent.toFixed(2) + '%',
          yPercent: yPercent.toFixed(2) + '%',
          widthPercent: widthPercent.toFixed(2) + '%',
          heightPercent: heightPercent.toFixed(2) + '%'
        });
      }
      
      // Convert percentages to pixels in preview container
      const adjustedX = (xPercent / 100) * previewRect.width;
      const adjustedY = (yPercent / 100) * previewRect.height;
      const adjustedWidth = (widthPercent / 100) * previewRect.width;
      const adjustedHeight = (heightPercent / 100) * previewRect.height;
      
      console.log('🎯 Final preview position:', {
        x: adjustedX.toFixed(2),
        y: adjustedY.toFixed(2),
        width: adjustedWidth.toFixed(2),
        height: adjustedHeight.toFixed(2)
      });
      
      return {
        x: Math.max(0, adjustedX),
        y: Math.max(0, adjustedY),
        width: Math.max(20, adjustedWidth),
        height: Math.max(20, adjustedHeight)
      };
    }
    
    // Fallback: use the original position if containers not available
    console.log('⚠️ Containers not available, using original position');
    return {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height
    };
  };

  // Get field position for main document view with proper scrolling
  const getFieldPosition = (field: any) => {
    // Always use relative positioning for consistent placement
    if (field.relativeX !== undefined && field.relativeY !== undefined) {
      const position = {
        left: `${field.relativeX}%`,
        top: `${field.relativeY}%`,
        width: `${field.relativeWidth || 10}%`,
        height: `${field.relativeHeight || 5}%`
      };
      
      console.log('🔍 Debug: Field position (relative):', field.id, position);
      return position;
    }
    
    // Fallback to absolute positioning if relative not available
    const position = {
      left: `${field.x}px`,
      top: `${field.y}px`,
      width: `${field.width}px`,
      height: `${field.height}px`
    };
    
    console.log('🔍 Debug: Field position (absolute):', field.id, position);
    return position;
  };

  const documentAreaRef = useRef<HTMLDivElement>(null);
  const documentContentRef = useRef<HTMLDivElement>(null);
  // Wraps exactly the rendered PDF page; field positions are percentages of this box
  const pageRef = useRef<HTMLDivElement>(null);
  const previewPdfContainerRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signingFieldId, setSigningFieldId] = useState<string | null>(null);
  const [signingFieldIndex, setSigningFieldIndex] = useState<number | null>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [forceShowSidebar] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(false);
  // Server authoritative state for signatures/signers
  const [serverSignatures, setServerSignatures] = useState<Array<{ signerEmail: string }>>([]);
  const [serverSigners, setServerSigners] = useState<string[]>(document.signers || []);
  const [serverUploader, setServerUploader] = useState<string | null>(document.uploaded_by || null);

  // Debug logging when preview opens
  React.useEffect(() => {
    if (previewOpen) {
      console.log('🔍 Debug: Preview opened, signature fields:', signatureFields);
      
      // Add a small delay to ensure containers are rendered
      setTimeout(() => {
        const mainContainer = documentContentRef.current;
        const previewContainer = previewPdfContainerRef.current;
        
        console.log('🔍 Debug: Container refs after preview open:', {
          mainContainer: !!mainContainer,
          previewContainer: !!previewContainer,
          mainContainerRect: mainContainer?.getBoundingClientRect(),
          previewContainerRect: previewContainer?.getBoundingClientRect()
        });
      }, 100);
    }
  }, [previewOpen, signatureFields]);

  // Test function to verify positioning
  const testPositioning = () => {
    console.log('🧪 Testing positioning...');
    
    if (signatureFields.length === 0) {
      console.log('❌ No signature fields to test');
      return;
    }
    
    const testField = signatureFields[0];
    console.log('🧪 Testing field:', testField);
    
    const mainContainer = documentContentRef.current;
    const previewContainer = previewPdfContainerRef.current;
    
    if (mainContainer && previewContainer) {
      const mainRect = mainContainer.getBoundingClientRect();
      const previewRect = previewContainer.getBoundingClientRect();
      
      console.log('🧪 Container comparison:', {
        main: { width: mainRect.width, height: mainRect.height },
        preview: { width: previewRect.width, height: previewRect.height }
      });
      
      const previewPos = getPreviewFieldPosition(testField);
      console.log('🧪 Position test result:', {
        original: { x: testField.x, y: testField.y },
        preview: previewPos
      });
    } else {
      console.log('❌ Containers not available for testing');
    }
  };
  // Track which field is being dragged and its offset
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // const [dragging, setDragging] = useState(false);
  // Track which field is being resized
  const [resizingFieldId, setResizingFieldId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Track which field is being edited for signer
  const [editingSignerId, setEditingSignerId] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState(document.status);
  // Track selected field for keyboard movement
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  // PDF states
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Track the URL used to load the PDF and whether we've tried backend fallback
  const [pdfUrl, setPdfUrl] = useState<string | null>(document.file_url || null);
  // Signature field configuration modal
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [pendingField, setPendingField] = useState<any>(null);
  // Hover preview for signature field placement
  const [hoverPreview, setHoverPreview] = useState<{x: number, y: number, type: string} | null>(null);


  // Color coding for signers
  const signerColors = [
    'blue', 'green', 'purple', 'orange', 'red', 'indigo', 'pink', 'teal'
  ];

  const getSignerColor = (signerIndex: number) => {
    return signerColors[signerIndex % signerColors.length];
  };

  const getSignerColorClasses = (color: string, selected: boolean = false) => {
    const colors = {
      blue: selected ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200',
      green: selected ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200',
      purple: selected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200',
      orange: selected ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200',
      red: selected ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200',
      indigo: selected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
      pink: selected ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700 hover:bg-pink-200',
      teal: selected ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700 hover:bg-teal-200',
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const tools = [
    { id: 'signature', icon: PenTool, label: 'Signature', color: 'blue' },
    { id: 'initial', icon: Type, label: 'Initial', color: 'green' },
    { id: 'date', icon: Calendar, label: 'Date', color: 'purple' },
    { id: 'text', icon: Type, label: 'Text', color: 'orange' },
  ];

  const currentUser = getCurrentUser();
  const normalize = (val?: string) => (val || '').toLowerCase().trim();
  
  // Check if current user is a signer
  const isMeSigner = currentUser && document.signers.some(signer =>
    signer.toLowerCase() === currentUser.email?.toLowerCase() ||
    signer.toLowerCase() === currentUser.username?.toLowerCase()
  );
  
  // Check if current user is the document owner
  const isOwnerByEmail = normalize(document.uploaded_by) === normalize(currentUser?.email);
  const isOwnerByUsername = normalize(document.uploaded_by) === normalize(currentUser?.username);
  const isDocumentOwner = !!currentUser && (isOwnerByEmail || isOwnerByUsername);
  
  // Check if it's the user's turn to sign (enforce signing order)
  const isMyTurnToSign = () => {
    if (!currentUser || !isMeSigner) return false;
    const userEmail = (currentUser.email || '').toLowerCase();
    if (!userEmail) return false;
    const signers = (serverSigners && serverSigners.length > 0) ? serverSigners : document.signers;
    const signatures = serverSignatures || [];
    const userIndex = signers.findIndex(s => s.toLowerCase() === userEmail);
    if (userIndex === -1) return false;
    // Ensure all previous signers have signed
    for (let i = 0; i < userIndex; i++) {
      const prev = signers[i].toLowerCase();
      const prevSigned = signatures.some(sig => (sig.signerEmail || '').toLowerCase() === prev);
      if (!prevSigned) return false;
    }
    // User not already signed
    const alreadySigned = signatures.some(sig => (sig.signerEmail || '').toLowerCase() === userEmail);
    return !alreadySigned;
  };
  
  // Check if user is the uploader and should be first signer
  const isUploaderAsFirstSigner = isDocumentOwner && isMeSigner;

  // Debug logging for signer detection
  console.log('🔍 Debug: Signer Detection', {
    currentUser: currentUser ? {
      email: currentUser.email,
      username: currentUser.username,
      name: currentUser.name
    } : null,
    documentSigners: document.signers,
    documentOwner: document.uploaded_by,
    isMeSigner,
    isDocumentOwner,
    documentStatus: docStatus,
    signatureFields: signatureFields.map(f => ({
      id: f.id,
      type: f.type,
      signer: f.signer,
      assignedToCurrentUser: currentUser ? (
        f.signer.toLowerCase() === currentUser.email?.toLowerCase() ||
        f.signer.toLowerCase() === currentUser.username?.toLowerCase()
      ) : false
    }))
  });

  const handleDocumentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTool) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate relative positions as percentages
    const relativeX = (x / rect.width) * 100;
    const relativeY = (y / rect.height) * 100;
    const relativeWidth = ((selectedTool === 'signature' ? 120 : selectedTool === 'date' ? 80 : 100) / rect.width) * 100;
    const relativeHeight = ((selectedTool === 'signature' ? 40 : 30) / rect.height) * 100;

    // Create pending field for configuration
    const newField = {
      id: Date.now().toString(),
      x: Math.max(0, x - 60), // Center the field on click
      y: Math.max(0, y - 20),
      width: selectedTool === 'signature' ? 120 : selectedTool === 'date' ? 80 : 100,
      height: selectedTool === 'signature' ? 40 : 30,
      type: selectedTool,
      signer: document.signers[0] || 'user@example.com', // Default signer
      pageNumber: pageNumber || 1,
      // Store relative positions
      relativeX: Math.max(0, relativeX - (60 / rect.width) * 100),
      relativeY: Math.max(0, relativeY - (20 / rect.height) * 100),
      relativeWidth,
      relativeHeight
    };

    console.log('🔍 Debug: Created new field with relative positions:', {
      absolute: { x: newField.x, y: newField.y, width: newField.width, height: newField.height },
      relative: { x: newField.relativeX, y: newField.relativeY, width: newField.relativeWidth, height: newField.relativeHeight }
    });

    setPendingField(newField);
    setShowFieldConfig(true);
    setSelectedTool(null);
  };

  const removeField = (fieldId: string) => {
    setSignatureFields(signatureFields.filter(field => field.id !== fieldId));
  };

  const getStatusColor = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'in-progress':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getToolColor = (color: string, selected: boolean) => {
    const colors = {
      blue: selected ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200',
      green: selected ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200',
      purple: selected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200',
      orange: selected ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200',
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getFieldStyle = (field: { type: string; id: string; signerColor?: string }) => {
    const baseStyle = 'absolute border-2 border-dashed rounded cursor-pointer flex items-center justify-center text-xs font-medium';
    const isSelected = selectedFieldId === field.id;
    
    // Use signer color if available, otherwise fall back to type-based colors
    if (field.signerColor) {
      const colorClasses = getSignerColorClasses(field.signerColor, isSelected);
      return `${baseStyle} ${colorClasses}`;
    }
    
    // Fallback to type-based colors
    switch (field.type) {
      case 'signature':
        return `${baseStyle} ${isSelected ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-300' : 'border-blue-400 bg-blue-50'} text-blue-700`;
      case 'initial':
        return `${baseStyle} ${isSelected ? 'border-green-600 bg-green-100 ring-2 ring-green-300' : 'border-green-400 bg-green-50'} text-green-700`;
      case 'date':
        return `${baseStyle} ${isSelected ? 'border-purple-600 bg-purple-100 ring-2 ring-purple-300' : 'border-purple-400 bg-purple-50'} text-purple-700`;
      case 'text':
        return `${baseStyle} ${isSelected ? 'border-orange-600 bg-orange-100 ring-2 ring-orange-300' : 'border-orange-400 bg-orange-50'} text-orange-700`;
      default:
        return `${baseStyle} ${isSelected ? 'border-gray-600 bg-gray-100 ring-2 ring-gray-300' : 'border-gray-400 bg-gray-50'} text-gray-700`;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingFieldId) {
      const rect = (pageRef.current ?? e.currentTarget).getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      
      // Update both absolute and relative positions
      const relativeX = (x / rect.width) * 100;
      const relativeY = (y / rect.height) * 100;
      
      setSignatureFields(fields => fields.map(f => 
        f.id === draggingFieldId ? { 
          ...f, 
          x, 
          y,
          relativeX,
          relativeY
        } : f
      ));
    } else if (resizingFieldId && resizeStart) {
      const rect = (pageRef.current ?? e.currentTarget).getBoundingClientRect();
      const width = Math.max(40, e.clientX - rect.left - resizeStart.x);
      const height = Math.max(20, e.clientY - rect.top - resizeStart.y);
      
      // Update both absolute and relative positions
      const relativeWidth = (width / rect.width) * 100;
      const relativeHeight = (height / rect.height) * 100;
      
      setSignatureFields(fields => fields.map(f => 
        f.id === resizingFieldId ? { 
          ...f, 
          width, 
          height,
          relativeWidth,
          relativeHeight
        } : f
      ));
    }
  };
  const handleMouseUp = () => {
    setDraggingFieldId(null);
    setResizingFieldId(null);
    setResizeStart(null);
  };

  // Add document event listeners for drag
  React.useEffect(() => {
    if (!draggingFieldId) return;
    const handleMove = (e: MouseEvent) => {
      if (!pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      
      // Update both absolute and relative positions
      const relativeX = (x / rect.width) * 100;
      const relativeY = (y / rect.height) * 100;
      
      setSignatureFields(fields => fields.map(f => 
        f.id === draggingFieldId ? { 
          ...f, 
          x, 
          y,
          relativeX,
          relativeY
        } : f
      ));
    };
    const handleUp = () => {
      setDraggingFieldId(null);
      // setDragging(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingFieldId, dragOffset]);

  // Add keyboard event listeners for arrow key movement
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedFieldId || docStatus === 'completed') return;
      
      // Check if arrow keys are pressed
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        // Determine step size (hold Shift for larger steps)
        const stepSize = e.shiftKey ? 10 : 1;
        
        let deltaX = 0;
        let deltaY = 0;
        
        switch (e.key) {
          case 'ArrowUp':
            deltaY = -stepSize;
            break;
          case 'ArrowDown':
            deltaY = stepSize;
            break;
          case 'ArrowLeft':
            deltaX = -stepSize;
            break;
          case 'ArrowRight':
            deltaX = stepSize;
            break;
        }
        
        // Update the selected field position with both absolute and relative positioning
        setSignatureFields(fields => 
          fields.map(field => 
            field.id === selectedFieldId 
              ? { 
                  ...field, 
                  x: Math.max(0, field.x + deltaX),
                  y: Math.max(0, field.y + deltaY),
                  // Update relative positions based on container size
                  relativeX: pageRef.current ? Math.max(0, ((field.x + deltaX) / pageRef.current.getBoundingClientRect().width) * 100) : field.relativeX,
                  relativeY: pageRef.current ? Math.max(0, ((field.y + deltaY) / pageRef.current.getBoundingClientRect().height) * 100) : field.relativeY
                }
              : field
          )
        );
      }
      
      // Escape key to deselect field
      if (e.key === 'Escape') {
        setSelectedFieldId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedFieldId, docStatus]);

  // Download handler: print the document area
  const handleDownload = async () => {
    if (!documentContentRef.current) return;
    const canvas = await html2canvas(documentContentRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${document.name || 'document'}.pdf`);
  };

  // Generate final signed PDF handler
  const handleGenerateFinalPDF = async () => {
    try {
      const response = await apiFetch(API_ENDPOINTS.DOCUMENT_GENERATE_PDF(document.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ Final signed document generated successfully!\n\n📄 Document: ${result.documentName}\n✍️ Total Signatures: ${result.totalSignatures}\n\nYou can now download the final signed document.`);
        // Trigger download of the final document (authorized only for initiator)
        await downloadFile(API_ENDPOINTS.DOCUMENT_DOWNLOAD(document.id));
      } else {
        alert(`Failed to generate final PDF: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating final PDF:', error);
      alert('Failed to generate final PDF. Please try again.');
    }
  };
  // Send handler: send document for signing with signature fields
  const handleSend = async () => {
    if (signatureFields.length === 0) {
      alert('Please add at least one signature field before sending');
      return;
    }
    
    try {
      const response = await apiFetch(API_ENDPOINTS.DOCUMENT_SEND(document.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signatureFields
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`Document sent successfully to ${result.firstSigner || 'signers'}!`);
      } else {
        alert(`Failed to send document: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending document:', error);
      alert('Failed to send document. Please try again.');
    }
  };

  // Complete handler: save signature field adjustments
  const handleComplete = async () => {
    if (!currentUser) {
      alert('You must be logged in to complete this action');
      return;
    }
    
    const saved = await saveSignatureFields();
    
    if (saved) {
      // Show success message and preview
      const successMessage = `✅ All signature fields saved successfully!\n\n📋 Summary:\n• ${signatureFields.length} signature field${signatureFields.length !== 1 ? 's' : ''} configured\n• All fields assigned to signers\n• Ready for document review\n\nNext steps:\n• Review with "View Before Send"\n• Send document for signing\n• Or continue editing if needed`;
      alert(successMessage);
      // Show preview option
      setPreviewOpen(true);
    } else {
      alert('Failed to save signature fields. Please try again.');
    }
  };

  // Sign document handler (for actual signing)
  const handleSignDocument = async () => {
    if (!currentUser) {
      alert('You must be logged in to sign documents');
      return;
    }
    
    try {
      const signerEmail = currentUser.email || '';
      
      const response = await apiFetch(API_ENDPOINTS.DOCUMENT_SIGN(document.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerEmail,
          signatureData: {
            signatureFields,
            signedAt: new Date().toISOString(),
            signerName: currentUser.name || currentUser.username
          }
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        const { isCompleted, nextSigner } = result;
        setDocStatus(isCompleted ? 'completed' : 'in-progress');
        if (isCompleted) {
          alert('✅ Document signed and completed! The sender has been notified.');
        } else {
          alert(`✅ Document signed! Moving to next signer${nextSigner ? `: ${nextSigner}` : ''}. The sender has been notified.`);
        }
        
        // Notify parent component to refresh documents
        if (onDocumentSigned) {
          onDocumentSigned();
        }
        
        if (isCompleted) {
          setTimeout(() => {
            onBack(); // Go back to dashboard after completing
          }, 1000);
        }
      } else {
        alert(`Failed to sign document: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to sign document. Please try again.');
    }
  };

  // Handle signature field configuration completion
  const handleFieldConfigComplete = () => {
    if (pendingField) {
      // Ensure relative positions are calculated and stored
      const fieldWithRelativePos = {
        ...pendingField,
        relativeX: pendingField.relativeX || 0,
        relativeY: pendingField.relativeY || 0,
        relativeWidth: pendingField.relativeWidth || 10,
        relativeHeight: pendingField.relativeHeight || 5
      };
      
      setSignatureFields([...signatureFields, fieldWithRelativePos]);
      setPendingField(null);
      setShowFieldConfig(false);
      
      // Show success message
      alert(`✅ Signature field added successfully!\n\nField Type: ${pendingField.type}\nAssigned to: ${pendingField.signer}\n\nYou can now:\n• Add more fields\n• Complete to save all fields\n• View before sending`);
    }
  };

  // Handle signature field configuration cancellation
  const handleFieldConfigCancel = () => {
    setPendingField(null);
    setShowFieldConfig(false);
  };

  // PDF handling functions
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPdfError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setPdfError('Failed to load PDF document');
  }, []);

  // Protected files are fetched with the session token
  const pdfFile = React.useMemo(
    () => (pdfUrl ? { url: apiUrl(pdfUrl), httpHeaders: authHeaders() } : undefined),
    [pdfUrl]
  );

  // Reset PDF URL when document changes
  React.useEffect(() => {
    setPdfUrl(document.file_url || null);
  }, [document.file_url]);

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages || 1, prev + 1));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
              
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{document.name}</h1>
                <div className="flex items-center space-x-4 mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(docStatus)}`}>
                    {docStatus.charAt(0).toUpperCase() + docStatus.slice(1)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {document.signers.length} signer{document.signers.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-gray-500">{document.size}</span>
                </div>
              </div>
            </div>
            
            {/* === Toolbar Buttons (replace lines 686-757) === */}
            {isDocumentOwner ? (
              <div className="flex items-center space-x-3">
                {/* Setup Status Indicator */}
                {setupCompleted && (
                  <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-800 rounded-lg">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Setup Completed</span>
                  </div>
                )}

                {/* Send or Sign & Send depending on whether owner is first signer */}
                {setupCompleted && signatureFields.length > 0 && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    onClick={async () => {
                      // First try sending. If backend says owner is first, prompt signing instead.
                      const response = await apiFetch(API_ENDPOINTS.DOCUMENT_SEND(document.id), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ signatureFields })
                      });
                      const result = await response.json();
                      if (response.ok && result.ownerFirst) {
                        // Owner should sign now instead of emailing
                        alert('You are the first signer. Please sign now to start the flow.');
                        // Switch UI to signer mode by opening preview or enabling sign buttons
                        setSetupCompleted(false);
                      } else if (response.ok) {
                        alert(`Document sent successfully to ${result.firstSigner || 'signers'}!`);
                      } else {
                        alert(`Failed to send document: ${result.error || 'Unknown error'}`);
                      }
                    }}
                    disabled={docStatus === 'completed'}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{document.uploaded_by && document.signers && document.signers.length > 0 && (document.signers[0] === (currentUser?.email || currentUser?.username)) ? 'Sign & Send' : 'Send Document'}</span>
                  </button>
                )}
                {/* Edit Fields button - allow owner to re-enter setup mode */}
                {setupCompleted && docStatus !== 'completed' && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    onClick={() => setSetupCompleted(false)}
                  >
                    <PenTool className="w-4 h-4" />
                    <span>Edit Fields</span>
                  </button>
                )}
                
                {/* View before send button - only for owner and before setup completion */}
                {signatureFields.length > 0 && !setupCompleted && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    onClick={handleOpenPreview}
                    disabled={docStatus === 'completed'}
                  >
                    <Eye className="w-4 h-4" />
                    <span>Preview</span>
                  </button>
                )}
                {/* Generate Final PDF button - only for completed documents */}
                {docStatus === 'completed' && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                    onClick={handleGenerateFinalPDF}
                  >
                    <Download className="w-4 h-4" />
                    <span>Generate Final PDF</span>
                  </button>
                )}
              </div>
            ) : isMeSigner ? (
              <div className="flex flex-col items-center">
                {/* Check if it's the user's turn to sign */}
                {!isMyTurnToSign() && !isUploaderAsFirstSigner ? (
                  <div className="text-orange-600 font-semibold mb-4">
                    Waiting for previous signers to complete their signatures.
                  </div>
                ) : (
                  <>
                    {signatureFields.filter(f => (f.signer.toLowerCase() === (currentUser.email?.toLowerCase() || currentUser.username?.toLowerCase())) && !f.signatureDataUrl).length > 0 && (
                      <div className="text-orange-600 font-semibold mb-2">You have unsigned fields above. You can still submit when ready.</div>
                    )}
                    <button
                      className="mt-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg"
                      onClick={async () => {
                        await handleSignDocument();
                      }}
                      disabled={docStatus === 'completed'}
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}

        
                {/* Show sidebar for document owners - with fallback for testing */}
        {(isDocumentOwner || (currentUser && !document.uploaded_by) || forceShowSidebar) && !setupCompleted && (
          <div className="w-80 bg-white border-r border-gray-200 h-screen sticky top-32">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Signature Tools</h2>
              {/* Sign as Myself button */}
              {isMeSigner && (
                <button
                  className="w-full mb-4 flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  onClick={() => {
                    setSelectedTool('signature');
                  }}
                >
                  Sign as Myself
                </button>
              )}
              
              <div className="space-y-3 mb-6">
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  const isSelected = selectedTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedTool(isSelected ? null : tool.id as any)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors ${getToolColor(tool.color, isSelected)}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              {selectedTool && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800">
                    <strong>Click on the document</strong> to place a {selectedTool} field.
                  </p>
                  <p className="text-xs text-blue-700 mt-2">
                    Each field will be color-coded by signer for easy identification.
                  </p>
                </div>
              )}



              {/* Signature Fields Summary */}
              {signatureFields.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Signature Fields ({signatureFields.length})</h4>
                  <div className="space-y-2">
                    {signatureFields.map((field) => (
                      <div key={field.id} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="flex items-center space-x-2">
                          <div className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                            field.type === 'signature' ? 'bg-blue-100 text-blue-700' :
                            field.type === 'initial' ? 'bg-green-100 text-green-700' :
                            field.type === 'date' ? 'bg-purple-100 text-purple-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {field.type.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-700">{field.type}</span>
                        </div>
                        <span className="text-xs text-gray-600 truncate max-w-24" title={field.signer}>
                          {field.signer}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Complete Setup Button */}
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <button
                      className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                      onClick={async () => {
                        const saved = await saveSignatureFields();
                        if (saved) {
                          setSetupCompleted(true);
                          alert('✅ Setup completed! Signature fields are finalized. You can now send the document to signers.');
                        } else {
                          alert('Failed to save signature fields. Please try again.');
                        }
                      }}
                      disabled={docStatus === 'completed' as Document['status']}
                    >
                      <CheckCircle className="w-5 h-5" />
                      <span>Complete Setup</span>
                    </button>
                    <p className="text-xs text-green-700 mt-2 text-center">
                      Finalize signature field placement and exit edit mode
                    </p>
                  </div>
                </div>
              )}


              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Signers & Colors</h3>
                <div className="space-y-2">
                  {document.signers.map((signer, index) => {
                    const signerColor = getSignerColor(index);
                    const colorClasses = getSignerColorClasses(signerColor);
                    return (
                      <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClasses}`}>
                          <span className="text-xs font-medium">
                            {signer.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{signer}</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs text-gray-500">
                              {document.status === 'completed' ? 'Signed' : 'Pending'}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${colorClasses}`}>
                              {signerColor}
                            </span>
                          </div>
                        </div>
                        {document.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document Area */}
        <div
          ref={documentAreaRef}
          className="flex-1 p-8"
        >
          <div className="max-w-4xl mx-auto">
            <div 
              ref={documentContentRef}
              className="bg-white rounded-lg shadow-lg border border-gray-200 min-h-[800px] relative cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{
                cursor: selectedTool ? 'crosshair' : 'default'
              }}
            >
              {/* Document Content - PDF Viewer */}
              <div className="w-full h-full min-h-[800px] relative">
                
                {/* PDF Container with Natural Scrolling */}
                <div className="w-full min-h-[700px] border border-gray-300 rounded relative" style={{ overflow: 'auto', position: 'relative', height: '700px' }}>
                  {document.file_url ? (
                    <div ref={pageRef} className="relative inline-block align-top">
                      {/* PDF Render using react-pdf to keep overlay in sync with scroll/size */}
                      <PDFDocument
                        key={pdfUrl || 'pdf'}
                        file={pdfFile}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                      >
                        <Page pageNumber={pageNumber} height={700} />
                      </PDFDocument>
                      
                      {/* Signature Fields Container - Positioned relative to PDF container */}
                       <div 
                        className="absolute inset-0" 
                        style={{ 
                          position: 'absolute', 
                          top: 0, 
                          left: 0, 
                          right: 0, 
                          bottom: 0, 
                          transform: 'translateZ(0)', 
                          // Important: allow children to receive pointer events (sign button etc.)
                          pointerEvents: 'auto',
                          zIndex: 10
                        }}
                      >
                        {/* Transparent overlay for signature field placement */}
                        {selectedTool && (
                          <div 
                            className="absolute inset-0 bg-transparent cursor-crosshair"
                            style={{ zIndex: 5, pointerEvents: 'auto' }}
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const y = e.clientY - rect.top;
                              setHoverPreview({
                                x: Math.max(0, x - 60),
                                y: Math.max(0, y - 20),
                                type: selectedTool
                              });
                            }}
                            onMouseLeave={() => setHoverPreview(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const y = e.clientY - rect.top;

                              // Calculate relative positions as percentages
                              const relativeX = (x / rect.width) * 100;
                              const relativeY = (y / rect.height) * 100;
                              const relativeWidth = ((selectedTool === 'signature' ? 120 : selectedTool === 'date' ? 80 : 100) / rect.width) * 100;
                              const relativeHeight = ((selectedTool === 'signature' ? 40 : 30) / rect.height) * 100;

                              // Create pending field for configuration
                              const newField = {
                                id: Date.now().toString(),
                                x: Math.max(0, x - 60), // Center the field on click
                                y: Math.max(0, y - 20),
                                width: selectedTool === 'signature' ? 120 : selectedTool === 'date' ? 80 : 100,
                                height: selectedTool === 'signature' ? 40 : 30,
                                type: selectedTool,
                                signer: document.signers[0] || 'user@example.com', // Default signer
                                signerColor: getSignerColor(0), // Default color for first signer
                                // Store relative positions
                                relativeX: Math.max(0, relativeX - (60 / rect.width) * 100),
                                relativeY: Math.max(0, relativeY - (20 / rect.height) * 100),
                                relativeWidth,
                                relativeHeight
                              };

                              console.log('🔍 Debug: Created new field with relative positions:', {
                                absolute: { x: newField.x, y: newField.y, width: newField.width, height: newField.height },
                                relative: { x: newField.relativeX, y: newField.relativeY, width: newField.relativeWidth, height: newField.relativeHeight }
                              });

                              setPendingField(newField);
                              setShowFieldConfig(true);
                              setSelectedTool(null);
                              setHoverPreview(null);
                            }}
                          />
                        )}

                        {/* Hover preview for signature field placement */}
                        {hoverPreview && selectedTool && (
                          <div
                            className={`absolute border-2 border-dashed rounded opacity-50 pointer-events-none ${
                              hoverPreview.type === 'signature' ? 'border-blue-400 bg-blue-50' :
                              hoverPreview.type === 'initial' ? 'border-green-400 bg-green-50' :
                              hoverPreview.type === 'date' ? 'border-purple-400 bg-purple-50' :
                              'border-orange-400 bg-orange-50'
                            }`}
                            style={{
                              left: hoverPreview.x,
                              top: hoverPreview.y,
                              width: selectedTool === 'signature' ? 120 : selectedTool === 'date' ? 80 : 100,
                              height: selectedTool === 'signature' ? 40 : 30,
                              zIndex: 8,
                            }}
                          >
                            <div className="flex flex-col items-center justify-center w-full h-full">
                              <span className="text-xs font-bold opacity-75">
                                {hoverPreview.type.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Signature Fields - Natural Scrolling Position */}
                        {signatureFields
                          .filter(field => (field.pageNumber || 1) === (pageNumber || 1))
                          .map((field, index) => {
                          const isFieldForCurrentUser = currentUser && (
                            (currentUser.email && field.signer.toLowerCase() === currentUser.email.toLowerCase()) ||
                            (currentUser.username && field.signer.toLowerCase() === currentUser.username.toLowerCase())
                          );
                          const isSigned = !!field.signatureDataUrl;
                          const fieldPosition = getFieldPosition(field);
                          
                          if (isDocumentOwner) {
                            // OWNER: full interactive field - use relative positioning
                            return (
                              <div
                                key={field.id}
                                style={{
                                  position: 'absolute',
                                  ...fieldPosition,
                                  zIndex: 10,
                                  transform: 'translateZ(0)', // Force hardware acceleration
                                  pointerEvents: 'auto',
                                  willChange: 'transform', // Optimize for animations
                                  cursor: 'move'
                                }}
                                className={getFieldStyle(field)}
                                onMouseDown={e => {
                                  setDraggingFieldId(field.id);
                                  setDragOffset({ x: e.clientX - field.x, y: e.clientY - field.y });
                                  e.stopPropagation();
                                }}
                                onClick={() => setSelectedFieldId(field.id)}
                              >
                                <div className="flex flex-col items-center w-full h-full justify-center relative">
                                  <span className="font-bold text-xs mb-1">{field.type.toUpperCase()}</span>
                                  <div className="text-center">
                                    <span className="text-xs text-gray-600 block">Sign here:</span>
                                    <span className="text-xs font-medium text-blue-700">{field.signer}</span>
                                    {field.signerColor && (
                                      <span className="text-xs opacity-75 block">({field.signerColor})</span>
                                    )}
                                  </div>
                                  {editingSignerId === field.id ? (
                                    <select
                                      className="mt-1 text-xs border border-gray-300 rounded px-1 py-0.5"
                                      value={field.signer}
                                      onChange={e => {
                                        const newSigner = e.target.value;
                                        setSignatureFields(fields => fields.map(f => f.id === field.id ? { ...f, signer: newSigner } : f));
                                        setTimeout(() => setEditingSignerId(null), 0);
                                      }}
                                      autoFocus
                                    >
                                      {document.signers.map(signer => (
                                        <option key={signer} value={signer}>{signer}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <button
                                      className="text-xs text-blue-600 underline mt-1"
                                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setEditingSignerId(field.id);
                                      }}
                                    >
                                      Change signer
                                    </button>
                                  )}
                                  {/* Trash icon for deleting the box */}
                                  {document.status !== 'completed' && (
                                    <button
                                      className="absolute top-1 right-1 text-red-500 hover:text-red-700 bg-white rounded-full p-0.5"
                                      style={{ zIndex: 30 }}
                                      title="Delete signature box"
                                      onClick={e => {
                                        e.stopPropagation();
                                        removeField(field.id);
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {/* Resize handle (bottom-right corner) */}
                                  {document.status !== 'completed' && (
                                    <div
                                      className="resize-handle absolute right-0 bottom-0 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize"
                                      style={{ zIndex: 20 }}
                                      onMouseDown={e => {
                                        setResizingFieldId(field.id);
                                        setResizeStart({ x: field.x, y: field.y, width: field.width, height: field.height });
                                        e.stopPropagation();
                                      }}
                                    />
                                  )}
                                  {/* Show signature if signed */}
                                  {isSigned && (
                                    <img src={field.signatureDataUrl} alt="Signature" className="max-h-12 max-w-full mt-2 border border-gray-300 rounded bg-white" />
                                  )}
                                </div>
                              </div>
                            );
                          } else {
                            // SIGNER: static field, only show sign button for assigned signer
                            const canSignThisField = isFieldForCurrentUser && 
                              docStatus !== 'completed' && 
                              !isSigned && 
                              (isMyTurnToSign() || isUploaderAsFirstSigner);
                            
                            return (
                              <div
                                key={field.id}
                                style={{
                                  position: 'absolute',
                                  ...fieldPosition,
                                  zIndex: 10,
                                  pointerEvents: canSignThisField ? 'auto' : 'none', // Make clickable for signers who can sign
                                  transform: 'translateZ(0)', // Force hardware acceleration
                                  willChange: 'transform', // Optimize for animations
                                  cursor: canSignThisField ? 'pointer' : 'default'
                                }}
                                className={getFieldStyle(field)}
                              >
                                <div className="flex flex-col items-center w-full h-full justify-center relative">
                                  <span className="font-bold text-xs mb-1">{field.type.toUpperCase()}</span>
                                  <div className="text-center">
                                    <span className="text-xs text-gray-600 block">Sign here:</span>
                                    <span className="text-xs font-medium text-blue-700">{field.signer}</span>
                                    {field.signerColor && (
                                      <span className="text-xs opacity-75 block">({field.signerColor})</span>
                                    )}
                                  </div>
                                  
                                  {/* Show signing status */}
                                  {isFieldForCurrentUser && !isSigned && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {canSignThisField ? 'Ready to sign' : 'Waiting for previous signers'}
                                    </div>
                                  )}
                                  
                                  {/* Only show sign button for assigned signer, not signed, not completed, and it's their turn */}
                                  {canSignThisField && (
                                    <button
                                      className="mt-2 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors"
                                      style={{ 
                                        pointerEvents: 'auto',
                                        zIndex: 20,
                                        position: 'relative'
                                      }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        console.log('🔍 Debug: Sign button clicked for field:', field.id, 'index:', index);
                                        console.log('🔍 Debug: Current user:', currentUser);
                                        console.log('🔍 Debug: Field signer:', field.signer);
                                        setSigningFieldId(field.id);
                                        setSigningFieldIndex(index);
                                        setSignatureModalOpen(true);
                                      }}
                                    >
                                      Sign
                                    </button>
                                  )}
                                  
                                  {/* Show signature if signed */}
                                  {isSigned && (
                                    <img src={field.signatureDataUrl} alt="Signature" className="max-h-12 max-w-full mt-2 border border-gray-300 rounded bg-white" />
                                  )}
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <p>No document file available</p>
                    </div>
                  )}
                </div>
              </div>


            </div>
          </div>
        </div>
      </div>
      {/* Signature Field Configuration Modal */}
      {showFieldConfig && pendingField && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Configure Signature Field</h2>
              <button
                className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={handleFieldConfigCancel}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <div className="space-y-4">
                {/* Field Type Display */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      pendingField.type === 'signature' ? 'bg-blue-100 text-blue-700' :
                      pendingField.type === 'initial' ? 'bg-green-100 text-green-700' :
                      pendingField.type === 'date' ? 'bg-purple-100 text-purple-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {pendingField.type === 'signature' ? '✍️' :
                       pendingField.type === 'initial' ? 'T' :
                       pendingField.type === 'date' ? '📅' : 'T'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{pendingField.type.charAt(0).toUpperCase() + pendingField.type.slice(1)} Field</p>
                      <p className="text-sm text-gray-600">Click on document to place this field</p>
                    </div>
                  </div>
                </div>

                {/* Signer Selection with Color Coding */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Who should sign this field?
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={pendingField.signer}
                    onChange={(e) => {
                      const selectedSigner = e.target.value;
                      const signerIndex = document.signers.findIndex(s => s === selectedSigner);
                      setPendingField({
                        ...pendingField, 
                        signer: selectedSigner,
                        signerColor: getSignerColor(signerIndex)
                      });
                    }}
                  >
                    {document.signers.map((signer, index) => (
                      <option key={signer} value={signer}>
                        {signer} ({getSignerColor(index)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field Preview with Color Coding */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Field Preview:</p>
                  <div 
                    className={`border-2 border-dashed rounded flex items-center justify-center text-xs font-medium ${
                      pendingField.signerColor ? getSignerColorClasses(pendingField.signerColor).split(' ')[0] : 'border-blue-400'
                    } bg-opacity-10`}
                    style={{
                      width: pendingField.width,
                      height: pendingField.height,
                      borderColor: pendingField.signerColor ? getSignerColorClasses(pendingField.signerColor).includes('blue') ? '#3B82F6' :
                        getSignerColorClasses(pendingField.signerColor).includes('green') ? '#10B981' :
                        getSignerColorClasses(pendingField.signerColor).includes('purple') ? '#8B5CF6' :
                        getSignerColorClasses(pendingField.signerColor).includes('orange') ? '#F59E0B' :
                        getSignerColorClasses(pendingField.signerColor).includes('red') ? '#EF4444' :
                        getSignerColorClasses(pendingField.signerColor).includes('indigo') ? '#6366F1' :
                        getSignerColorClasses(pendingField.signerColor).includes('pink') ? '#EC4899' :
                        getSignerColorClasses(pendingField.signerColor).includes('teal') ? '#14B8A6' : '#3B82F6' : '#3B82F6'
                    }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-bold">{pendingField.type.toUpperCase()}</span>
                      <span className="text-xs font-medium">{pendingField.signer}</span>
                      <span className="text-xs opacity-75">({pendingField.signerColor || 'blue'})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="border-t border-gray-200 p-6 flex items-center justify-end space-x-3">
              <button
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={handleFieldConfigCancel}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                onClick={handleFieldConfigComplete}
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full mx-4 relative" style={{ height: '95vh' }}>
            {/* Header with title and close button */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {signatureFields.length > 0 
                    ? `${signatureFields.length} signature field${signatureFields.length !== 1 ? 's' : ''} placed`
                    : 'No signature fields added yet'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {/* Debug button for testing positioning */}
                <button
                  className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs"
                  onClick={() => {
                    console.log('🔍 Debug: Manual positioning test');
                    const mainContainer = documentContentRef.current;
                    const previewContainer = previewPdfContainerRef.current;
                    console.log('Main container:', mainContainer?.getBoundingClientRect());
                    console.log('Preview container:', previewContainer?.getBoundingClientRect());
                    console.log('Signature fields:', signatureFields);
                  }}
                >
                  Debug Pos
                </button>
                <button
                  className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => setPreviewOpen(false)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 overflow-auto p-6" style={{ height: 'calc(95vh - 180px)' }}>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 min-h-[700px] relative inline-block align-top">
                {/* PDF Embed */}
                <div 
                  ref={previewPdfContainerRef}
                  className="w-full min-h-[700px] border border-gray-300 rounded relative"
                >
                  {document.file_url ? (
                    <>
                       {/* PDF Render using react-pdf for preview */}
                        <PDFDocument
                          key={`preview-${pdfUrl || 'pdf'}`}
                          file={pdfFile}
                          onLoadSuccess={onDocumentLoadSuccess}
                          onLoadError={onDocumentLoadError}
                        >
                          <Page pageNumber={pageNumber} height={700} />
                        </PDFDocument>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <p>No document file available</p>
                    </div>
                  )}
                </div>

                {/* Signature Fields - Read-only in preview (use relative % for consistency) */}
                {signatureFields
                  .filter(field => (field.pageNumber || 1) === (pageNumber || 1))
                  .map((field) => (
                  <div
                    key={field.id}
                    className={`absolute border-2 border-dashed rounded flex items-center justify-center text-xs font-medium ${
                      field.type === 'signature' ? 'border-blue-400 bg-blue-50 text-blue-700' :
                      field.type === 'initial' ? 'border-green-400 bg-green-50 text-green-700' :
                      field.type === 'date' ? 'border-purple-400 bg-purple-50 text-purple-700' :
                      'border-orange-400 bg-orange-50 text-orange-700'
                    }`}
                    style={{
                      left: `${field.relativeX ?? (field.x / (documentContentRef.current?.getBoundingClientRect().width || 1) * 100)}%`,
                      top: `${field.relativeY ?? (field.y / (documentContentRef.current?.getBoundingClientRect().height || 1) * 100)}%`,
                      width: `${field.relativeWidth ?? (field.width / (documentContentRef.current?.getBoundingClientRect().width || 1) * 100)}%`,
                      height: `${field.relativeHeight ?? (field.height / (documentContentRef.current?.getBoundingClientRect().height || 1) * 100)}%`,
                      zIndex: 10,
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    <div className="flex flex-col items-center w-full h-full justify-center">
                      <span className="font-bold text-xs mb-1">{field.type.toUpperCase()}</span>
                      <span className="text-xs text-gray-600">{field.signer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer with action buttons */}
            <div className="border-t border-gray-200 p-6 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Document:</span> {document.name}
                {signatureFields.length > 0 && (
                  <span className="ml-4">
                    <span className="font-medium">Signers:</span> {document.signers.length}
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close Preview
                </button>
                
                <button
                  className="flex items-center space-x-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setPreviewOpen(false);
                    handleDownload();
                  }}
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
                
                {/* Send button for document owner */}
                {currentUser && document.uploaded_by === (currentUser.email || currentUser.username) && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    onClick={async () => {
                      const saved = await saveSignatureFields();
                      if (saved) {
                        setPreviewOpen(false);
                        handleSend();
                      } else {
                        alert('Failed to save signature field positions. Please try again.');
                      }
                    }}
                    disabled={docStatus === 'completed' || signatureFields.length === 0}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Send for Signing</span>
                  </button>
                )}
                
                {/* Sign document button for signers */}
                {isMeSigner && (
                  <button
                    className="flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                    onClick={() => {
                      setPreviewOpen(false);
                      handleSignDocument();
                    }}
                    disabled={docStatus === 'completed'}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Sign Document</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Signature Modal for signing a field */}
      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => {
          console.log('🔍 Debug: Signature modal closed');
          setSignatureModalOpen(false);
          setSigningFieldId(null);
          setSigningFieldIndex(null);
          setPendingSignature(null);
        }}
        onSave={signatureDataUrl => {
          console.log('🔍 Debug: Signature saved, field index:', signingFieldIndex, 'dataUrl length:', signatureDataUrl.length);
          if (signingFieldIndex !== null) {
            setSignatureFields(fields => fields.map((f, i) =>
              i === signingFieldIndex ? { ...f, signatureDataUrl } : f
            ));
            console.log('🔍 Debug: Signature field updated successfully');
          } else {
            console.error('❌ No signing field index available');
          }
          setSignatureModalOpen(false);
          setSigningFieldId(null);
          setSigningFieldIndex(null);
          setPendingSignature(null);
        }}
      />
    </div>
  );
};

export default DocumentViewer;