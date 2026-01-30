import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/stripe/StripePurchase.css';
import ProductList from './ProductList';
import PurchaseProgress from './PurchaseProgress';
import useSparkPurchase from '../../hooks/useSparkPurchase';

const BACKGROUND_IMAGES = [
  'https://images.unsplash.com/photo-1557683316-973673baf926?w=800',
  'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800',
  'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=800',
];

interface Props {
  onClose: () => void;
  currentBalance?: number;
}

function StripePurchase({ onClose, currentBalance }: Props) {
  const modalStyle = useMemo<CSSProperties>(() => {
    const index = Math.floor(Math.random() * BACKGROUND_IMAGES.length);
    return {
      backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.95)), url(${BACKGROUND_IMAGES[index]})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }, []);

  const [open, setOpen] = useState(true);
  const { products, purchaseIntent, purchaseStatus, loading, makePurchase, reset, refreshStatus } =
    useSparkPurchase();
  const purchaseId = purchaseIntent?.purchaseId;

  // Note: Balance updates happen automatically via WebSocket (useEntity hook in useWallet)
  // No polling needed - the SDK's DataEntity emits 'updated' events when balance changes

  // If new purchase URL available, open it in new window
  useEffect(() => {
    if (purchaseIntent) {
      window.open(purchaseIntent.url, '_blank');
      refreshStatus();
    }
  }, [purchaseIntent, refreshStatus]);

  // Listen for purchase completion from success page (opened in new tab)
  useEffect(() => {
    const channel = new BroadcastChannel('sogni-purchase-status');
    const handleMessage = (message: MessageEvent) => {
      if (message.data?.type === 'spark-purchase-complete') {
        // Refresh purchase status to show completion UI
        // Balance will update automatically via WebSocket
        refreshStatus();
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [refreshStatus]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(onClose, 300); // Allow animation to complete
  }, [onClose]);

  let content;
  if (purchaseId) {
    content = (
      <PurchaseProgress
        purchase={purchaseStatus}
        onReset={reset}
        onRefresh={refreshStatus}
        onClose={handleClose}
        loading={loading}
        currentBalance={currentBalance}
      />
    );
  } else {
    content = (
      <ProductList
        loading={loading}
        products={products}
        onPurchase={makePurchase}
        currentBalance={currentBalance}
      />
    );
  }

  return (
    <div className={`stripe-modal-overlay ${open ? 'open' : ''}`} onClick={handleClose}>
      <div
        className={`stripe-modal ${purchaseId ? 'stripe-modal-small' : ''} ${open ? 'open' : ''}`}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="stripe-close-button" onClick={handleClose}>
          ✕
        </button>
        <div className="stripe-modal-inner">
          {content}
        </div>
      </div>
    </div>
  );
}

export default StripePurchase;
