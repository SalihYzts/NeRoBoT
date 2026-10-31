## v4.4.36 - 2026-10-31

### Düzeltmeler

- **Pencere küçülünce artık kesilmiyor.** Pencere 900×600'den küçük olunca
  (Hyprland gibi döşeyen pencere yöneticilerinde sık olur) sağdaki
  küçült/büyüt/kapat düğmeleri, WhatsApp'ın sağ tarafı ve alttaki durum
  çubuğu pencerenin dışında kalıyordu. Artık her şey pencerenin gerçek
  boyutuna göre küçülüyor.
- **WhatsApp küçük pencerede orantılı küçülüyor.** WhatsApp Web'in kendi
  düzeni belli bir boyutun altında kaydırma çubuğu çıkarıp yazı kutusunu,
  gönder düğmesini ve mesajları ekran dışında bırakıyordu. Artık alan
  daraldıkça WhatsApp'ın tamamı aynı oranda küçülüyor; pencere büyüyünce
  normal boyutuna dönüyor.
- **Dar pencerede üst çubuk.** Pencere çok darken "NeRoBoT" yazısı gizlenip
  yalnızca logo kalıyor; sekmelere yer açılıyor, ev düğmesi hep görünür.

## v4.4.35 - 2026-10-31

### Yeni Özellikler

- **Tarayıcı gibi sekme kısayolları.**
  - `Ctrl+T` Ana sayfaya (profiller ekranı) geçiyor; açık sekmeler kapanmıyor.
  - `Ctrl+W` ekrandaki sekmeyi kapatıyor (WhatsApp/Telegram profili,
    NeRoChAt ya da Oyunlar).
  - Bir sekmeye **orta tuşla (tekerlek) tıklamak** onu kapatıyor.

  WhatsApp, Telegram ya da NeRoChAt'a yazı yazarken de çalışıyorlar. Ayarlar
  gibi bir pencere açıkken devre dışı, böylece arkadaki sekme yanlışlıkla
  kapanmıyor. Bu tuşlar artık başka bir kısayola atanamıyor.

## v4.4.34 - 2026-10-31

### Düzeltmeler — Bot

- **Kendi yazdığın mesajlar artık kara liste ve sabit sohbet ayarlarına
  uyuyor.** "Önek olmadan herkese cevap ver" açıkken AI, senin yazdığın her
  sohbette devreye giriyordu. Kendi mesajların artık karşı tarafın hız
  limitini de harcamıyor.
- **Gruplarda `!model chat` ve `!personality chat` çalışıyor.** Sohbete özel
  kişilik artık kalıcı: yeniden başlatınca ya da `!clear` ile kaybolmuyor,
  çok satırlı metin tek satıra düşmüyor.
- **`!blacklist add` artık sohbeti ekliyor**, komutu yazanı değil (admin kendi
  DM'inden kilitlenebiliyordu).
- **Önek gerektirmeyen sohbetlerde** sesli mesajlara "desteklenmiyor" cevabı
  gitmiyor, çıkartmalar AI'a tarif ettirilmiyor.
- **Çakışan önekler** (`!ai` gibi) artık kabul edilmiyor; AI'ı susturuyordu.
- **Hız limiti** ayarlanandan yavaş doluyordu, düzeldi.
- **Görsel üretimi:** açıklama başarısız olsa da görsel gönderiliyor.

### Düzeltmeler — Ayarlar

- **Boş komut öneki ya da boşaltılmış sayı alanları** artık reddediliyor ve
  hangi alanın eski değerinde kaldığı söyleniyor (önceden bot susuyor ya da
  herkes sonsuza kadar hız limitine takılıyordu).
- **NeRoChAt / API anahtarı alt sekmeleri** profil ayarları panelini
  boşaltmıyor.
- **Genel sekmesinde tek Kaydet** artık AI bölümündeki değişiklikleri de
  kaydediyor.
- **"Kaydedildi ✓"** her bölümde görünüyor.
- **Yeni profiller Türkçe başlıyor**; İngilizce modda Türkçe kalan ~80 metin
  çevrildi.
- **Kısayol kaydedici:** Esc ile iptal, Ctrl ya da Alt zorunlu, çakışma
  kontrolü.

### Düzeltmeler — Güvenlik ve kararlılık

- **Uygulama kilidi** artık ana süreçte uygulanıyor: kilitliyken arkadaki
  düğmelere klavyeyle ulaşılamıyor, profil dışa aktarma gibi işlemler
  reddediliyor.
- **Güncelleme indirmesi** takılırsa gerçekten iptal ediliyor (önceden
  "indirilemedi" deyip arkada inmeye devam ediyor, bitince uyarmadan
  kuruyordu).
- **NeRoChAt:** cevap gelirken sohbet değiştirilemiyor (cevap yanlış sohbete
  yazılıyordu); seçtiğin model sekmeye dönünce korunuyor.

## v4.4.33 - 2026-10-31

### Yeni Özellikler

- **Üç yeni oyun.** Oyunlar sekmesinde ve hızlı oyun penceresinde (Ctrl+Shift+O):
  - **Raket Düellosu** — bilgisayara karşı, 7 sayı alan kazanır. Top her
    vuruşta hızlanıyor, raketin neresine çarptığı açıyı belirliyor, hareket
    halindeki raket falso veriyor. W/S, ↑/↓ ya da fare.
  - **Tuğla Kırıcı** — 3 can; duvar bitince bir sıra daha uzun ve biraz daha
    hızlı yeni duvar geliyor. ←/→, A/D ya da fare; Boşluk/tık ile top atılır.
  - **Hafıza** — 4×4 kart eşleştirme; fare ya da oklar + Enter.

### İyileştirmeler

- **Açılır pencerelerin arkası artık canlı bulanık.** Ayarlar, oyun penceresi
  gibi bir pencere açıldığında arkada donmuş bir ekran görüntüsü yerine
  ekranın canlı hali bulanık görünüyor — WhatsApp/Telegram/NeRoChAt'ta gelen
  mesajlar blur'un arkasında akmaya devam ediyor.

## v4.4.32 - 2026-10-31

### Yeni Özellikler

- **Çoklu Mesaj (TCek81'in katkısı, #2).** Ayarlar → Hizmetler → Çoklu Mesaj:
  numarasını verip mesaj almayı kabul etmiş kişilere tek seferlik mesaj.
  Karışık yazılmış numara listeleri tek biçime iniyor, tekrarlar ayıklanıyor,
  `{isim}` ile kişiselleştirme, fotoğraf + alt yazı, daha önce gönderdiğin bir
  mesajı şablon alma ya da aynen iletme. Rastgele bekleme, parti molaları,
  WhatsApp'ta numara doğrulama ve "aynı kişiye ikinci mesaj gitmesin" kaydı var.
- **Çoklu Mesaj Telegram'da da çalışıyor.** Listeye numaranın yanında
  `@kullanıcı_adı` / `t.me/ad` yazılabiliyor. Numaralar gönderimden önce hesaba
  çözülüyor; bu iş için eklenen kişiler gönderimden hemen sonra rehberden geri
  siliniyor (zaten kişin olanlara dokunulmuyor). Telegram bekleme isterse
  (FLOOD_WAIT) gönderim bekliyor.
- **Telegram'a gelen diğer özellikler:** "Bu sohbeti sor" (Bot + Web modunda
  paneldeki açık sohbeti okur), `!upload` komutu, Listeler sekmesinde isimler
  ve açık sohbetin otomatik seçilmesi, tercih edilen mikrofon/kamera Telegram
  Web aramalarında da geçerli.

### İyileştirmeler

- **Pencere boyutlandırma düzeltildi.** Pencere küçültülüp en-boy oranı
  değişince, büyütülüp küçültülünce ya da tam ekrana geçince WhatsApp/Telegram
  ekranı üst/alt çubuklarla hizasını kaybediyordu. Artık yerini arayüzün
  kendisi ölçüp bildiriyor; Linux/Wayland'deki gecikmeli boyut bilgisi de
  yakalanıyor.
- **Arada açılan beyaz tema giderildi.** Uygulama koyu temaya sabitlendi;
  WhatsApp Web sistemin temasını takip edip zaman zaman açık temada
  açılıyordu. Yüklenen ya da büyüyen ekranlar da artık beyaz parlamıyor.
- Küçük pencerede ana ekranın ve açılır pencerelerin üstü ekran dışında
  kalmıyor, içerik kayıyor.
- Ctrl+- / Ctrl+= ana arayüzü yakınlaştırıp ekranları kaydırıyordu, Ctrl+R
  bütün arayüzü yeniden yüklüyordu — ikisi de kapatıldı.

### Hata Düzeltmeleri

- Telegram: botun ürettiği görseller fotoğraf yerine "unnamed" adlı dosya
  olarak gidiyordu.
- Telegram: kendi yazdığın `!admin add` gibi komutlar seni değil karşıdaki
  kişiyi ya da grubu ekliyordu.
- Telegram: önek gerektirmeyen sohbetlerde bot kendi cevabına cevap
  verebiliyordu.
- Telegram: bildirimlerde isim yerine numara/ID, fotoğraf/ses mesajlarında boş
  içerik, gruplarda yazan kişi yerine grup adı görünüyordu; takip edilen
  kanalların her gönderisi bildirim oluyordu.
- Telegram: yanlış 2FA şifresi girişi tamamen iptal ediyordu — artık "şifre
  yanlış, tekrar dene" diye yeniden soruyor.
- Telegram: yeniden başlatmadan sonra rehberinde olmayan sohbetlere (hata
  ayıklama sohbeti, sabit sohbet, bildirimden hızlı cevap) gönderim
  başarısız olabiliyordu.
- Telegram: Listeler'e yazılan sayısal ID'ye yanlışlıkla WhatsApp eki
  ekleniyor, kayıt hiç eşleşmiyordu.
- Telegram "yalnızca Web" modunda ayarlar kaydedilemiyordu.
- "Bot" modundaki profil açıkken gelen mesajların bildirimi hiç
  görünmüyordu (WhatsApp ve Telegram).

## v4.4.30 - 2026-09-11

### Hata Düzeltmeleri

- **Başlık çubuğundan pencere sürükleme yeniden çalışıyor (Linux/Wayland).**
  v4.4.27'de üst çubuktaki native sürükleme bölgesi kaldırılıp yerine
  pencereyi JS'ten konumlandıran bir yöntem konmuştu. Wayland oturumlarında
  (KDE/KWin varsayılanı) bir uygulama kendi penceresini konumlandıramadığı
  için bu çağrılar sessizce yok sayılıyor ve başlık çubuğu hiç
  sürüklenemiyordu. Sürükleme yeniden pencere yöneticisine bırakıldı.
- Sürüklenebilir alan genişletildi: artık yalnızca logo/başlık değil, üst
  çubuğun sekmeler ile sağdaki düğmeler arasında kalan tüm boşluğu pencereyi
  taşımak için kullanılabiliyor.
- Sekme ve düğme tıklamaları etkilenmiyor: sekmeler, ev/bildirim/ayarlar ve
  pencere düğmeleri sürükleme bölgesinin dışında tutuldu.

### Diğer Değişiklikler

- Kullanılmayan pencere sürükleme IPC katmanı (`window:dragStart` /
  `dragMove` / `dragEnd`) ve preload köprüsü kaldırıldı.
- Kısayol dosyaları (`NeRoBoT_App.bat/.sh`, `NeRoBoT_Kurulum.bat/.sh`)
  kaldırıldı — her şey npm betikleriyle yönetiliyor (`npm start`,
  `npm run release`).
- Yayın akışından LinkedIn duyuru metni ve Word (.docx) üretimi çıkarıldı.

## v4.4.29 - 2026-08-17

### Yeni Özellikler
- KVKK (Kişisel Verilerin Korunması) tarayıcı entegrasyonu için altyapı hazırlıkları
- Sürüm yayınlama sürecini otomatikleştiren yeni `scripts/release.js` betiği eklendi
- Arch Linux paket yapılandırması (`PKGBUILD`) güncellendi
- Kullanıcı arayüzüne yeni bölümler ve bileşenler eklendi

### İyileştirmeler
- Ana uygulama mantığı (`app/main.js`) baştan yapılandırılarak daha kararlı bir çalışma sağlandı
- Telegram bot bağlantısı ve mesajlaşma akışı iyileştirildi
- Yapay zeka modülü, bot komutları ve profil yönetimi daha esnek hale getirildi
- Hız sınırlama (rate limit) mekanizması güçlendirildi
- Dosya çıkarma ve görsel üretimi modüllerinin güvenilirliği artırıldı
- Ollama kurulum aracı daha kullanıcı dostu hale getirildi
- Kurulum betikleri (`NeRoBoT_Kurulum.bat` / `.sh`) sadeleştirildi
- README ve Türkçe READMETR dosyaları güncellendi

### Hata Düzeltmeleri
- Mevcut sürümde tespit edilen kararlılık ve uyumluluk sorunları giderildi

### Diğer Değişiklikler
- Eski derleme betikleri (`NeRoBoT_Derle.bat`, `NeRoBoT_Derle.sh` ve `scripts/build.js`) kaldırıldı
- Eski yayınlama betikleri (`NeRoBoT_Yayinla.bat`, `NeRoBoT_Yayinla.sh`) kaldırıldı
- Paket bağımlılıkları ve sürüm bilgileri güncellendi (`package.json`, `package-lock.json`)
- GitHub Actions yayın akışı (`release.yml`) yeni yayın betiğiyle uyumlu hale getirildi

## v4.4.28 - 2026-08-08

### Hata Düzeltmeleri
- Pacman paketiyle `/opt/nerobot` altına (root sahipli, salt-okunur bir konum) kurulan AppImage'de "Şimdi Güncelle"ye tıklandığında electron-updater kendi dosyasını yerinde değiştirmeye çalışıp `EACCES: permission denied, unlink '/opt/nerobot/nerobot.AppImage'` hatasıyla başarısız oluyordu. İndirmeye başlamadan önce hedef dizine yazma izni kontrol ediliyor; izin yoksa boşuna indirme yapılmadan kullanıcıya paket yöneticisiyle (`sudo pacman -Syu nerobot`) ya da GitHub Releases'ten elle güncellemesi gerektiğini söyleyen anlaşılır bir mesaj gösteriliyor.

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
