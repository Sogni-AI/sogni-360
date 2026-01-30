import { PurchaseStatus } from '../../services/stripe';
import '../../styles/stripe/PurchaseProgress.css';
import { useEffect, useRef } from 'react';
import { playSogniSignatureIfEnabled } from '../../utils/sonicLogos';
import { trackPurchase, trackEvent } from '../../utils/analytics';

// Professional SVG icons
const SparkIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      fill="url(#spark-progress-gradient)"
    />
    <defs>
      <linearGradient id="spark-progress-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#667eea" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
  </svg>
);

const CheckIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="url(#check-progress-gradient)" />
    <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="check-progress-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#10b981" />
        <stop offset="1" stopColor="#059669" />
      </linearGradient>
    </defs>
  </svg>
);

const ClockIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="url(#clock-gradient)" strokeWidth="2" />
    <path d="M12 6V12L16 14" stroke="url(#clock-gradient)" strokeWidth="2" strokeLinecap="round" />
    <defs>
      <linearGradient id="clock-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#667eea" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
  </svg>
);

interface Props {
  purchase: PurchaseStatus | null;
  loading: boolean;
  onReset: () => void;
  onRefresh: () => void;
  onClose: () => void;
  currentBalance?: number;
}

function PurchaseProgress({ purchase, loading, onReset, onRefresh, onClose, currentBalance }: Props) {
  const isCompleted = purchase?.status === 'completed' || purchase?.status === 'processing';
  const hasPlayedSoundRef = useRef(false);

  useEffect(() => {
    if (isCompleted && !hasPlayedSoundRef.current) {
      hasPlayedSoundRef.current = true;

      // Clear stored product info
      try {
        sessionStorage.removeItem('sogni_pending_purchase');
      } catch (error) {
        console.error('Error clearing product info:', error);
      }

      // Track GA4 ecommerce purchase
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

        // Track purchase conversion event
        trackEvent('Purchase', 'purchase_complete', purchase.productId, purchase.amountInDollars);
      }

      // Play sonic logo for successful purchase
      playSogniSignatureIfEnabled();
    }
  }, [isCompleted, purchase]);

  let statusIcon;
  let heading;
  let status;
  let statusClass = '';

  switch (purchase?.status) {
    case 'processing':
    case 'completed':
      statusIcon = <CheckIcon size={64} />;
      heading = 'Thank you';
      status = 'Your purchase was successful, and your Spark Points have been added to your balance.';
      statusClass = 'stripe-progress-success';
      break;
    default:
      statusIcon = <ClockIcon size={64} />;
      heading = 'Waiting for Stripe';
      status = 'Please complete the purchase checkout in the Stripe tab. Once completed, your Spark Points will be added to your account and you will return here.';
      statusClass = 'stripe-progress-pending';
  }

  return (
    <div className={statusClass}>
      <div className="stripe-header">
        <div className="stripe-progress-icon">
          {statusIcon}
        </div>
        <h2 className="stripe-progress-title">{heading}</h2>
        <p className="stripe-progress-message">{status}</p>
      </div>
      <div className="stripe-content">
        {currentBalance !== undefined && (
          <div className="stripe-account-summary">
            <div className="stripe-balance-label">Current Balance</div>
            <div className="stripe-balance-value">{currentBalance.toFixed(2)}</div>
          </div>
        )}
        <div className="stripe-progress-buttons">
          {isCompleted ? (
            <button className="stripe-buy-more-button" onClick={onReset}>
              <SparkIcon size={18} />
              Buy more Spark Points
            </button>
          ) : (
            <button
              className="stripe-check-status-button"
              onClick={onRefresh}
              disabled={loading}
            >
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
    </div>
  );
}

export default PurchaseProgress;
