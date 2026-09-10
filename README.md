# KriptoTahmin

Canli kripto fiyatlariyla oynanan kucuk bir fiyat tahmin oyunu.

Bu proje, kripto verisiyle calisan daha buyuk bir raporlama aracina baslamadan once hazirlanmis bir hafta sonu prototipidir. Binance WebSocket uzerinden BTC, ETH, BNB, SOL ve AVAX fiyatlarini canli takip eder; oyuncu fiyatin kisa sure sonra yukari mi asagi mi gidecegini tahmin eder.

## Ozellikler

- Canli Binance WebSocket fiyat akisi
- BTC, ETH, BNB, SOL ve AVAX destegi
- Yukari/asagi tahmin mekanigi
- Skor, seri, rekor ve basari orani
- Canvas tabanli mini fiyat grafigi
- LocalStorage ile istatistik kaydi
- Mobil uyumlu koyu tema

## Calistirma

Projeyi herhangi bir statik dosya sunucusuyla calistirabilirsin.

```bash
npx serve .
```

Ardindan tarayicida ac:

```text
http://localhost:3000
```

Alternatif olarak `index.html` dosyasini dogrudan tarayicida da acabilirsin.

## Teknolojiler

- HTML
- CSS
- JavaScript
- Canvas API
- Binance WebSocket API

## Not

Bu proje egitim ve portfoy amaciyla yapilmis bir oyundur. Yatirim tavsiyesi, al-sat sinyali veya finansal karar araci degildir.
