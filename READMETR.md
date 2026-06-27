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
To access the English README file
## Documentation
- [English README](README.md)
- To access the English README file
---

## İçindekiler

- [Özellikler](#özellikler)
- [Gereksinimler](#gereksinimler)
- [Kurulum](#kurulum)
- [Komutlar](#komutlar)
- [Varsayılan Yapılandırma](#varsayılan-yapılandırma)
- [Sık Karşılaşılan Sorunlar](#sık-karşılaşılan-sorunlar)
- [Güvenlik Notları](#güvenlik-notları)
- [Lisans](#lisans)

---

## Özellikler

- Yerel YZ Desteği — Ollama üzerinden istediğin modeli kullanın
- Sohbet Hafızası — Her sohbet için ayrı bağlam (ID tabanlı)
- Whitelist Sistemi — İstemediğiniz kişilerin botu kullanmasını engelleyin
- Admin Paneli — Sadece yetkili kişiler yönetim komutlarını kullanabilir
- Kişilik (Personality) — Botun sistem mesajını değiştirin
- Özelleştirilebilir Prefix'ler — Hem normal hem debug prefix ayarlanabilir
- Sabit Sohbet Modu — Botu tek bir sohbete kilitleyin
- Debug Kanalı — Yeni mesajları ayrı bir sohbete bildirin
- Bilgi Komutu — Tüm sistem durumunu tek mesajda görün

---

## Gereksinimler

Başlamadan önce şunların kurulu olduğundan emin olun:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Ollama** (güncel)
- **Google Chrome** (güncel)
- **İşletim Sistemi:** Windows / Linux / macOS

---

## Kurulum

### 1. Depoyu Klonlayın

```bash
git clone https://github.com/kullanici/nerobot.git
cd nerobot
```

### 2. Bağımlılıkları Kurun

```bash
npm install
```

### 3. Ollama'yı Kurun ve Bir Model İndirin

[Ollama](https://ollama.com/) sitesinden uygulamayı indirip kurun, ardından kullanmak istediğiniz modeli indirin:

```bash
ollama pull minimax-m3:cloud
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
```

### 4. Yapılandırma

<details>
<summary><b>Chrome Yolu Ayarı (Windows)</b></summary>

Kod içinde `PUPPETEER_EXECUTABLE_PATH` kısmını kendi sisteminize göre ayarlayın:

javascript
process.env.PUPPETEER_EXECUTABLE_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";


Linux/Mac kullanıyorsanız bu satırı yorum satırı yapabilir veya silebilirsiniz.

</details>

<details>
<summary><b>Boş Yapılandırma Dosyaları</b></summary>

Kod otomatik olarak oluşturur ama isterseniz kendiniz de oluşturabilirsiniz:

```bash
echo "[]" > whitelist.json
echo "[]" > admin.json
```

</details>

### 5. Botu Başlatın

```bash
node NeRoBoT.js
```

> **Not:** Chrome penceresi görünür olarak açılacak (`headless: false`). QR kodu terminalde görünecek.

### 6. WhatsApp'a Başlanın

1. Terminalde çıkan QR kodu telefonunuzla okutun
2. WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla

---

## Komutlar

<details>
<summary><b>Yönetim Komutları</b></summary>

| Komut | Açıklama |
|---|---|
| `!adminadd [ID]` | Sohbeti veya belirtilen ID'yi admin listesine ekler. |
| `!adminremove [ID]` | Sohbeti veya belirtilen ID'yi admin listesinden siler. |
| `!adminlist` | Tüm adminleri listeler. |
| `!adminreset` | Admin listesini tamamen temizler. |

</details>

<details>
<summary><b>Beyaz Liste Komutları</b></summary>

| Komut | Açıklama |
|---|---|
| `!whitelistadd [ID]` | Sohbeti veya belirtilen ID'yi beyaz listeye ekler. |
| `!whitelistremove [ID]` | Sohbeti veya belirtilen ID'yi beyaz listeden siler. |
| `!whitelist` | Beyaz listedeki sohbetleri gösterir. |
| `!whitelistreset` | Beyaz listeyi tamamen temizler. |
| `!whitelistcontrol` | Yeni sohbet kontrolünü aç/kapat. |

</details>

<details>
<summary><b>Sistem Ayarları</b></summary>

| Komut | Açıklama |
|---|---|
| `!prefix [yeniPrefix]` | Normal komut prefix'ini değiştirir. |
| `!debugprefix [yeniDebug]` | Debug komut prefix'ini değiştirir. |
| `!fixedchat` | Botu sadece bulunduğun sohbette çalışacak şekilde sabitler veya serbest bırakır. |
| `!debugchat` | Sohbeti debug kanalı olarak kaydeder. |

</details>

<details>
<summary><b>AI Yönetimi</b></summary>

| Komut | Açıklama |
|---|---|
| `!aichat` | AI sohbeti açar/kapatır. |
| `!personality [prompt]` | Botun kişilik promptunu gösterir veya günceller. |
| `!model [isim]` | AI modelini değiştirir veya mevcut modeli gösterir. |
| `!clear [ID]` | Sohbetin hafızasını temizler. |
| `!clearall` | Tüm sohbetlerin hafızasını temizler. |

</details>

<details>
<summary><b>Bilgi ve Yardım</b></summary>

| Komut | Açıklama |
|---|---|
| `!info` | Sistem ve sohbet durumunu gösterir (prefix, AI durumu, admin/beyaz liste sayısı vb.). |
| `!help` | Bu yardım menüsünü gösterir. |
| `!helplanguage tr/en` | Yardım dilini değiştirir. |

</details>

---

## Varsayılan Yapılandırma

<details>
<summary><b>Yapılandırma Detayları</b></summary>

| Değişken | Varsayılan Değer |
|---|---|
| Normal Prefix | `.` |
| Debug Prefix | `!` |
| AI Model | `minimax-m3:cloud` |
| Sistem Promptu | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Yardım Dili | `en` (İngilizce) |
| AI Chat | Enabled |
| Whitelist Kontrolü | Disabled |
| Sabit Sohbet | Disabled |
| Debug Kanal | None |

</details>

---

## Sık Karşılaşılan Sorunlar

<details>
<summary><b>Chrome not found hatası</b></summary>

`PUPPETEER_EXECUTABLE_PATH` yolunu kontrol edin. Linux'ta `/usr/bin/google-chrome`, macOS'ta `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` olabilir.

</details>

<details>
<summary><b>ECONNREFUSED 127.0.0.1:11434</b></summary>

Ollama çalışmıyor. Terminalde `ollama serve` komutunu çalıştırın veya Ollama uygulamasını açın.

</details>

<details>
<summary><b>QR kodu gelmiyor</b></summary>

Terminal çıktısını kontrol edin. Bazen QR yerine hata mesajı yazılır. Chrome'un güncel olduğundan emin olun.

</details>

<details>
<summary><b>Mesajlara cevap vermiyor</b></summary>

- AI Chat açık mı? → `!aichat`
- Whitelist kontrolü açık ve siz ekli değil misiniz? → `!whitelistadd`
- Sabit sohbet modu açık ve siz o sohbette değil misiniz? → `!fixedchat`

</details>

<details>
<summary><b>Bot sürekli QR istiyor</b></summary>

`.wwebjs_auth/` klasörü silinmiş olabilir. Bu klasörü yedekleyin (commit etmeyin ama yerel olarak saklayın).

</details>

---

## Güvenlik Notları

> Bu bot kişisel bir WhatsApp hesabı kullanır. Dikkat edilmesi gerekenler:

<details>
<summary><b>Detaylar</b></summary>

- `whitelist.json` ve `admin.json` dosyalarını **asla** GitHub'a yüklemeyin
- Botu tamamen anonim olmayan gruplarda kullanmayın

</details>

---

## Lisans

Bu proje kişisel kullanım içindir. Lütfen WhatsApp'ın [Hizmet Şartları](https://www.whatsapp.com/legal/terms-of-service)'na uygun şekilde kullanın.

---

## Teşekkürler

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js/)
- [Ollama](https://ollama.com/)
- [Puppeteer](https://pptr.dev/)
- [qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal)

---

<p align="center">
  <sub>Made by <b>Salih Yazıtaş</b></sub>
</p>
