import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics for fine-grained per-action visibility
const orderDuration = new Trend('order_placement_duration');
const portfolioDuration = new Trend('portfolio_fetch_duration');
const successfulOrders = new Counter('successful_orders');
const failedOrders = new Counter('failed_orders');

// Configuration & Ramp-up Stages
export const options = {
  stages: [
    { duration: '15s', target: 20 },  // Ramp-up to 20 users
    { duration: '30s', target: 20 },  // Hold at 20 users (baseline load)
    { duration: '20s', target: 50 },  // Ramp-up to 50 users
    { duration: '30s', target: 50 },  // Hold at 50 users (moderate concurrency)
    { duration: '20s', target: 100 }, // Stress ramp to 100 users (peak breaking point test)
    { duration: '30s', target: 100 }, // Hold at 100 users
    { duration: '15s', target: 0 },   // Graceful cool-down
  ],
  thresholds: {
    // 95% of all requests must finish in under 500ms
    http_req_duration: ['p(95)<500'],
    // Overall HTTP request failure rate must be below 1%
    http_req_failed: ['rate<0.01'],
    // Specific business action thresholds
    order_placement_duration: ['p(95)<600'],
    portfolio_fetch_duration: ['p(95)<400'],
  },
};

// Base URL targeting strictly local environment
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const testUserId = `k6_demo_vu${vuId}`;

  // ========================================================
  // SCENARIO 1: Platform App Launch & Static Master Data
  // ========================================================
  group('1. Open Platform & Load Master Data', () => {
    // 1a. Load tenant branding
    const brandingRes = http.get(`${BASE_URL}/api/tenant/branding`, { headers: JSON_HEADERS });
    check(brandingRes, {
      'branding returns 200': (r) => r.status === 200,
      'branding has brandName': (r) => r.body && r.body.includes('brandName'),
    });

    // 1b. Load static instruments catalog (symbols, lot sizes, tick sizes)
    const instRes = http.get(`${BASE_URL}/api/trading/instruments`, { headers: JSON_HEADERS });
    check(instRes, {
      'instruments returns 200': (r) => r.status === 200,
      'instruments has symbols': (r) => r.body && r.body.includes('RELIANCE'),
    });

    sleep(0.5); // Short pause as browser renders UI
  });

  // ========================================================
  // SCENARIO 2: Authentication & Session Token Issuance
  // ========================================================
  let authToken = '';
  group('2. User Login & Session Handshake', () => {
    const demoPayload = JSON.stringify({
      userId: testUserId,
      fullName: `K6 Trader VU ${vuId}`,
      mobile: `98000${String(10000 + vuId).slice(-5)}`,
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/demo`, demoPayload, { headers: JSON_HEADERS });
    const isLoginOk = check(loginRes, {
      'login returns 200': (r) => r.status === 200,
      'token received': (r) => {
        try {
          const json = r.json();
          if (json && json.token) {
            authToken = json.token;
            return true;
          }
        } catch (_) {}
        return false;
      },
    });

    if (!isLoginOk) {
      return;
    }

    sleep(1); // User considers options
  });

  if (!authToken) {
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  // ========================================================
  // SCENARIO 3: Live Market Chart & Candlestick Feed
  // ========================================================
  group('3. View Candlestick Chart Feed', () => {
    const symbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];
    const selectedSymbol = symbols[iterId % symbols.length];

    const chartRes = http.get(`${BASE_URL}/api/trading/candles/${selectedSymbol}?timeframe=15m`, {
      headers: authHeaders,
    });

    check(chartRes, {
      'chart candles return 200': (r) => r.status === 200,
      'candles array present': (r) => r.body && r.body.includes('candles'),
    });

    sleep(1); // User examines chart
  });

  // ========================================================
  // SCENARIO 4: Portfolio, Wallet & Position Balance Check
  // ========================================================
  group('4. Check Portfolio & Account Balances', () => {
    const startPortfolio = Date.now();
    const portfolioRes = http.get(`${BASE_URL}/api/trading/portfolio`, {
      headers: authHeaders,
    });
    portfolioDuration.add(Date.now() - startPortfolio);

    check(portfolioRes, {
      'portfolio returns 200': (r) => r.status === 200,
      'wallet present': (r) => r.body && r.body.includes('wallet'),
    });

    sleep(1.5); // User analyzes available margin
  });

  // ========================================================
  // SCENARIO 5: Submit Trade Order (ACID Write & Persistence)
  // ========================================================
  group('5. Execute Trade Order', () => {
    const orderPayload = JSON.stringify({
      symbol: 'RELIANCE',
      type: iterId % 2 === 0 ? 'BUY' : 'SELL',
      orderType: 'MARKET',
      product: 'INTRADAY',
      quantity: 1,
    });

    const startOrder = Date.now();
    const orderRes = http.post(`${BASE_URL}/api/trading/order`, orderPayload, {
      headers: authHeaders,
    });
    orderDuration.add(Date.now() - startOrder);

    const isOrderOk = check(orderRes, {
      'order status is 200': (r) => r.status === 200,
      'order recorded or processed': (r) => {
        try {
          const json = r.json();
          return json && (json.success === true || json.code === 'INSUFFICIENT_MARGIN');
        } catch (_) {}
        return false;
      },
    });

    if (isOrderOk) {
      successfulOrders.add(1);
    } else {
      failedOrders.add(1);
    }

    sleep(1); // Pause before next iteration
  });
}
