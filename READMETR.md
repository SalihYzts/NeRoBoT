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

**NeRoBoT**, [Ollama](https://ollama.com/) ile çalışan yapay zeka modellerini **WhatsApp** üzerinden kullanmanızı sağlayan bir bottur. `whatsapp-web.js` kütüphanesi kullanılarak geliştirilmiştir.

Geliştirici: **TheSalHeLP**

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
- [Komutlar](#komutlar)
- [Varsayılan Yapılandırma](#varsayılan-yapılandırma)
- [Sık Karşılaşılan Sorunlar](#sık-karşılaşılan-sorunlar)
- [Güvenlik Notları](#güvenlik-notları)
- [Lisans](#lisans)

---

## Özellikler

- Masaüstü Uygulaması — Tek pencerelik Electron uygulaması: WhatsApp Web, bot konsol logları ve tam ayar paneli (genel, sohbet bazlı ve liste yönetimi) hepsi bir arada
- Kalıcı Oturum — QR kodu bir kez okutun; oturum yeniden başlatmalarda korunur
- Yerel YZ Desteği — Ollama üzerinden istediğiniz modeli (görsel destekli modeller dahil) kullanın
- Sohbet Hafızası — Her sohbet/kullanıcı için ayrı bağlam, isteğe bağlı ortak hafızalı grup modu
- Görsel & Dosya Okuma — Görselleri (vision), PDF, Word ve düz metin/kod dosyalarını okuyup modele aktarır
- Beyaz Liste Sistemi — İstemediğiniz kişilerin botu kullanmasını engelleyin
- Admin Paneli — Sadece yetkili kişiler yönetim komutlarını kullanabilir; geri alınamaz işlemler onay gerektirir
- Kişilik (Personality) — Botun sistem mesajını global veya sohbet bazında değiştirin
- Özelleştirilebilir Prefix'ler — Ana, debug ve yoksayma prefix'leri ayrı ayrı ayarlanabilir
- No-Prefix Modu — Bir sohbette prefix kullanmadan her mesaja yanıt verilmesini sağlayın
- Sabit Sohbet Modu — Botu tek bir sohbete kilitleyin
- Hız Sınırlama — Spam/kötüye kullanımı önlemek için kullanıcı bazlı token-bucket limiter
- Debug Kanalı — Hataları ve yeni mesaj bildirimlerini ayrı bir sohbete yönlendirin
- Bilgi Komutu — Tüm sistem durumunu tek mesajda görün
- İki Dilli Yardım — Yardım menüsü Türkçe ve İngilizce olarak mevcut

---

## Gereksinimler

Başlamadan önce şunların kurulu olduğundan emin olun:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Ollama** (güncel)
- **İşletim Sistemi:** Windows / Linux / macOS

> Chrome **gerekmez** — uygulama kendi tarayıcı motoruyla (Electron) gelir.

---

## Proje Yapısı

```
nerobot/
├── package.json
├── NeRoBoT_App.bat                 # Masaüstü uygulamasını başlatır (Windows)
├── app/
│   ├── main.js                     # Electron ana süreç — pencere, gömülü WhatsApp Web, IPC
│   ├── preload.cjs                 # Arayüz köprüsü
│   └── ui/index.html               # Üst çubuk, log paneli, ayar paneli
├── project_scripts/
│   ├── bot.js                      # WhatsApp istemcisi & mesaj yönlendirme
│   ├── ai.js                       # Ollama entegrasyonu
│   ├── config.js                   # Durum, ayar kalıcılığı, dosya yolları
│   ├── commands.js                 # Tüm !komutlar
│   ├── ratelimit.js                # Token-bucket hız sınırlayıcı
│   └── utils.js                    # Mesaj gönderme yardımcıları
└── NeRoBoT_db/
    ├── ascii.txt                   # Başlangıç banner'ı
    ├── help.txt                    # Yardım menüsü metni (TR/EN)
    ├── chatmodels.json             # Sohbet bazlı model ayarları (commit'lenir)
    ├── settings.json               # Çalışma zamanında otomatik oluşur
    ├── whitelist.json              # Çalışma zamanında otomatik oluşur
    ├── admin.json                  # Çalışma zamanında otomatik oluşur
    ├── noprefix.json               # Çalışma zamanında otomatik oluşur
    └── groupchat.json              # Çalışma zamanında otomatik oluşur
```

`NeRoBoT_db/*.json` dosyaları ilk çalıştırmada otomatik olarak oluşturulur ve git'e **commit edilmez** (bkz. `.gitignore`).

---

## Kurulum

### Windows: Installer (önerilen)

[GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases) sayfasından `NeRoBoT-Setup-x.y.z.exe` dosyasını indirip çalıştırın. NeRoBoT normal bir Windows uygulaması olarak kurulur (Start Menu kısayolu, Windows arama kutusundan bulunabilir, "Program Ekle/Kaldır"da kendi uninstaller'ıyla listelenir) — `git clone`/`npm install` gerekmez. [Ollama](https://ollama.com/) kurulu değilse installer onu da sessizce indirip kurmaya çalışır; bu adım atlanır veya başarısız olursa (örn. kurulum sırasında internet yoksa) NeRoBoT, AI Bot'u ilk açtığınızda kurulumu tekrar teklif eder.

### Kaynak koddan çalıştırma (tüm platformlar / geliştirme)

### 1. Depoyu Klonlayın

```bash
git clone https://github.com/SalihYzts/NeRoBoT.git
cd nerobot
```

### 2. Bağımlılıkları Kurun

```bash
npm install
```



### 3. Ollama'yı Kurun ve Bir Model İndirin

[Ollama](https://ollama.com/) sitesinden uygulamayı indirip kurun, ardından kullanmak istediğiniz modeli indirin. (Kaynak yerine paketlenmiş Windows installer'ı kullanıyorsanız bu adım sizin için otomatik denenir — yukarıya bakın.)

```bash
ollama pull minimax-m3:cloud
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
```

### 4. Yapılandırma

<details>
<summary><b>Yapılandırma Dosyaları Otomatiktir</b></summary>

`project_scripts/config.js`, ilk çalıştırmada `settings.json`, `whitelist.json`, `admin.json`, `noprefix.json` ve `groupchat.json` dosyalarını otomatik olarak oluşturur. Bunları elle oluşturmanıza gerek yoktur. Çoğu ayar, uygulama içindeki ayar panelinden de değiştirilebilir.

</details>

### 5. Uygulamayı Başlatın

```bash
npm start
```

Windows'ta `NeRoBoT_App.bat` dosyasına çift tıklayarak da açabilirsiniz.

WhatsApp Web, durum çubuğu, konsol log paneli ve ayar panelini içeren tek bir pencere açılır.

### Windows installer'ı oluşturma

```bash
npm run gen-icons   # logo.svg'den app/ui/icon.ico + icon.png'yi yeniden üretir (sadece logo değiştiğinde gerekir)
npm run pack        # hızlı, paketlenmemiş build — test için (dist/win-unpacked/)
npm run dist         # tam NSIS installer, GitHub Release'e yüklemeye hazır (dist/NeRoBoT-Setup-*.exe)
```

### 6. WhatsApp'a Bağlanın

1. Uygulamanın içinde görünen QR kodu telefonunuzla okutun
2. WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla

Bunu sadece bir kez yapmanız gerekir — oturum kaydedilir ve sonraki açılışta geri yüklenir.

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
<summary><b>Beyaz Liste Yönetimi</b></summary>

| Komut | Açıklama |
|---|---|
| `!whitelist` / `!whitelist list` | Beyaz listedeki sohbetleri gösterir. |
| `!whitelist add [ID]` | Beyaz listeye ekler. |
| `!whitelist remove [ID]` | Beyaz listeden çıkarır. |
| `!whitelist reset` | Beyaz listeyi tamamen temizler. *(Onay gerekir.)* |
| `!whitelist control` | Yeni sohbet kontrolünü aç/kapat. |

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
| `!media` | Görsel/dosya okuma durumunu gösterir. |
| `!media image` | Görsel okumayı (vision) aç/kapat. |
| `!media file` | Dosya okumayı (PDF, Word, TXT, JSON, JS...) aç/kapat. |
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
<summary><b>Hafıza</b></summary>

| Komut | Açıklama |
|---|---|
| `!clear` | Bu sohbetin hafızasını temizler. |
| `!clear <ID>` | Belirtilen sohbetin hafızasını temizler. |
| `!clear all` | Tüm sohbetlerin hafızasını temizler. *(Onay gerekir.)* |

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
| AI Model | `minimax-m3:cloud` |
| Sistem Promptu | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Yardım Dili | `en` (İngilizce) |
| AI Chat | Açık |
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
<summary><b>npm install Puppeteer/Chrome hatası veriyor</b></summary>

Puppeteer, Chrome'un bir kopyasını kullanıcı klasörünüzde önbelleğe alır. Bu önbellek bozulursa (klasör var ama içindeki `chrome.exe` eksikse) `npm install` hata verir. Önbelleği silip `npm install` komutunu tekrar çalıştırın:

- **Windows:** `C:\Users\<kullanıcı adınız>\.cache\puppeteer` klasörünü silin
- **Linux / macOS:** `~/.cache/puppeteer` klasörünü silin

</details>

<details>
<summary><b>ECONNREFUSED 127.0.0.1:11434</b></summary>

Ollama çalışmıyor. Terminalde `ollama serve` komutunu çalıştırın veya Ollama uygulamasını açın.

</details>

<details>
<summary><b>QR kodu gelmiyor</b></summary>

Log panelini açın (üst çubuktaki "Loglar" düğmesi) ve hata mesajı olup olmadığına bakın. Uygulamanın başka bir kopyasının zaten açık olmadığından emin olun.

</details>

<details>
<summary><b>Mesajlara cevap vermiyor</b></summary>

- AI Chat açık mı? → `!aichat`
- Whitelist kontrolü açık ve siz ekli değil misiniz? → `!whitelist add`
- Sabit sohbet modu açık ve siz o sohbette değil misiniz? → `!fixedchat`
- Hız limitine mi girdiniz? → `!ratelimit`

</details>

<details>
<summary><b>Bot sürekli QR istiyor</b></summary>

Oturum, uygulamanın kullanıcı verisi klasöründe saklanır (Windows'ta `%APPDATA%/nerobot`). Bu klasör silindiyse veya cihazı telefonunuzdan çıkardıysanız QR kodu yeniden okutmanız gerekir.

</details>

---

## Güvenlik Notları

> Bu bot kişisel bir WhatsApp hesabı kullanır. Dikkat edilmesi gerekenler:

<details>
<summary><b>Detaylar</b></summary>

- Otomatik oluşan `project_scripts/whitelist.json`, `project_scripts/admin.json`, `project_scripts/settings.json`, `project_scripts/noprefix.json` ve `project_scripts/groupchat.json` dosyalarını **asla** GitHub'a yüklemeyin — bunlar `.gitignore` ile zaten hariç tutulmuştur.
- Botu tamamen anonim olmayan gruplarda kullanmayın.
- Admin yapılan herkes bot genelindeki ayarları değiştirebilir — admin yetkisini sadece güvendiğiniz kişilere verin.

</details>

---

## Lisans

Bu proje kişisel kullanım içindir. Lütfen WhatsApp'ın [Hizmet Şartları](https://www.whatsapp.com/legal/terms-of-service)'na uygun şekilde kullanın.

---

## Teşekkürler

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js/)
- [Ollama](https://ollama.com/)
- [Puppeteer](https://pptr.dev/)
- [Electron](https://www.electronjs.org/)

---

<p align="center">
  <sub>Made by <b>Salih Yazıtaş</b></sub>
</p>
