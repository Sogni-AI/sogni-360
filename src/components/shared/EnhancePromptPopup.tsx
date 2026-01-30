import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface EnhancePromptPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (prompt: string) => void;
  title?: string;
  description?: string;
  imageCount?: number;
  tokenType?: 'spark' | 'sogni';
}

const DEFAULT_PROMPT = '(Extra detailed and contrasty portrait) Portrait masterpiece';

const EnhancePromptPopup: React.FC<EnhancePromptPopupProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Enhance Image',
  description = 'Customize the enhancement prompt to control how your image is enhanced.',
  imageCount = 1,
  tokenType = 'spark'
}) => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [costEstimate, setCostEstimate] = useState<{ token: number; usd: number } | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);

  // Fetch cost estimate when popup opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchCost = async () => {
      setLoadingCost(true);
      try {
        const result = await api.estimateCost({
          model: 'z_image_turbo_bf16',
          imageCount: imageCount,
          stepCount: 6,
          tokenType,
          guideImage: true, // Enhancement uses starting image
          denoiseStrength: 0.75, // 0.75 = preserve 75% of original
          contextImages: 0 // Not using context images for enhancement
        });
        setCostEstimate(result);
      } catch (err) {
        console.warn('Cost estimation failed:', err);
        setCostEstimate(null);
      } finally {
        setLoadingCost(false);
      }
    };

    fetchCost();
  }, [isOpen, imageCount, tokenType]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(prompt);
    onClose();
  };

  const handleResetPrompt = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  const formatCost = () => {
    if (loadingCost) return 'Estimating...';
    if (!costEstimate) return '—';
    // Handle both string and number values from API
    const tokenValue = typeof costEstimate.token === 'string'
      ? parseFloat(costEstimate.token)
      : costEstimate.token;
    const usdValue = typeof costEstimate.usd === 'string'
      ? parseFloat(costEstimate.usd)
      : costEstimate.usd;

    if (isNaN(tokenValue)) return '—';

    const tokenCost = tokenValue.toFixed(2);
    const usdCost = usdValue && !isNaN(usdValue) ? ` (~$${usdValue.toFixed(2)})` : '';
    return `${tokenCost} ${tokenType}${usdCost}`;
  };

  return (
    <div className="enhance-popup-overlay" onClick={onClose}>
      <div className="enhance-popup" onClick={(e) => e.stopPropagation()}>
        <div className="enhance-popup-header">
          <h3>{title}</h3>
          <button className="enhance-popup-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="enhance-popup-body">
          <p className="enhance-popup-desc">{description}</p>

          {imageCount > 1 && (
            <div className="enhance-popup-count">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{imageCount} images will be enhanced</span>
            </div>
          )}

          <div className="enhance-prompt-field">
            <label htmlFor="enhance-prompt">Enhancement Prompt</label>
            <textarea
              id="enhance-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter enhancement prompt..."
              rows={3}
            />
            <button className="enhance-reset-btn" onClick={handleResetPrompt} type="button">
              Reset to Default
            </button>
          </div>

          <div className="enhance-popup-cost">
            <span className="cost-label">Estimated Cost:</span>
            <span className="cost-value">{formatCost()}</span>
          </div>
        </div>

        <div className="enhance-popup-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary enhance-btn" onClick={handleConfirm}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{imageCount > 1 ? `Enhance ${imageCount} Images` : 'Enhance'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancePromptPopup;
