## v4.4.27 - 2026-08-08

### İyileştirmeler
- Sekme şeridi (WA/Telegram profil sekmeleri, NeRoChAt, Oyunlar) artık tek bir pointer-event delegasyonu üzerinden çalışıyor. Eskiden her sekmeye ayrı ayrı bağlanan tıklama/sürükleme dinleyicileri, Linux/Wayland'de rastgele "bu sekme tıklamaya cevap vermiyor" davranışına ve native sürükle-bırak (drag) ile pencere taşımanın çakışmasına yol açıyordu; bu artık giderildi.
- Pencerenin sürüklenebilir (drag) bölgesi, dinamik olarak yeniden oluşturulan sekmeler yerine sadece ilk boyamadan itibaren sabit kalan logo/başlık öğeleriyle sınırlandırıldı.
- Logo ve uygulama ikonları güncellendi.

### Hata Düzeltmeleri
- AI "metni düzelt/çevir" önerileri artık WhatsApp Web sayfasına `innerHTML` yerine güvenli DOM ile yazılıyor — modelin döndürdüğü metnin sayfa üzerinde HTML/script olarak çalışabilme ihtimali kapatıldı.
- Bot yeniden bağlanma denemelerinde `botReady` durumu sıfırlanmadığı için ilerleme göstergesinin ve "takıldı" izleyicisinin (watchdog) sessizce devre dışı kalabildiği, gereksiz kurtarma döngülerine yol açabilen bir hata düzeltildi.
- Debug/ana/sohbet prefix karşılaştırmaları artık büyük/küçük harfe duyarsız — büyük harf içeren bir prefix belirlendiğinde bir daha hiç eşleşmemesi (ve debug prefix için kullanıcıyı kilitleyebilmesi) önlendi.
- Profil kapatıldığında periyodik `flushStorageData` interval'ının temizlenmemesinden kaynaklanan, her profil aç/kapat döngüsünde biraz daha bellek sızdıran hata giderildi.

### Diğer Değişiklikler
- Rate-limit bucket'larına boşta kalma süpürmesi, AI sohbet geçmişlerine ise üst sınır eklenerek uzun süre çalışan profillerde sınırsız bellek büyümesi önlendi.
- Hiçbir yerden çağrılmayan Telegram `onStatus` callback'i ve güncel olmayan bir kod yorumu temizlendi.

## v4.4.25 - 2026-07-31

- Release v4.4.25 (1215195, SalihYzts)
- Release v4.4.24 (d5a29f5, SalihYzts)
- Release v4.4.23 (75bf638, SalihYzts)
- Fix duplicate GitHub release bug on publish (cdb7024, SalihYzts)
- Release v4.4.22 (4f229de, SalihYzts)
- Release v4.4.21 (26fe00e, SalihYzts)
- Release v4.4.20 (bb00579, SalihYzts)
- Release v4.4.19 (97e9ae2, SalihYzts)
- Release v4.4.18 (84fe77b, SalihYzts)
- deneme (1bf3347, SalihYzts)
- Release v4.4.17 (7cfade5, SalihYzts)
- Release v4.4.16 (1c8ffa6, SalihYzts)
- v2.1.1 (3ee24de, SalihYzts)
- v2.1.0 (0cd3447, SalihYzts)
- settings update (24dd90a, SalihYzts)

## v4.4.24 - 2026-07-31

- Release v4.4.24 (d5a29f5, SalihYzts)
- Release v4.4.23 (75bf638, SalihYzts)
- Fix duplicate GitHub release bug on publish (cdb7024, SalihYzts)
- Release v4.4.22 (4f229de, SalihYzts)
- Release v4.4.21 (26fe00e, SalihYzts)
- Release v4.4.20 (bb00579, SalihYzts)
- Release v4.4.19 (97e9ae2, SalihYzts)
- Release v4.4.18 (84fe77b, SalihYzts)
- deneme (1bf3347, SalihYzts)
- Release v4.4.17 (7cfade5, SalihYzts)
- Release v4.4.16 (1c8ffa6, SalihYzts)
- v2.1.1 (3ee24de, SalihYzts)
- v2.1.0 (0cd3447, SalihYzts)
- settings update (24dd90a, SalihYzts)
- stable version 2 (2398f52, SalihYzts)

## v4.4.23 - 2026-07-24

### Hata Düzeltmeleri
- GitHub'a yayın yapılırken `.blockmap` dosyasının `.exe`/`latest.yml` ile paralel yüklenmesi bazen aynı sürüm etiketi için iki ayrı release oluşturuyordu; GitHub bu durumda "en son release" olarak eksik olanı (güncelleme dosyası içermeyen) gösterebiliyor ve bu da otomatik güncellemenin çalışmamasına yol açıyordu. Blockmap üretimi kapatılarak bu yarış durumu ortadan kaldırıldı.
- v4.4.18, v4.4.21 ve v4.4.22 için GitHub'da oluşmuş olan hatalı/boş duplicate release'ler temizlendi.

## v4.4.22 - 2026-07-24

- Release v4.4.22 (4f229de, SalihYzts)
- Release v4.4.21 (26fe00e, SalihYzts)
- Release v4.4.20 (bb00579, SalihYzts)
- Release v4.4.19 (97e9ae2, SalihYzts)
- Release v4.4.18 (84fe77b, SalihYzts)
- deneme (1bf3347, SalihYzts)
- Release v4.4.17 (7cfade5, SalihYzts)
- Release v4.4.16 (1c8ffa6, SalihYzts)
- v2.1.1 (3ee24de, SalihYzts)
- v2.1.0 (0cd3447, SalihYzts)
- settings update (24dd90a, SalihYzts)
- stable version 2 (2398f52, SalihYzts)
- js error fix (ee9d49a, SalihYzts)
- Readme final (7b8ede3, SalihYzts)
- Update README.md (10e300b, Salih Yazıtaş)

## v4.4.21 - 2026-07-24

- Release v4.4.21 (26fe00e, SalihYzts)
- Release v4.4.20 (bb00579, SalihYzts)
- Release v4.4.19 (97e9ae2, SalihYzts)
- Release v4.4.18 (84fe77b, SalihYzts)
- deneme (1bf3347, SalihYzts)
- Release v4.4.17 (7cfade5, SalihYzts)
- Release v4.4.16 (1c8ffa6, SalihYzts)
- v2.1.1 (3ee24de, SalihYzts)
- v2.1.0 (0cd3447, SalihYzts)
- settings update (24dd90a, SalihYzts)
- stable version 2 (2398f52, SalihYzts)
- js error fix (ee9d49a, SalihYzts)
- Readme final (7b8ede3, SalihYzts)
- Update README.md (10e300b, Salih Yazıtaş)
- Create READMETR.md (a13dcf1, Salih Yazıtaş)

## v4.4.20 - 2026-07-21

### İyileştirmeler
- Sürüm numaralandırma şeması güncellendi ve `v4.4.x` serisi altında kararlı sürümler yayınlandı.
- Proje ayarları üzerinde düzenlemeler yapıldı.
- `README.md` ve `READMETR.md` dosyaları son hâline getirildi; Türkçe dokümantasyon eklendi.
- Kararlı sürüm (stable) yapısı yeniden düzenlendi.

### Hata Düzeltmeleri
- JavaScript kaynaklı hata düzeltildi.
- `deneme` commit'i ile yapılan test/deneme düzeltmeleri birleştirildi.

### Diğer Değişiklikler
- `v4.4.16`, `v4.4.17`, `v4.4.18`, `v4.4.19` ve `v4.4.20` sürümleri sırasıyla yayımlandı.
- Eski sürüm serisi (`v2.1.0`, `v2.1.1`) bu sürümle birlikte geçmiş sürüm olarak işaretlendi.

## v4.4.19 - 2026-07-21

### Yeni Özellikler
- v2.1.0 sürümü ile projeye yeni özellikler eklendi.
- v2.1.1 bakım güncellemesi yayımlandı.

### İyileştirmeler
- Proje ayarları gözden geçirilerek güncellendi.
- Proje, "stable version 2" olarak işaretlenen daha kararlı bir sürüme taşındı.
- v4.4.16, v4.4.17 ve v4.4.18 üzerinden geliştirilerek v4.4.19 sürümüne ilerleyen sürüm döngüsü tamamlandı.

### Hata Düzeltmeleri
- Projede yaşanan JavaScript kaynaklı hatalar giderildi.

### Diğer Değişiklikler
- `README.md` dosyası son haliyle düzenlendi ve güncellendi.
- Türkçe kullanıcılar için `READMETR.md` adıyla Türkçe bir README dosyası oluşturuldu.
- "deneme" adıyla çeşitli testler ve denemeler gerçekleştirildi.

## v4.4.18 - 2026-07-21

### Hata Düzeltmeleri
- JavaScript kaynaklı hatalar giderildi.

### İyileştirmeler
- Proje ayarları güncellendi.

### Diğer Değişiklikler
- v4.4.18 sürümü yayına alındı.
- Sürüm öncesinde test ve deneme çalışmaları gerçekleştirildi.
- Proje belgeleri (README) son haline getirildi.
- v4.4.17 ve v4.4.16 ara sürümleri yayınlandı.
