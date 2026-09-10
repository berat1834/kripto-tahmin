/* ============================================================
   KriptoTahmin — Kripto Fiyat Tahmin Oyunu
   Ana JavaScript Dosyası

   Yapı:
   1. Sabitler & Ayarlar
   2. Oyun Durumu (State)
   3. DOM Referansları
   4. WebSocket Yönetimi
   5. Fiyat Güncelleme
   6. Canvas Grafik Çizimi
   7. Oyun Mekaniği (Tahmin, Geri Sayım, Sonuç)
   8. Skor & Streak Sistemi
   9. UI Güncelleme Fonksiyonları
   10. Paylaşım
   11. Başlatma (Init)
   ============================================================ */

// ==================== 1. SABİTLER & AYARLAR ====================

/**
 * Desteklenen coinler ve özellikleri.
 * Her coin için: isim, sembol, ikon, renk ve WebSocket stream adı.
 */
const COINS = {
    btcusdt: {
        name: 'Bitcoin',
        symbol: 'BTC',
        icon: '₿',
        color: '#f7931a',
        rgb: '247, 147, 26'
    },
    ethusdt: {
        name: 'Ethereum',
        symbol: 'ETH',
        icon: 'Ξ',
        color: '#627eea',
        rgb: '98, 126, 234'
    },
    bnbusdt: {
        name: 'BNB',
        symbol: 'BNB',
        icon: '◆',
        color: '#f3ba2f',
        rgb: '243, 186, 47'
    },
    solusdt: {
        name: 'Solana',
        symbol: 'SOL',
        icon: '◎',
        color: '#9945ff',
        rgb: '153, 69, 255'
    },
    avaxusdt: {
        name: 'Avalanche',
        symbol: 'AVAX',
        icon: '▲',
        color: '#e84142',
        rgb: '232, 65, 66'
    }
};

/** Geri sayım süresi (saniye) */
const COUNTDOWN_SECONDS = 10;

/** SVG çemberin çevresi: 2 * π * 52 (radius) */
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.73

/** Grafikteki maksimum veri noktası sayısı */
const MAX_CHART_POINTS = 40;

/** Sonuç gösterildikten sonra bekleme süresi (ms) */
const RESULT_DISPLAY_MS = 3000;

/** Streak mesajları — belli seri sayılarında özel mesaj göster */
const STREAK_MESSAGES = {
    3: { text: '🔥 Ateştesin!', color: '#ffa500' },
    5: { text: '⚡ Durdurulamıyorsun!', color: '#ffd700' },
    7: { text: '💎 Elmas Eller!', color: '#00bfff' },
    10: { text: '👑 EFSANE!', color: '#ff00ff' },
    15: { text: '🚀 İMKANSIZ!', color: '#ff0000' },
    20: { text: 'İNANILMAZ!!', color: '#00ffb3' },
};


// ==================== 2. OYUN DURUMU (STATE) ====================

/**
 * Oyunun tüm durumunu tutan ana nesne.
 * Tüm veri tek bir yerde → yönetmesi ve debug etmesi kolay.
 */
const state = {
    // Aktif coin
    currentCoin: 'btcusdt',

    // Her coin için fiyat verisi
    prices: {},

    // Oyun aşaması: 'idle' | 'countdown' | 'result'
    phase: 'idle',

    // Tahmin bilgileri
    prediction: null,       // 'up' veya 'down'
    predictionPrice: 0,     // Tahmin anındaki fiyat

    // Geri sayım
    countdown: COUNTDOWN_SECONDS,
    countdownInterval: null,

    // Skor
    score: 0,
    streak: 0,
    bestStreak: 0,
    highScore: 0,
    totalPredictions: 0,
    correctPredictions: 0,

    // WebSocket
    ws: null,
    reconnectTimeout: null,
    isConnected: false
};

// Her coin için boş fiyat verisi oluştur
Object.keys(COINS).forEach(key => {
    state.prices[key] = {
        current: 0,
        previous: 0,
        change24h: 0,
        history: []
    };
});


// ==================== 3. DOM REFERANSLARI ====================

/**
 * Sık kullanılan DOM elemanlarını bir kere yakala, tekrar tekrar arama.
 * Bu, performans için önemli — her fiyat güncellemesinde DOM araması yapmak yavaş olur.
 */
const dom = {
    // Bağlantı
    connectionStatus: document.getElementById('connectionStatus'),

    // Coin seçici
    coinSelector: document.getElementById('coinSelector'),

    // Fiyat gösterimi
    coinIcon: document.getElementById('coinIcon'),
    coinName: document.getElementById('coinName'),
    coinSymbol: document.getElementById('coinSymbol'),
    currentPrice: document.getElementById('currentPrice'),
    priceChangeBadge: document.getElementById('priceChangeBadge'),
    priceChangeArrow: document.getElementById('priceChangeArrow'),
    priceChangePercent: document.getElementById('priceChangePercent'),

    // Grafik
    priceChart: document.getElementById('priceChart'),

    // Oyun kontrolleri
    predictionButtons: document.getElementById('predictionButtons'),
    btnUp: document.getElementById('btnUp'),
    btnDown: document.getElementById('btnDown'),
    multiplierHint: document.getElementById('multiplierHint'),

    countdownPanel: document.getElementById('countdownPanel'),
    predictionDirection: document.getElementById('predictionDirection'),
    predictionPriceDisplay: document.getElementById('predictionPriceDisplay'),
    countdownRing: document.getElementById('countdownRing'),
    countdownNumber: document.getElementById('countdownNumber'),
    liveDiff: document.getElementById('liveDiff'),
    liveDiffValue: document.getElementById('liveDiffValue'),

    resultPanel: document.getElementById('resultPanel'),
    resultIcon: document.getElementById('resultIcon'),
    resultTitle: document.getElementById('resultTitle'),
    resultPriceChange: document.getElementById('resultPriceChange'),
    resultScore: document.getElementById('resultScore'),
    streakMessage: document.getElementById('streakMessage'),

    // Skor
    score: document.getElementById('score'),
    streakCount: document.getElementById('streakCount'),
    streakFire: document.getElementById('streakFire'),
    highScore: document.getElementById('highScore'),

    // İstatistikler
    totalPredictions: document.getElementById('totalPredictions'),
    correctPredictions: document.getElementById('correctPredictions'),
    accuracy: document.getElementById('accuracy'),
    bestStreak: document.getElementById('bestStreak'),

    // Diğer
    shareBtn: document.getElementById('shareBtn'),
    toastContainer: document.getElementById('toastContainer')
};


// ==================== 4. WEBSOCKET YÖNETİMİ ====================

/**
 * Binance WebSocket'e bağlan.
 *
 * Neden WebSocket?
 * Normal HTTP ile her saniye istek atmak yerine, WebSocket sürekli açık bir kanal tutar.
 * Fiyat değişince sunucu bize anında gönderir — daha hızlı, daha verimli.
 *
 * Binance'in combined stream endpoint'ini kullanıyoruz:
 * Tek bir bağlantı ile 5 coin'in fiyatını aynı anda alıyoruz.
 */
function connectWebSocket() {
    // Önceki bağlantıyı temizle
    if (state.ws) {
        state.ws.close();
    }

    // Tüm coinlerin stream adlarını birleştir
    // Örnek: "btcusdt@ticker/ethusdt@ticker/..."
    const streams = Object.keys(COINS).map(c => `${c}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    updateConnectionStatus('connecting');

    try {
        state.ws = new WebSocket(url);
    } catch (e) {
        updateConnectionStatus('error');
        scheduleReconnect();
        return;
    }

    // Bağlantı açıldığında
    state.ws.onopen = () => {
        state.isConnected = true;
        updateConnectionStatus('connected');
        console.log('✅ Binance WebSocket bağlantısı kuruldu');
    };

    // Her mesaj geldiğinde (fiyat güncellemesi)
    state.ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            // Combined stream formatı: { stream: "btcusdt@ticker", data: {...} }
            const streamName = message.stream;           // örn: "btcusdt@ticker"
            const coinKey = streamName.split('@')[0];    // örn: "btcusdt"
            handlePriceUpdate(coinKey, message.data);
        } catch (e) {
            console.error('Mesaj parse hatası:', e);
        }
    };

    // Hata olduğunda
    state.ws.onerror = () => {
        console.error('❌ WebSocket hatası');
        updateConnectionStatus('error');
    };

    // Bağlantı kapandığında
    state.ws.onclose = () => {
        state.isConnected = false;
        updateConnectionStatus('disconnected');
        console.log('🔌 WebSocket bağlantısı kapandı, yeniden deneniyor...');
        scheduleReconnect();
    };
}

/**
 * Bağlantı koptuğunda 3 saniye sonra tekrar dene.
 */
function scheduleReconnect() {
    if (state.reconnectTimeout) clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = setTimeout(connectWebSocket, 3000);
}

/**
 * Bağlantı durumu göstergesini güncelle.
 * @param {'connecting'|'connected'|'disconnected'|'error'} status
 */
function updateConnectionStatus(status) {
    const el = dom.connectionStatus;
    el.className = 'connection-status ' + status;

    const textMap = {
        connecting: 'Bağlanıyor...',
        connected: 'Canlı bağlantı',
        disconnected: 'Bağlantı kesildi, yeniden deneniyor...',
        error: 'Bağlantı hatası'
    };
    el.querySelector('.status-text').textContent = textMap[status] || '';
}


// ==================== 5. FİYAT GÜNCELLEME ====================

/**
 * WebSocket'ten gelen fiyat verisini işle.
 * Bu fonksiyon her fiyat değişiminde çağrılır (saniyede birçok kez).
 *
 * @param {string} coinKey - Coin anahtarı (örn: "btcusdt")
 * @param {Object} data - Binance ticker verisi
 */
function handlePriceUpdate(coinKey, data) {
    const priceData = state.prices[coinKey];
    if (!priceData) return;

    const newPrice = parseFloat(data.c);   // "c" = son fiyat (close price)
    const change24h = parseFloat(data.P);  // "P" = 24 saatlik değişim yüzdesi

    // Önceki fiyatı kaydet (flash animasyonu için)
    priceData.previous = priceData.current;
    priceData.current = newPrice;
    priceData.change24h = change24h;

    // Fiyat geçmişine ekle (grafik için)
    priceData.history.push(newPrice);
    if (priceData.history.length > MAX_CHART_POINTS) {
        priceData.history.shift(); // En eski veriyi at
    }

    // Eğer aktif coin buysa, UI'ı güncelle
    if (coinKey === state.currentCoin) {
        updatePriceDisplay(coinKey);
        drawChart();

        // Geri sayım sırasında canlı fark göster
        if (state.phase === 'countdown') {
            updateLiveDiff();
        }
    }

    // Coin seçicideki mini fiyatı da güncelle
    updateCoinPillPrice(coinKey);
}


// ==================== 6. CANVAS GRAFİK ÇİZİMİ ====================

/**
 * Fiyat geçmişini canvas üzerinde çizgi grafik olarak çiz.
 *
 * Canvas nedir?
 * HTML'in çizim tuvali. Piksel piksel kontrol ederek grafik, oyun, animasyon yapabilirsin.
 * <canvas> elementi bir resim gibi — ama içine JavaScript ile çizim yaparsın.
 */
function drawChart() {
    const canvas = dom.priceChart;
    const ctx = canvas.getContext('2d');
    const history = state.prices[state.currentCoin]?.history || [];

    if (history.length < 2) return;

    // Canvas'ı ekran çözünürlüğüne göre ayarla (retina ekranlarda keskin olsun)
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Temizle
    ctx.clearRect(0, 0, w, h);

    // Fiyat aralığını hesapla
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1; // 0'a bölmeyi engelle
    const padding = range * 0.15;

    // Renk: son fiyat ilk fiyattan büyükse yeşil, değilse kırmızı
    const isUp = history[history.length - 1] >= history[0];
    const lineColor = isUp ? '#00ff88' : '#ff4466';
    const fillColorStart = isUp ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 68, 102, 0.2)';
    const fillColorEnd = isUp ? 'rgba(0, 255, 136, 0)' : 'rgba(255, 68, 102, 0)';

    // Yardımcı fonksiyon: fiyatı canvas Y koordinatına çevir
    function priceToY(price) {
        return h - ((price - min + padding) / (range + 2 * padding)) * h;
    }

    // 1. Yatay ızgara çizgileri (referans için)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // 2. Çizgiyi çiz
    const step = w / (history.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    history.forEach((price, i) => {
        const x = step * i;
        const y = priceToY(price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Altını gradyanla doldur
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, fillColorStart);
    gradient.addColorStop(1, fillColorEnd);

    // Mevcut path'e alt köşeleri ekle
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. Son noktaya parlayan nokta koy
    const lastX = step * (history.length - 1);
    const lastY = priceToY(history[history.length - 1]);

    // Dış glow
    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
    ctx.fillStyle = lineColor + '33'; // %20 opaklık
    ctx.fill();

    // İç nokta
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
}


// ==================== 7. OYUN MEKANİĞİ ====================

/**
 * Kullanıcı tahmin yaptığında çağrılır.
 * @param {'up'|'down'} direction - Tahmin yönü
 */
function makePrediction(direction) {
    if (state.phase !== 'idle') return;
    if (!state.isConnected) return;

    const currentPrice = state.prices[state.currentCoin].current;
    if (currentPrice <= 0) return; // Henüz fiyat gelmemişse tahmin yapma

    // State'i güncelle
    state.prediction = direction;
    state.predictionPrice = currentPrice;
    state.phase = 'countdown';
    state.countdown = COUNTDOWN_SECONDS;

    // UI'ı geri sayım moduna geçir
    showCountdown(direction, currentPrice);

    // Geri sayımı başlat
    state.countdownInterval = setInterval(() => {
        state.countdown--;
        updateCountdownUI();

        if (state.countdown <= 0) {
            clearInterval(state.countdownInterval);
            evaluateResult();
        }
    }, 1000);
}

/**
 * Geri sayım bittiğinde sonucu değerlendir.
 */
function evaluateResult() {
    const currentPrice = state.prices[state.currentCoin].current;
    const diff = currentPrice - state.predictionPrice;
    const percentChange = (diff / state.predictionPrice) * 100;

    let isCorrect = false;

    if (diff === 0) {
        // Fiyat hiç değişmedi — yanlış sayılır
        isCorrect = false;
    } else if (state.prediction === 'up') {
        isCorrect = diff > 0;
    } else {
        isCorrect = diff < 0;
    }

    // Skoru hesapla
    state.totalPredictions++;

    if (isCorrect) {
        state.correctPredictions++;
        state.streak++;
        if (state.streak > state.bestStreak) {
            state.bestStreak = state.streak;
        }

        const points = calculatePoints();
        state.score += points;

        if (state.score > state.highScore) {
            state.highScore = state.score;
            saveHighScore();
        }

        showResult(true, diff, percentChange, points);
    } else {
        state.streak = 0;
        showResult(false, diff, percentChange, 0);
    }

    // İstatistikleri kaydet
    saveStats();
    updateStatsUI();
    updateScoreUI();
}

/**
 * Streak çarpanına göre puan hesapla.
 *
 * Skor formülü:
 * - 1-2 doğru seri = x1 (10 puan)
 * - 3-4 doğru seri = x2 (20 puan)
 * - 5-9 doğru seri = x3 (30 puan)
 * - 10+ doğru seri = x5 (50 puan)
 */
function calculatePoints() {
    const base = 10;
    let multiplier = 1;

    if (state.streak >= 10) multiplier = 5;
    else if (state.streak >= 5) multiplier = 3;
    else if (state.streak >= 3) multiplier = 2;

    return base * multiplier;
}

/**
 * Mevcut streake göre çarpanı döndür.
 */
function getCurrentMultiplier() {
    if (state.streak >= 10) return 5;
    if (state.streak >= 5) return 3;
    if (state.streak >= 3) return 2;
    return 1;
}

/**
 * Bir sonraki olası çarpanı göster (motivasyon için).
 */
function getNextMultiplierHint() {
    const s = state.streak;
    if (s >= 10) return '🚀 x5 çarpan aktif!';
    if (s >= 5) return `⚡ x3 çarpan! ${10 - s} doğru daha = x5`;
    if (s >= 3) return `🔥 x2 çarpan! ${5 - s} doğru daha = x3`;
    if (s >= 1) return `${3 - s} doğru daha = x2 çarpan!`;
    return '';
}


// ==================== 8. UI GÜNCELLEME FONKSİYONLARI ====================

/**
 * Coin seçici pill'leri oluştur.
 */
function renderCoinSelector() {
    dom.coinSelector.innerHTML = '';

    Object.entries(COINS).forEach(([key, coin]) => {
        const pill = document.createElement('div');
        pill.className = `coin-pill${key === state.currentCoin ? ' active' : ''}`;
        pill.style.setProperty('--coin-color', coin.color);
        pill.style.setProperty('--coin-rgb', coin.rgb);
        pill.dataset.coin = key;

        pill.innerHTML = `
            <span class="coin-pill-icon">${coin.icon}</span>
            <span class="coin-pill-name">${coin.symbol}</span>
            <span class="coin-pill-price" id="pill-price-${key}">---</span>
        `;

        pill.addEventListener('click', () => switchCoin(key));
        dom.coinSelector.appendChild(pill);
    });
}

/**
 * Aktif coin'i değiştir.
 * @param {string} coinKey
 */
function switchCoin(coinKey) {
    // Geri sayım sırasında coin değiştirme
    if (state.phase === 'countdown') return;

    state.currentCoin = coinKey;

    // Pill'lerin active durumunu güncelle
    document.querySelectorAll('.coin-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.coin === coinKey);
    });

    // Coin bilgilerini güncelle
    const coin = COINS[coinKey];
    dom.coinIcon.textContent = coin.icon;
    dom.coinName.textContent = coin.name;
    dom.coinSymbol.textContent = `${coin.symbol}/USDT`;

    // Fiyatı güncelle
    updatePriceDisplay(coinKey);
    drawChart();
}

/**
 * Ana fiyat gösterimini güncelle.
 * @param {string} coinKey
 */
function updatePriceDisplay(coinKey) {
    const data = state.prices[coinKey];
    if (!data || data.current <= 0) return;

    // Fiyatı formatla
    dom.currentPrice.textContent = formatPrice(data.current);

    // Flash animasyonu: fiyat yükseldi mi düştü mü?
    if (data.previous > 0 && data.current !== data.previous) {
        const flashClass = data.current > data.previous ? 'flash-green' : 'flash-red';
        dom.currentPrice.classList.add(flashClass);
        setTimeout(() => dom.currentPrice.classList.remove(flashClass), 300);
    }

    // 24h değişim badge'i
    const change = data.change24h;
    const isUp = change >= 0;
    dom.priceChangeBadge.className = `price-change-badge ${isUp ? 'up' : 'down'}`;
    dom.priceChangeArrow.textContent = isUp ? '▲' : '▼';
    dom.priceChangePercent.textContent = `${Math.abs(change).toFixed(2)}%`;
}

/**
 * Coin seçicideki mini fiyatı güncelle.
 */
function updateCoinPillPrice(coinKey) {
    const el = document.getElementById(`pill-price-${coinKey}`);
    if (!el) return;
    const price = state.prices[coinKey]?.current;
    if (price > 0) {
        el.textContent = '$' + formatPriceCompact(price);
    }
}

/**
 * Geri sayım UI'ını göster.
 */
function showCountdown(direction, price) {
    // Panelleri değiştir
    dom.predictionButtons.style.display = 'none';
    dom.countdownPanel.style.display = 'block';
    dom.resultPanel.style.display = 'none';

    // Yön bilgisi
    if (direction === 'up') {
        dom.predictionDirection.textContent = '▲ YUKARI';
        dom.predictionDirection.className = 'prediction-direction dir-up';
    } else {
        dom.predictionDirection.textContent = '▼ AŞAĞI';
        dom.predictionDirection.className = 'prediction-direction dir-down';
    }

    // Tahmin fiyatı
    dom.predictionPriceDisplay.textContent = '$' + formatPrice(price);

    // Geri sayımı sıfırla
    dom.countdownRing.style.strokeDashoffset = '0';
    dom.countdownNumber.textContent = COUNTDOWN_SECONDS;
    dom.liveDiffValue.textContent = '$0.00';
    dom.liveDiff.className = 'live-diff diff-neutral';
}

/**
 * Her saniye geri sayımı güncelle.
 */
function updateCountdownUI() {
    const remaining = state.countdown;

    // Sayıyı güncelle
    dom.countdownNumber.textContent = remaining;

    // Çemberi güncelle
    const offset = CIRCLE_CIRCUMFERENCE * (1 - remaining / COUNTDOWN_SECONDS);
    dom.countdownRing.style.strokeDashoffset = offset;

    // Renk değişimi: 10s altı sarı, 5s altı kırmızı
    dom.countdownRing.classList.remove('warning', 'danger');
    if (remaining <= 5) {
        dom.countdownRing.classList.add('danger');
    } else if (remaining <= 10) {
        dom.countdownRing.classList.add('warning');
    }
}

/**
 * Geri sayım sırasında canlı fiyat farkını göster.
 */
function updateLiveDiff() {
    const currentPrice = state.prices[state.currentCoin].current;
    const diff = currentPrice - state.predictionPrice;
    const absDiff = Math.abs(diff);

    let text, className;

    if (diff > 0) {
        text = `+$${formatPrice(absDiff)}`;
        className = 'live-diff diff-up';
    } else if (diff < 0) {
        text = `-$${formatPrice(absDiff)}`;
        className = 'live-diff diff-down';
    } else {
        text = '$0.00';
        className = 'live-diff diff-neutral';
    }

    dom.liveDiffValue.textContent = text;
    dom.liveDiff.className = className;
}

/**
 * Sonucu göster.
 */
function showResult(isCorrect, diff, percentChange, points) {
    state.phase = 'result';

    // Panelleri değiştir
    dom.predictionButtons.style.display = 'none';
    dom.countdownPanel.style.display = 'none';
    dom.resultPanel.style.display = 'block';

    if (isCorrect) {
        dom.resultIcon.textContent = '✅';
        dom.resultTitle.textContent = 'Doğru Tahmin!';
        dom.resultTitle.className = 'result-title correct';

        const multiplier = getCurrentMultiplier();
        const multiplierText = multiplier > 1 ? ` (x${multiplier})` : '';
        dom.resultScore.textContent = `+${points} puan${multiplierText}`;
        dom.resultScore.className = 'result-score';

        // Toast animasyonu
        showToast(`+${points}`, false);
    } else {
        dom.resultIcon.textContent = '❌';
        dom.resultTitle.textContent = 'Yanlış Tahmin';
        dom.resultTitle.className = 'result-title wrong';
        dom.resultScore.textContent = 'Seri sıfırlandı';
        dom.resultScore.className = 'result-score no-score';

        // Sarsıntı efekti
        dom.resultPanel.classList.add('shake');
        setTimeout(() => dom.resultPanel.classList.remove('shake'), 500);
    }

    // Fiyat değişim detayı
    const arrow = diff >= 0 ? '▲' : '▼';
    const sign = diff >= 0 ? '+' : '';
    dom.resultPriceChange.textContent = `${arrow} ${sign}${percentChange.toFixed(4)}% (${sign}$${formatPrice(Math.abs(diff))})`;

    // Streak mesajı
    const streakMsg = STREAK_MESSAGES[state.streak];
    if (streakMsg) {
        dom.streakMessage.textContent = streakMsg.text;
        dom.streakMessage.style.color = streakMsg.color;
    } else if (state.streak > 1 && isCorrect) {
        dom.streakMessage.textContent = `🔥 ${state.streak} seri!`;
        dom.streakMessage.style.color = '#ffa500';
    } else {
        dom.streakMessage.textContent = '';
    }

    // 3 saniye sonra idle'a dön
    setTimeout(() => {
        if (state.phase === 'result') {
            backToIdle();
        }
    }, RESULT_DISPLAY_MS);
}

/**
 * Idle durumuna dön.
 */
function backToIdle() {
    state.phase = 'idle';
    state.prediction = null;
    state.predictionPrice = 0;

    dom.predictionButtons.style.display = 'block';
    dom.countdownPanel.style.display = 'none';
    dom.resultPanel.style.display = 'none';

    // Çarpan ipucunu güncelle
    dom.multiplierHint.textContent = getNextMultiplierHint();
}

/**
 * Skor panelini güncelle.
 */
function updateScoreUI() {
    dom.score.textContent = state.score;
    dom.streakCount.textContent = state.streak;
    dom.highScore.textContent = state.highScore;

    // Streak fire animasyonu
    if (state.streak > 0) {
        dom.streakFire.classList.add('fire-active');
        setTimeout(() => dom.streakFire.classList.remove('fire-active'), 400);
    }
}

/**
 * İstatistik barını güncelle.
 */
function updateStatsUI() {
    dom.totalPredictions.textContent = state.totalPredictions;
    dom.correctPredictions.textContent = state.correctPredictions;
    dom.bestStreak.textContent = state.bestStreak;

    const acc = state.totalPredictions > 0
        ? Math.round((state.correctPredictions / state.totalPredictions) * 100)
        : 0;
    dom.accuracy.textContent = `%${acc}`;
}

/**
 * Skor toast animasyonu göster.
 */
function showToast(text, isNegative) {
    const toast = document.createElement('div');
    toast.className = `score-toast${isNegative ? ' negative' : ''}`;
    toast.textContent = text;
    dom.toastContainer.appendChild(toast);

    // Animasyon bitince kaldır
    setTimeout(() => toast.remove(), 1500);
}


// ==================== 9. FORMATLAMA YARDIMCILARI ====================

/**
 * Fiyatı okunabilir formata çevir.
 * Büyük fiyatlar: 67,432.18 → virgüllü
 * Küçük fiyatlar: 0.1234 → daha fazla ondalık
 */
function formatPrice(price) {
    if (price >= 1000) {
        return price.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } else if (price >= 1) {
        return price.toFixed(2);
    } else {
        return price.toFixed(4);
    }
}

/**
 * Kısa fiyat formatı (coin pill'ler için).
 */
function formatPriceCompact(price) {
    if (price >= 10000) {
        return (price / 1000).toFixed(1) + 'K';
    } else if (price >= 1000) {
        return price.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    } else if (price >= 1) {
        return price.toFixed(1);
    } else {
        return price.toFixed(3);
    }
}


// ==================== 10. KAYDETME & YÜKLEME (localStorage) ====================

/**
 * localStorage nedir?
 * Tarayıcının içindeki küçük bir veritabanı. Sayfa kapatılsa bile veri korunur.
 * En yüksek skor ve istatistikleri burada saklıyoruz.
 */
function saveHighScore() {
    localStorage.setItem('kriptoTahmin_highScore', state.highScore);
}

function saveStats() {
    localStorage.setItem('kriptoTahmin_stats', JSON.stringify({
        totalPredictions: state.totalPredictions,
        correctPredictions: state.correctPredictions,
        bestStreak: state.bestStreak,
        highScore: state.highScore
    }));
}

function loadSavedData() {
    // High score
    const hs = localStorage.getItem('kriptoTahmin_highScore');
    if (hs) state.highScore = parseInt(hs, 10);

    // İstatistikler
    const stats = localStorage.getItem('kriptoTahmin_stats');
    if (stats) {
        try {
            const data = JSON.parse(stats);
            state.totalPredictions = data.totalPredictions || 0;
            state.correctPredictions = data.correctPredictions || 0;
            state.bestStreak = data.bestStreak || 0;
            state.highScore = data.highScore || state.highScore;
        } catch (e) {
            console.warn('Stats yüklenirken hata:', e);
        }
    }
}


// ==================== 11. PAYLAŞIM ====================

/**
 * Sonucu panoya kopyala (LinkedIn için).
 */
function shareResult() {
    const acc = state.totalPredictions > 0
        ? Math.round((state.correctPredictions / state.totalPredictions) * 100)
        : 0;

    const text = `🎮 KriptoTahmin Sonuçlarım:

📊 Skor: ${state.score}
🔥 En İyi Seri: ${state.bestStreak}
🎯 Başarı Oranı: %${acc}
📈 Toplam Tahmin: ${state.totalPredictions}

Gerçek kripto fiyatlarıyla oyna, tahminlerini test et!
#KriptoTahmin #CryptoPrediction #WeekendProject`;

    navigator.clipboard.writeText(text).then(() => {
        dom.shareBtn.textContent = '✅ Kopyalandı!';
        setTimeout(() => {
            dom.shareBtn.innerHTML = '<span>📤</span> Sonucu Paylaş';
        }, 2000);
    }).catch(() => {
        // Clipboard API çalışmazsa prompt ile göster
        prompt('Aşağıdaki metni kopyala:', text);
    });
}


// ==================== 12. BAŞLATMA (INIT) ====================

/**
 * Uygulamayı başlat.
 * Bu fonksiyon sayfa yüklendiğinde bir kez çalışır.
 */
function init() {
    console.log('🎮 KriptoTahmin başlatılıyor...');

    // Kaydedilmiş veriyi yükle
    loadSavedData();

    // UI'ı ilk duruma getir
    renderCoinSelector();
    switchCoin(state.currentCoin);
    updateScoreUI();
    updateStatsUI();

    // Çarpan ipucunu göster
    dom.multiplierHint.textContent = getNextMultiplierHint();

    // Buton event listener'ları
    dom.btnUp.addEventListener('click', () => makePrediction('up'));
    dom.btnDown.addEventListener('click', () => makePrediction('down'));
    dom.shareBtn.addEventListener('click', shareResult);

    // WebSocket bağlantısını başlat
    connectWebSocket();

    // Pencere boyutu değiştiğinde grafiği yeniden çiz
    window.addEventListener('resize', () => {
        drawChart();
    });

    console.log('✅ KriptoTahmin hazır!');
}

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', init);
