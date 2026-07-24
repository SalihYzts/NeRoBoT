```
                                                                                                      
                                                                                                      
                                                                                                      
        :                                                                                          :  
        -                                                  -                                     :-:: 
   - ::::    :   : --     -          :                  -                              :       ::::   
     : ::::: -   ::::::         :::::::::::: :          ::::::::::::::-    :     : :::::::::::::: ::  
    :- ::::: --- -::::: : : -    - ::::::::::::      :    :::::::::::::::        :  ::::::::.::::-    
  ---- ::::::::  ::::::           ::::: :::::::-     -     :::::  - ::::         - : -- :::::   :     
       :.:.:.:.:  ...::       : :  :..::   ::.:: :   .  :   ..:     :::.   :::. :::    ::.::          
       :::::::::  ..:: -:::::::::: ::.::   ::::  ::::::::::::::: -:-::::- -:::::::::-   ::.:          
    :  ::.: :::::::::: .:::   :::: ::::::.:::: ::::   ::::.-:.::::::::   ::::-   ::::  :::::          
    -   :::   :::::::: :: :::::::: .:::::::::   :::    -::: :: : : ::::: :::     :::    ::::          
    -: :::::  ::-::::: .:::.::.::: :::.::::::  :::::   :::. ::::    ::.: ::::    :::   -:::: -        
   ::  :::::   : ::::: .:::        :::::- :::   ::::   :::.:.:::    :::: ::::   ::::   -:::: -        
        ::::      ::::  :  ::::::  : ::: - -::: ::-:::::::: ::   :: ::::  :::::::::::  :::::::        
       :::::     :::::  :::.::::   :::::   :.::: -::::::   .::::::::::.-  : :.:::. :   ::::: :        
    -- --:::     : :-:      : :    : ::     : ::- :  :    - -       -: :     :   : :   -:::::-        
     : :::-:        ::    : :      ::::     : - ::   :      :          :           :     : :::        
     ::   :                                      ::         :          :                    :         
      :                                                     -                               :         
                                   -                                                         -        
                                                                                                      
                                                                                                      
                                                                                                    
```

**NeRoBoT**, **WhatsApp** ve **Telegram** üzerinde yerel yapay zeka destekli botlar çalıştıran bir Windows masaüstü uygulamasıdır — aynı anda birden fazla hesap/platform, her biri tamamen izole — ayrıca hiçbir sohbet hesabına bağlı olmayan bağımsız bir AI sohbeti (**NeRoChAt**) de içerir. Her şey kendi bilgisayarındaki [Ollama](https://ollama.com/) modelleri üzerinde çalışır.

Geliştirici: **Salih Yazıtaş**

---
## Belgeler
- [English README](README.md)
- To access the English README file
---

## İçindekiler

- [Özellikler](#özellikler)
- [Gereksinimler](#gereksinimler)
- [Proje Yapısı](#proje-yapısı)
- [Kurulum](#kurulum)
- [Derleme ve Yayınlama](#derleme-ve-yayınlama)
- [Komutlar](#komutlar)
- [Varsayılan Yapılandırma](#varsayılan-yapılandırma)
- [Sık Karşılaşılan Sorunlar](#sık-karşılaşılan-sorunlar)
- [Güvenlik Notları](#güvenlik-notları)
- [Lisans](#lisans)

---

## Özellikler

**Uygulama**
- Çoklu Profil — birden fazla WhatsApp hesabını ve/veya Telegram hesabını yan yana çalıştırın, her biri kendi girişi, ayarları, beyaz listesi, adminleri ve AI hafızasıyla tamamen izole
- Bildirim Paneli — bir zil ikonu tüm profillerden gelen mesajları (en yeni üstte) topluyor, satır içi hızlı-cevap kutusuyla sekme değiştirmeden yanıt verebiliyorsunuz; bir profilin sekmesi mesajlarını okuyana kadar yanıp sönüyor
- NeRoChAt — herhangi bir WhatsApp/Telegram botuna bağlı olmayan, tam kapsamlı, genel amaçlı bir AI sohbet sekmesi; kayıtlı konuşmalar, görsel ekleme ve AI görsel üretimi ile
- NeRoChAt Hızlı Popup — ayarlanabilir bir global klavye kısayolu (varsayılan `Ctrl+Shift+K`) ne yapıyor olursanız olun üzerine küçük, yüzen bir AI sohbeti açıyor; "Bu sohbeti sor" o WhatsApp sohbetinin geçmişinden bir başlangıç/bitiş mesajı aralığı seçip bağlam olarak çekmeni sağlıyor
- Yazı Düzeltme Kısayolu — ayarlanabilir bir global klavye kısayolu (varsayılan `Ctrl+Shift+J`) bir WhatsApp mesajı yazarken, yazı kutusunun hemen altında imla düzeltmeli/resmi/samimi varyantlar öneriyor; isteğe bağlı "Otomatik Düzeltme" modu kısayola basmana gerek kalmadan bir süre durakladığında önerileri kendiliğinden çıkarıyor
- Otomatik Güncelleme — her açılışta GitHub Releases'i kontrol edip kendini sessizce güncelliyor (indir → kur → yeniden aç), pencere açılmadan önce
- Kalıcı Oturumlar — her profilin QR kodunu bir kez okutun; girişler yeniden başlatmalarda korunur

**Bot (her WhatsApp/Telegram profili için)**
- Yerel YZ Desteği — Ollama üzerinden çektiğiniz istediğiniz modeli (görsel destekli modeller dahil) kullanın
- Sohbet Hafızası — her sohbet/kullanıcı için ayrı bağlam, isteğe bağlı ortak hafızalı grup modu
- Görsel & Dosya Okuma — görselleri (vision), PDF, Word ve düz metin/kod dosyalarını okuyup modele aktarır
- AI Görsel Üretimi — istek üzerine görsel üretip sohbete geri gönderir
- Beyaz Liste / Kara Liste — belirli sohbetlere botu kullanma izni verin ya da engelleyin
- Admin Paneli — sadece yetkili kişiler yönetim komutlarını kullanabilir; geri alınamaz işlemler onay gerektirir
- Kişilik (Personality) — botun sistem mesajını global veya sohbet bazında değiştirin
- Özelleştirilebilir Prefix'ler — ana, debug ve yoksayma prefix'leri ayrı ayrı ayarlanabilir
- No-Prefix Modu — bir sohbette (ya da tüm sohbetlerde) prefix kullanmadan her mesaja yanıt verilmesini sağlayın
- Sabit Sohbet Modu — botu tek bir sohbete kilitleyin
- Hız Sınırlama — spam/kötüye kullanımı önlemek için kullanıcı bazlı token-bucket limiter
- Debug Kanalı — hataları ve yeni mesaj bildirimlerini ayrı bir sohbete yönlendirin
- Bilgi Komutu — tüm sistem durumunu tek mesajda görün
- İki Dilli Yardım — yardım menüsü Türkçe ve İngilizce olarak mevcut

---

## Gereksinimler

**Sadece uygulamayı kullanmak mı istiyorsunuz?** Uygulamanın kendisi dışında hiçbir şey kurmanıza gerek yok — aşağıdaki [Kurulum](#kurulum) bölümüne bakın. [Ollama](https://ollama.com/) sadece AI özelliklerini açtığınızda gerekiyor ve installer sizin için kurmayı teklif ediyor.

**Kaynak koddan çalıştırma/derleme:**

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Windows** (paketlenmiş installer/otomatik güncelleme şu an sadece Windows'ta çalışıyor; kaynak koddan çalıştırmak platformlar arası çalışır)

> Chrome **gerekmez** — uygulama kendi tarayıcı motoruyla (Electron) gelir.

---

## Proje Yapısı

```
nerobot/
├── package.json
├── NeRoBoT_App.bat                 # Masaüstü uygulamasını başlatır (Windows)
├── NeRoBoT_Kurulum.bat             # Kaynak koddan ilk kurulum (npm install + ikonlar)
├── NeRoBoT_Derle.bat               # Sürüm numaralı bir installer'ı yerelde derler (yayınlamaz)
├── NeRoBoT_Yayinla.bat             # Kaynağı gönderir + GitHub Release olarak yayınlar (aşağıya bakın)
├── app/
│   ├── main.js                     # Electron ana süreç — pencereler, gömülü WhatsApp/Telegram
│   │                                #   görünümleri, profil/oturum yönetimi, otomatik güncelleme, tüm IPC
│   ├── preload.cjs                 # Arayüz ↔ ana süreç köprüsü
│   └── ui/
│       ├── index.html              # Üst çubuk, sekme şeridi, bildirim paneli, ayarlar, hızlı popup
│       └── ollama.html             # NeRoChAt'ın kendi tam sekme penceresi
├── src/
│   ├── bot.js                      # WhatsApp istemcisi & mesaj yönlendirme
│   ├── telegram-bot.js             # Telegram istemcisi & mesaj yönlendirme (bot.js'in yansıması)
│   ├── ai.js                       # Ollama entegrasyonu (sohbet, görsel anlama, görsel-niyet sınıflandırma)
│   ├── imagegen.js                 # AI görsel üretim altyapısı
│   ├── config.js                   # Profil bazlı durum/ayar kalıcılığı
│   ├── profiles.js                 # Çoklu profil kayıt defteri (oluştur/yeniden adlandır/sil/dışa-içe aktar)
│   ├── commands.js                 # Tüm !komutlar
│   ├── ratelimit.js                # Token-bucket hız sınırlayıcı
│   ├── utils.js / telegram-utils.js
│   ├── file-extract.js             # AI'ın okuyabilmesi için PDF/Word/metin çıkarımı
│   └── ollama-installer.js         # Windows'ta Ollama'yı algılar/sessizce kurar
├── scripts/                        # Sadece geliştirme sırasında kullanılan araçlar, pakete dahil edilmez
│   ├── build.js                    # NeRoBoT_Derle.bat / npm run build'in arkasındaki betik
│   ├── release.js                  # NeRoBoT_Yayinla.bat / npm run release'in arkasındaki betik
│   └── gen-icons.js                # logo.svg'den app/ui/icon.ico + icon.png'yi yeniden üretir
└── build/installer.nsh             # Özel NSIS kurulum-zamanı kancası (en iyi çaba Ollama kurulumu)
```

Tüm profil verisi (WhatsApp/Telegram oturumları, profil bazlı ayarlar, NeRoChAt konuşmaları, uygulama config'i) bu klasörün **dışında**, `Documents/NeRoBoT/NeRoBoT_db` altında saklanır — yani uygulamayı kaldırmak/taşımak ona hiç dokunmaz. Altındaki hiçbir şey git'e commit edilmez (bkz. `.gitignore`).

---

## Kurulum

### Windows: Installer (önerilen)

[GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases) sayfasından `NeRoBoT Setup x.y.z.exe` dosyasını indirip çalıştırın. NeRoBoT normal bir Windows uygulaması olarak kurulur (Start Menu kısayolu, Windows arama kutusundan bulunabilir, "Program Ekle/Kaldır"da kendi uninstaller'ıyla listelenir) — `git clone`/`npm install` gerekmez. [Ollama](https://ollama.com/) kurulu değilse installer onu arka planda sessizce indirip kurmayı dener (bu, kurulumun kendisini asla beklemez/geciktirmez); bu adım atlanır veya başarısız olursa (örn. kurulum sırasında internet yoksa) NeRoBoT, AI Bot'u ilk açtığınızda kurulumu tekrar teklif eder. Bundan sonra uygulama her açılışta güncelleme kontrolü yapıp kendini otomatik günceller.

### Kaynak koddan çalıştırma (geliştirme)

### 1. Depoyu Klonlayın

```bash
git clone https://github.com/SalihYzts/NeRoBoT.git
cd nerobot
```

### 2. Kurulum

`NeRoBoT_Kurulum.bat`'a çift tıklayın, ya da elle çalıştırın:

```bash
npm install
npm run gen-icons
```

### 3. Ollama'yı Kurun ve Bir Model İndirin

[Ollama](https://ollama.com/) sitesinden uygulamayı indirip kurun, ardından kullanmak istediğiniz modeli/modelleri indirin — bunlardan birini, ya da Ollama'nın desteklediği başka herhangi bir modeli seçebilirsiniz:

```bash
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
ollama pull llava
```

### 4. Uygulamayı Başlatın

```bash
npm start
```

Windows'ta `NeRoBoT_App.bat` dosyasına çift tıklayarak da açabilirsiniz. Home ekranından ilk WhatsApp ya da Telegram profilinizi oluşturabilirsiniz.

### 5. Bir Profili Bağlayın

1. Home ekranından bir profil oluşturun (WhatsApp ya da Telegram)
2. **WhatsApp:** Uygulamanın içinde görünen QR kodu telefonunuzla okutun (WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz Bağla)
3. **Telegram:** QR kodu telefonunuzla okutun (Telegram → Ayarlar → Cihazlar → Masaüstü Cihazı Bağla)

Bunu her profil için sadece bir kez yapmanız gerekir — oturum kaydedilir ve sonraki açılışta geri yüklenir.

---

## Derleme ve Yayınlama

İki ayrı adım — böylece yayınlamaya karar vermeden önce bir sürümü derleyip test edebilirsiniz:

```bash
npm run build     # ya da NeRoBoT_Derle.bat'a çift tıklayın
```
Bir sürüm numarası sorar, `package.json`'a yazar ve `dist/NeRoBoT Setup x.y.z.exe`'yi yerelde derler — bilgisayarınızdan hiçbir şey çıkmaz.

```bash
npm run release   # ya da NeRoBoT_Yayinla.bat'a çift tıklayın
```
`npm run build`'ın az önce belirlediği sürümü kullanır. Bekleyen kaynak kod değişikliklerini gösterip GitHub'a göndermeden önce onay ister, ardından o sürümü derleyip GitHub Release olarak yayınlamadan önce tekrar onay ister (bu, uygulamanın otomatik güncelleme kontrolünü de besler). İlk seferinde `repo` yetkisine sahip bir GitHub [Personal Access Token](https://github.com/settings/tokens/new) gerektirir — sonrasında yerelde saklanır (`.release-token`, gitignore'da, asla commit'lenmez).

---

## Komutlar

Tüm komutlar **debug prefix** (varsayılan `!`) ile başlar ve çoğu alt-komut destekler (örn. `!admin add`).

<details>
<summary><b>Admin Yönetimi</b></summary>

| Komut | Açıklama |
|---|---|
| `!admin` / `!admin list` | Admin listesini gösterir. |
| `!admin add [ID]` | Bu sohbeti veya belirtilen ID'yi admin yapar. |
| `!admin remove [ID]` | Admin listesinden çıkarır. |
| `!admin reset` | Tüm admin listesini temizler. *(Onay gerekir.)* |

</details>

<details>
<summary><b>Beyaz Liste / Kara Liste Yönetimi</b></summary>

| Komut | Açıklama |
|---|---|
| `!whitelist` / `!whitelist list` | Beyaz listedeki sohbetleri gösterir. |
| `!whitelist add [ID]` | Beyaz listeye ekler. |
| `!whitelist remove [ID]` | Beyaz listeden çıkarır. |
| `!whitelist reset` | Beyaz listeyi tamamen temizler. *(Onay gerekir.)* |
| `!whitelist control` | Yeni sohbet kontrolünü aç/kapat. |
| `!blacklist` / `!blacklist list` | Kara listeyi gösterir. |
| `!blacklist add [ID]` | Kara listeye ekler (gerekirse önce beyaz listeden çıkarır). |
| `!blacklist remove [ID]` | Kara listeden çıkarır. |
| `!blacklist reset` | Kara listeyi tamamen temizler. *(Onay gerekir.)* |

</details>

<details>
<summary><b>AI Yönetimi</b></summary>

| Komut | Açıklama |
|---|---|
| `!aichat` | AI sohbetini aç/kapat. |
| `!model [isim]` | Mevcut modeli ve yüklü Ollama modellerini gösterir; isim verilirse modeli değiştirir. |
| `!personality` | Bu sohbetin aktif kişiliğini ve global kişiliği gösterir. |
| `!personality chat <metin>` | Sadece bu sohbet için kişiliği günceller. |
| `!personality global <metin>` | Global kişiliği günceller (yeni/temizlenmiş sohbetlere uygulanır). |
| `!think` | Düşünme mesajı durumunu ve metnini gösterir. |
| `!think on` / `!think off` | Düşünme mesajını aç/kapat. |
| `!think <metin>` | Düşünme mesajı metnini günceller. |
| `!replymode` | AI yanıtları için alıntılı yanıt modunu aç/kapat. |
| `!media` | Görsel/dosya okuma ve görsel üretimi durumunu gösterir. |
| `!media image` | Görsel okumayı (vision) aç/kapat. |
| `!media file` | Dosya okumayı (PDF, Word, TXT, JSON, JS...) aç/kapat. |
| `!media imagegen` | Görsel üretimini aç/kapat (resim isteyen mesajlar otomatik algılanıp üretilir). |
| `!aierror <metin>` | AI hata verince kullanıcıya gösterilecek mesajı gösterir veya değiştirir. |

</details>

<details>
<summary><b>Hız Sınırlama</b></summary>

| Komut | Açıklama |
|---|---|
| `!ratelimit` | Hız limiti ayarlarını gösterir. |
| `!ratelimit on` / `!ratelimit off` | Hız limitini aç/kapat. |
| `!ratelimit tokens <n>` | Maksimum token sayısını ayarlar. |
| `!ratelimit refill <sn>` | Token yenileme süresini (saniye) ayarlar. |
| `!ratelimit warn <sn>` | Uyarı cooldown süresini ayarlar. |
| `!ratelimit message <metin>` | Hız limitine giren kullanıcıya gösterilecek uyarı metnini değiştirir. |

</details>

<details>
<summary><b>Hafıza ve Sıfırlama</b></summary>

| Komut | Açıklama |
|---|---|
| `!clear` | Bu sohbetin hafızasını temizler. |
| `!clear <ID>` | Belirtilen sohbetin hafızasını temizler. |
| `!clear all` | Tüm sohbetlerin hafızasını temizler. *(Onay gerekir.)* |
| `!upload <n>` | Bu sohbetin son `<n>` mesajını kendi AI hafızasına yükler (en fazla 300). |
| `!reset settings` | Bu sohbetin kendi ayarlarının tümünü global'e sıfırlar. *(Onay gerekir.)* |
| `!reset settings <isim>` | Bu sohbet için tek bir ayarı sıfırlar, onay gerekmez. |
| `!reset all settings` | Her şeyi fabrika ayarlarına sıfırlar — ayarlar, beyaz liste, kara liste, adminler, sohbet bazlı ayarlar, hafızalar. *(Onay gerekir.)* |

</details>

<details>
<summary><b>Sistem Ayarları</b></summary>

| Komut | Açıklama |
|---|---|
| `!prefix` | Mevcut prefix'leri gösterir. |
| `!prefix main <p>` | Ana (kullanıcıya dönük) prefix'i değiştirir. |
| `!prefix debug <p>` | Debug/komut prefix'ini değiştirir. |
| `!prefix ignore <p>` | Yoksayma prefix'ini değiştirir (sadece no-prefix sohbetlerde). |
| `!fixedchat` | Botu sadece bu sohbete kilitler veya serbest bırakır. |
| `!noprefix` | Bu sohbette no-prefix modunu aç/kapat. |
| `!noprefixall` | No-prefix modunu **tüm** sohbetler için birden aç/kapat. *(Whitelist modu kapalıyken onay gerekir.)* |
| `!groupchat` | Bu grubu ortak hafıza modunda aç/kapat. |
| `!groupchat [ID]` | Belirtilen grup ID'si için ortak hafıza modunu aç/kapat. |
| `!groupchat list` | Ortak hafıza modu açık olan tüm grupları listeler. |
| `!debugchat` | Bu sohbeti debug kanalı olarak ayarlar. |

</details>

<details>
<summary><b>Bilgi ve Yardım</b></summary>

| Komut | Açıklama |
|---|---|
| `!info` | Genel durum özetini gösterir. |
| `!info chat` | Bu sohbetin detaylarını gösterir. |
| `!info ai` | AI ve rate limit ayarlarını gösterir. |
| `!info system` | Sistem, prefix ve whitelist bilgilerini gösterir. |
| `!help` | Bu yardım menüsünü gösterir. |
| `!helplang tr` / `!helplang en` | Yardım dilini değiştirir. |

</details>

> 💡 Herhangi bir komutu argümansız çalıştırarak kullanım talimatını görebilirsiniz, örn. `!admin`, `!prefix`, `!ratelimit`.

---

## Varsayılan Yapılandırma

<details>
<summary><b>Yapılandırma Detayları</b></summary>

| Değişken | Varsayılan Değer |
|---|---|
| Ana Prefix | `.` |
| Debug Prefix | `!` |
| Yoksayma Prefix | `/` |
| AI Model | sabit bir varsayılan yok — çektiğiniz herhangi bir Ollama modelini seçebilirsiniz (sohbet bazlı ya da global, `!model` veya NeRoChAt ayarlarıyla) |
| Sistem Promptu | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Yardım Dili | `en` (İngilizce) |
| AI Chat | **Kapalı** — `!aichat` ya da uygulamanın AI Bot anahtarıyla açın |
| Whitelist Kontrolü | Kapalı |
| Sabit Sohbet | Kapalı |
| Hız Sınırlama | Açık (3 burst token, 15s'de 1 yenileme) |
| Reply Mode | Açık |
| Görsel / Dosya Okuma | Açık |
| Debug Kanal | Yok |

</details>

---

## Sık Karşılaşılan Sorunlar

<details>
<summary><b>Kaynak koddan derlerken: npm install Puppeteer/Chrome hatası veriyor</b></summary>

whatsapp-web.js, Puppeteer'a bağımlı — o da sadece `npm install`'ın başarılı olması için kullanıcı klasörünüzde bir Chrome kopyası önbelleğe alıyor (NeRoBoT onu aslında hiç başlatmıyor — bunun yerine Electron'un kendi tarayıcı motoruna bağlanıyor). Bu önbellek bozulursa (klasör var ama içindeki çalıştırılabilir dosya eksikse) `npm install` hata verir. Önbelleği silip `npm install` komutunu tekrar çalıştırın:

- **Windows:** `%USERPROFILE%\.cache\puppeteer` klasörünü silin
- **Linux / macOS:** `~/.cache/puppeteer` klasörünü silin

</details>

<details>
<summary><b>ECONNREFUSED 127.0.0.1:11434</b></summary>

Ollama çalışmıyor. Terminalde `ollama serve` komutunu çalıştırın, ya da NeRoChAt/AI Bot anahtarının onu sizin için başlatmasına izin verin.

</details>

<details>
<summary><b>QR kodu gelmiyor</b></summary>

Log panelini açın (üst çubuktaki "Loglar" düğmesi) ve hata mesajı olup olmadığına bakın. Uygulamanın başka bir kopyasının zaten açık olmadığından emin olun.

</details>

<details>
<summary><b>Mesajlara cevap vermiyor</b></summary>

- O profil için AI Chat açık mı? → `!aichat`
- Whitelist kontrolü açık ve siz listede değil misiniz? → `!whitelist add`
- Kara listede misiniz? → `!blacklist remove`
- Sabit sohbet modu açık ve siz o sohbette değil misiniz? → `!fixedchat`
- Hız limitine mi girdiniz? → `!ratelimit`

</details>

<details>
<summary><b>Bir profil sürekli QR istiyor</b></summary>

Her profilin girişi, uygulamanın kullanıcı verisi klasörü (`%APPDATA%/nerobot`) altında kendi izole Electron oturumunda saklanır. Bu klasör silindiyse veya cihazı telefonunuzdan çıkardıysanız, o profil için QR kodunu yeniden okutmanız gerekir.

</details>

<details>
<summary><b>Uygulama kendini güncellemedi</b></summary>

Güncelleme kontrolü internet gerektirir ve pencere açılmadan önce (kısa bir zaman aşımıyla) çalışır — GitHub'a zamanında ulaşamazsa mevcut sürümü açar ve bir sonraki açılışta tekrar dener. İstediğiniz zaman en son sürümü [GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases)'ten elle de indirebilirsiniz.

</details>

---

## Güvenlik Notları

> Bu uygulama gerçek WhatsApp/Telegram hesaplarına bağlanır. Dikkat edilmesi gerekenler:

<details>
<summary><b>Detaylar</b></summary>

- Her profilin beyaz liste/kara liste/admin/ayarları ve kaydedilmiş Telegram girişleri `Documents/NeRoBoT/NeRoBoT_db` altında yaşar — bu klasörü hiçbir yere yüklemeyin.
- Botu tamamen anonim olmayan gruplarda kullanmayın.
- Admin yapılan herkes o profildeki bot genelindeki ayarları değiştirebilir — admin yetkisini sadece güvendiğiniz kişilere verin.

</details>

---

## Lisans

Bu proje kişisel kullanım içindir. Lütfen WhatsApp'ın [Hizmet Şartları](https://www.whatsapp.com/legal/terms-of-service)'na ve Telegram'ın [Hizmet Şartları](https://telegram.org/tos)'na uygun şekilde kullanın.

---

## Teşekkürler

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js/)
- [teleproto](https://www.npmjs.com/package/teleproto) (Telegram/MTProto istemcisi)
- [Ollama](https://ollama.com/)
- [Puppeteer](https://pptr.dev/)
- [Electron](https://www.electronjs.org/) / [electron-builder](https://www.electron.build/) / [electron-updater](https://www.electron.build/auto-update)

---

<p align="center">
  <sub>Made by <b>Salih Yazıtaş</b></sub>
</p>
