import { PurchaseStatus } from '../../services/stripe';
import '../../styles/stripe/PurchaseProgress.css';
import { useEffect, useRef } from 'react';
import { playSogniSignatureIfEnabled } from '../../utils/sonicLogos';
import { trackPurchase, trackEvent } from '../../utils/analytics';

const SparkPointIcon = ({ size = 17 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 16" width={size} height={size} fill="currentColor">
    <path d="M9.92301 1.1764C10.6242 0.251095 12.0169 0.251096 12.0445 1.1764L12.1576 4.97111C12.1663 5.26202 12.3269 5.49138 12.5973 5.59903L16.1244 7.0032C16.9845 7.34559 16.5082 8.65433 15.3989 8.99672L10.8495 10.4009C10.5008 10.5085 10.1732 10.7379 9.95276 11.0288L7.07732 14.8235C6.37616 15.7488 4.98344 15.7488 4.95585 14.8235L4.84273 11.0288C4.83406 10.7379 4.67346 10.5085 4.40305 10.4009L0.875887 8.99672C0.015819 8.65433 0.492163 7.34559 1.60147 7.0032L6.15079 5.59903C6.49955 5.49138 6.82712 5.26202 7.04756 4.97111L9.92301 1.1764Z" />
  </svg>
);

interface Props {
  purchase: PurchaseStatus | null;
  loading: boolean;
  onReset: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

function PurchaseProgress({ purchase, loading, onReset, onRefresh, onClose }: Props) {
  const isCompleted = purchase?.status === 'completed' || purchase?.status === 'processing';
  const productId = purchase?.productId;
  const hasPlayedSoundRef = useRef(false);

  useEffect(() => {
    if (isCompleted && productId && !hasPlayedSoundRef.current) {
      hasPlayedSoundRef.current = true;

      try {
        sessionStorage.removeItem('sogni_pending_purchase');
      } catch (error) {
        console.error('Error clearing product info:', error);
      }

      if (purchase) {
        trackPurchase({
          transaction_id: purchase.transactionId,
          value: purchase.amountInDollars,
          currency: 'USD',
          affiliation: 'Sogni 360',
          items: [
            {
              item_id: purchase.productId,
              item_name: `${purchase.amountInTokens} Spark Points`,
              price: purchase.amountInDollars,
              quantity: 1,
              item_category: 'Spark Points'
            }
          ]
        });
        trackEvent('Purchase', 'purchase_complete', purchase.productId, purchase.amountInDollars);
      }

      playSogniSignatureIfEnabled();
    }
  }, [isCompleted, productId, purchase]);

  let heading;
  let status;
  switch (purchase?.status) {
    case 'processing':
    case 'completed':
      heading = 'Thank you';
      status =
        'Your purchase was successful, and your Spark Points have been added to your balance.';
      break;
    default:
      heading = 'Waiting for Stripe';
      status =
        'Please complete the purchase checkout in the Stripe tab. Once completed, your Spark Points will be added to your account and you will return here.';
  }

  return (
    <>
      <div className="stripe-header">
        <div className="stripe-spark-label">
          <SparkPointIcon size={18} />
          Premium Spark
        </div>
        <h2>{heading}</h2>
      </div>
      <div className="stripe-content">
        <p className="stripe-progress-message">{status}</p>
        <div className="stripe-progress-buttons">
          {isCompleted ? (
            <button className="stripe-cta-button" onClick={onReset}>
              <SparkPointIcon size={14} />
              Buy more Spark Points
            </button>
          ) : (
            <button className="stripe-cta-button stripe-cta-button-spark" onClick={onRefresh} disabled={loading}>
              {loading ? (
                <>
                  <span className="stripe-spinner-small"></span> Checking...
                </>
              ) : (
                'Check status'
              )}
            </button>
          )}
          <button className="stripe-dismiss-button" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
}

export default PurchaseProgress;
