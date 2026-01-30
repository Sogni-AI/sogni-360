import { Product } from '../../services/stripe';
import '../../styles/stripe/ProductList.css';

// Professional SVG icon for sparks
const SparkIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      fill="url(#spark-product-gradient)"
    />
    <defs>
      <linearGradient id="spark-product-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#667eea" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
  </svg>
);

interface Props {
  loading: boolean;
  products: Product[] | null;
  onPurchase: (productId: string) => void;
  currentBalance?: number;
}

function ProductList({ loading, products, onPurchase, currentBalance }: Props) {
  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handlePurchaseClick = (product: Product) => {
    // Store product info in sessionStorage for tracking
    try {
      sessionStorage.setItem('sogni_pending_purchase', JSON.stringify({
        productId: product.product,
        priceId: product.id,
        name: product.nickname,
        price: product.unit_amount / 100,
        currency: product.currency.toUpperCase(),
        sparkValue: product.metadata?.sparkValue || '0',
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error storing product info:', error);
    }

    // Proceed with purchase
    onPurchase(product.product);
  };

  let content;
  if (products) {
    content = (
      <div className="stripe-products">
        {products.map((product) => {
          return (
            <div key={product.id} className="stripe-product">
              <h3>
                <SparkIcon size={20} />
                {product.nickname}
              </h3>
              <p>{product.metadata.localDescription}</p>
              <div className="stripe-product-actions">
                <div className="stripe-product-price">{formatUSD(product.unit_amount / 100)}</div>
                <button
                  className="stripe-buy-button"
                  onClick={() => handlePurchaseClick(product)}
                  disabled={loading}
                >
                  Buy
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    content = (
      <div className="stripe-placeholder">
        <div className="stripe-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <>
      <div className="stripe-header">
        <div className="stripe-sparkle-icon">
          <SparkIcon size={48} />
        </div>
        <h2>Boost your creativity, instantly.</h2>
        <p>
          Spark Points unlock fast, high-quality image creation--powered by the Supernet. They never
          expire, can't be transferred, and are always ready when inspiration strikes.
        </p>
      </div>
      <div className="stripe-content">
        {currentBalance !== undefined && (
          <div className="stripe-account-summary">
            <div className="stripe-balance-label">Current Balance</div>
            <div className="stripe-balance-value">{currentBalance.toFixed(2)}</div>
          </div>
        )}
        <div className="stripe-products-wrapper">{content}</div>
      </div>
      {loading && (
        <div className="stripe-loading-overlay">
          <div className="stripe-spinner"></div>
          <p>Processing...</p>
        </div>
      )}
    </>
  );
}

export default ProductList;
