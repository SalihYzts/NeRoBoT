// Davet (toplu gönderim) çekirdeği — numara ayrıştırma, mesaj kişiselleştirme
// ve gönderim hızı hesabı.
//
// Bu dosya BİLİNÇLİ olarak hiçbir şey import etmez: ne whatsapp-web.js, ne
// Electron, ne dosya sistemi. Böylece buradaki mantık uygulamayı hiç açmadan
// `npm test` ile kanıtlanabiliyor (bkz. test/broadcast.test.js). Gerçek
// gönderim döngüsü app/main.js'te (runBroadcast) — oraya oturan şey oturum/
// client gerektirdiği için ayrı tutuldu.
//
// ÖNEMLİ — bu araç ne İÇİN var: bir forma kendi numarasını yazıp "katılmak
// istiyorum" demiş insanlara TEK bir davet mesajı göndermek. İzin vermemiş
// numaralara gönderim hem WhatsApp'ın kullanım şartlarını ihlal eder (hesap
// kalıcı olarak kapatılır) hem de ticari/tanıtım içeriği söz konusuysa
// Türkiye'de KVKK ve İYS kapsamında idari para cezası doğurur. Aşağıdaki hız
// tabanı (MIN_DELAY_FLOOR_MS) ve üst sınır (MAX_RECIPIENTS) bu yüzden ayar
// değil, kod seviyesinde sabit.

// Tek seferde gönderilebilecek en fazla alıcı. Bir kulüp/topluluk daveti için
// fazlasıyla yeterli; daha büyük listeler zaten bu aracın işi değil (resmi
// WhatsApp Business Platform'un onaylı şablon mesajları o iş için var).
export const MAX_RECIPIENTS = 1000;

// İki gönderim arasındaki en kısa bekleme. Ayarlardan düşürülemez — aracın
// "hızlandırılarak" spam makinesine çevrilmesini engelliyor.
export const MIN_DELAY_FLOOR_MS = 3000;

// Varsayılan gönderim ritmi: mesaj başına 8–20 sn rastgele, her 20 mesajda
// 2 dakika mola. Sabit aralık (her mesaj tam 10 sn) WhatsApp'ın otomasyon
// tespitinin en kolay yakaladığı desen olduğu için aralık rastgele.
export const DEFAULT_PACING = {
    minMs: 8_000,
    maxMs: 20_000,
    batchSize: 20,
    batchPauseMs: 120_000,
};

// Türkiye'de WhatsApp yalnızca mobil (5XX) hatlarda var.
const TR_COUNTRY = '90';
const TR_NATIONAL_LEN = 10;
const TR_MOBILE_FIRST = '5';

// Yurt dışı numaraları için makul E.164 sınırları.
const INTL_MIN_LEN = 8;
const INTL_MAX_LEN = 15;

// Bir satır/alanın "numara yazma denemesi" sayılması için gereken en az rakam.
// Altında kalanlar (başlık satırı, isim sütunu, serbest metin) sessizce
// atlanır — kullanıcıya "geçersiz numara" diye gösterilmez.
const MIN_PHONE_DIGITS = 5;

// Yapıştırılan metinde numaranın içine karışan her şey: boşluk çeşitleri
// (\s zaten NBSP ve narrow NBSP'yi kapsıyor), sıfır genişlikli ve yön
// değiştirme işaretleri (Excel/Forms kopyalarında sık), parantez, nokta,
// eğik çizgi ve tipografik tireler.
const SEPARATORS = /[\s​-‏‪-‮()./\-‐-―]/g;

// CSV/TSV sütun ayırıcıları.
const FIELD_SPLIT = /[,;\t|]/;

function digitCount(text) {
    const m = String(text).match(/\d/g);
    return m ? m.length : 0;
}

// Tek bir numarayı E.164'e indirir. Dönen `reason` kullanıcıya neden
// atlandığını söylemek için: empty | invalid_chars | too_short | too_long |
// not_mobile.
export function normalizePhone(raw, { defaultCountry = TR_COUNTRY } = {}) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };

    let s = trimmed.replace(SEPARATORS, '');
    if (!s) return { ok: false, reason: 'empty' };

    // Uluslararası yazım işareti: ya "+" ya da "00". İkisi de "ülke kodu
    // zaten yazılmış" demek — bu durumda varsayılan ülkeyi EKLEMEMEK şart,
    // yoksa yurt dışından katılan biri 90'la başlayan hatalı bir numaraya
    // dönüşür.
    let intl = false;
    if (s.startsWith('+')) {
        intl = true;
        s = s.slice(1);
    } else if (s.startsWith('00')) {
        intl = true;
        s = s.slice(2);
    }

    if (!s) return { ok: false, reason: 'empty' };
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'invalid_chars' };

    const full = defaultCountry.length + TR_NATIONAL_LEN;
    let e164;
    if (intl) {
        e164 = s;
    } else if (s.startsWith('0')) {
        const rest = s.slice(1);
        // "0905551234567" gibi ikili yazım — baştaki 0 şehir içi (trunk)
        // öneki, arkasından ülke kodu gelmişse onu ülke kodu olarak kabul et.
        e164 = (rest.startsWith(defaultCountry) && rest.length === full)
            ? rest
            : defaultCountry + rest;
    } else if (s.startsWith(defaultCountry) && s.length === full) {
        // "905551234567" — + işareti olmadan ülke kodlu yazım. Türkiye'de
        // mobil numaralar 5 ile başladığı için bunu "90 ile başlayan yerel
        // numara" sanma riski yok.
        e164 = s;
    } else {
        e164 = defaultCountry + s;
    }

    if (e164.startsWith(TR_COUNTRY)) {
        const national = e164.slice(TR_COUNTRY.length);
        if (national.length < TR_NATIONAL_LEN) return { ok: false, reason: 'too_short' };
        if (national.length > TR_NATIONAL_LEN) return { ok: false, reason: 'too_long' };
        if (!national.startsWith(TR_MOBILE_FIRST)) return { ok: false, reason: 'not_mobile' };
    } else {
        if (e164.length < INTL_MIN_LEN) return { ok: false, reason: 'too_short' };
        if (e164.length > INTL_MAX_LEN) return { ok: false, reason: 'too_long' };
    }

    return { ok: true, e164, chatId: `${e164}@c.us`, display: `+${e164}` };
}

// Telegram kullanıcı adı: "@ad", "t.me/ad" ya da "https://t.me/ad".
// Telegram'ın kuralı: 5-32 karakter, harf ile başlar, harf/rakam/_.
const TG_USERNAME = /^(?:@|(?:https?:\/\/)?t(?:elegram)?\.me\/)([a-z][a-z0-9_]{4,31})$/i;

// Tek bir Telegram kullanıcı adını normalleştirir. Kayıt anahtarı (e164
// alanı) küçük harfli "@ad" — Telegram kullanıcı adları büyük/küçük harf
// duyarsız, yani "@Ahmet" ile "@ahmet" aynı kişi.
export function normalizeUsername(raw) {
    const m = String(raw ?? '').trim().match(TG_USERNAME);
    if (!m) return { ok: false, reason: 'invalid_chars' };
    const handle = `@${m[1].toLowerCase()}`;
    return { ok: true, e164: handle, chatId: handle, display: `@${m[1]}`, username: true };
}

// Bir satırdaki alanlardan numarayı ve (varsa) ismi ayıklar.
function parseLine(line, opts) {
    // Telegram listelerinde numara yerine kullanıcı adı da olabilir.
    const asAddress = f => {
        if (opts.allowUsernames) {
            const u = normalizeUsername(f);
            if (u.ok) return u;
        }
        return normalizePhone(f, opts);
    };
    const fields = line.split(FIELD_SPLIT).map(f => f.trim()).filter(Boolean);

    if (fields.length > 1) {
        const phoneIndex = fields.findIndex(f => asAddress(f).ok);
        if (phoneIndex !== -1) {
            // İsim = numara olmayan, e-posta olmayan ilk alan. Böylece
            // "Ad,e-posta,telefon" düzeninde e-posta isim sanılmıyor.
            const label = fields.find((f, i) =>
                i !== phoneIndex && !f.includes('@') && digitCount(f) < MIN_PHONE_DIGITS
            ) || '';
            return { phone: asAddress(fields[phoneIndex]), raw: fields[phoneIndex], label };
        }
        // Hiçbir alan numaraya dönüşmedi. Rakam içeren bir alan varsa bu bir
        // bozuk numaradır (bildir); yoksa başlık satırıdır (sessizce atla).
        const attempted = fields.find(f => digitCount(f) >= MIN_PHONE_DIGITS);
        return attempted
            ? { phone: normalizePhone(attempted, opts), raw: attempted, label: '' }
            : null;
    }

    // Tek alan. Önce satırın bütünü denenir — "+90 555 123 45 67" boşluklu
    // tek bir numaradır.
    const whole = asAddress(line);
    if (whole.ok) return { phone: whole, raw: line, label: '' };

    // Olmadıysa: "05551234567 05551234568 ..." gibi tek satıra boşlukla
    // dizilmiş olabilir. Hepsi birden numaraya dönüşüyorsa öyle kabul et.
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
        const parsed = tokens.map(tok => ({ phone: asAddress(tok), raw: tok, label: '' }));
        if (parsed.every(p => p.phone.ok)) return parsed;
        // "Ahmet Yılmaz @ahmet" — isim + kullanıcı adı, boşlukla.
        if (opts.allowUsernames) {
            const idx = parsed.findIndex(p => p.phone.ok && p.phone.username);
            if (idx !== -1 && parsed.filter(p => p.phone.ok).length === 1) {
                const label = tokens.filter((_, i) => i !== idx).join(' ');
                return { phone: parsed[idx].phone, raw: tokens[idx], label: digitCount(label) < MIN_PHONE_DIGITS ? label : '' };
            }
        }
    }

    // Gerçekten bozuk. Rakam içeriyorsa bildir, içermiyorsa serbest metindir.
    return digitCount(line) >= MIN_PHONE_DIGITS
        ? { phone: whole, raw: line, label: '' }
        : null;
}

// Yapıştırılmış listeyi ayrıştırır. Dönen:
//   recipients — gönderilecek, tekrarsız alıcılar ({ e164, chatId, display, label, raw })
//   invalid    — atlanan satırlar ({ raw, reason })
//   duplicates — listede birden fazla geçen numaralar ({ raw, e164 })
//   truncated  — üst sınır yüzünden kesilen alıcı sayısı
// allowUsernames: Telegram profilleri için — "@ad"/t.me/ad satırları da alıcı
// olur (WhatsApp'ta kullanıcı adı diye bir şey yok, orada kapalı).
export function parseRecipients(text, { defaultCountry = TR_COUNTRY, max = MAX_RECIPIENTS, allowUsernames = false } = {}) {
    const opts = { defaultCountry, allowUsernames };
    const recipients = [];
    const invalid = [];
    const duplicates = [];
    const seen = new Map(); // e164 → recipients içindeki kayıt
    let truncated = 0;

    for (const rawLine of String(text ?? '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const parsed = parseLine(line, opts);
        if (!parsed) continue;

        for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
            if (!entry.phone.ok) {
                // Bozuk satırı kullanıcının yazdığı HALİYLE göster — ayıklanmış
                // alanı değil — ki listesinde arayıp bulabilsin.
                invalid.push({ raw: Array.isArray(parsed) ? entry.raw : line, reason: entry.phone.reason });
                continue;
            }

            const { e164, chatId, display, username } = entry.phone;
            const existing = seen.get(e164);
            if (existing) {
                // Aynı kişiye iki mesaj gitmesin. İlk kayıtta isim yoksa
                // tekrardan gelen ismi yine de kullan.
                if (!existing.label && entry.label) existing.label = entry.label;
                duplicates.push({ raw: entry.raw, e164 });
                continue;
            }

            if (recipients.length >= max) {
                truncated++;
                continue;
            }

            const record = { e164, chatId, display, label: entry.label, raw: entry.raw, ...(username ? { username: true } : {}) };
            recipients.push(record);
            seen.set(e164, record);
        }
    }

    return { recipients, invalid, duplicates, truncated };
}

// {isim} / {ad} / {name} yer tutucularını doldurur. İsmi olmayan kayıtlarda
// yer tutucu silinir ve cümle toparlanır — "Merhaba , kulübe hoş geldin!"
// gibi bir şey gitmesin.
export function applyTemplate(message, recipient = {}) {
    const label = String(recipient.label ?? '').trim();
    const filled = String(message ?? '').replace(/\{\s*(isim|ad|name)\s*\}/gi, label);
    if (label) return filled;
    return filled
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

// Gönderim hangi sohbet id'sine yapılacak?
//
// GERÇEK BİR HATANIN DERSİ — bu fonksiyonun tek varlık sebebi:
// client.getNumberId() modern WhatsApp'ta bir @lid id'si döndürüyor
// (ör. 276746905587891@lid). Gönderim adresi olarak ONU kullanmak yalnızca
// o sohbet YEREL OLARAK ZATEN VARSA çalışıyor. Hiç yazılmamış bir kişide
// WhatsApp Web sadece LID'den sohbet oluşturamıyor ve şunu fırlatıyor:
//   "Data passed to getter must include an id property
//    (it's how we memoize) but got undefined"
// Yani araç tam da asıl işinde — ilk kez yazılan kişilerde — çöküyordu.
//
// Telefon formu (@c.us) verildiğinde WhatsApp eşlemeyi kendisi yapıyor:
// var olan @lid sohbetini buluyor, yoksa oluşturuyor. Bu yüzden doğrulama
// sonucu YALNIZCA "numara WhatsApp'ta var mı" sorusunu cevaplamak için
// kullanılır, adres olarak değil.
//
// Tek istisna: WhatsApp kendi kanonik TELEFON biçimini döndürürse (@c.us)
// ona uymak doğru — numarayı bizden iyi bilir.
export function chatIdForSend(recipient, verifiedId) {
    const v = typeof verifiedId === 'string' ? verifiedId.trim() : '';
    if (/^\d+@c\.us$/.test(v)) return v;
    return recipient.chatId;
}

// Sıradaki mesaj için beklenecek süre. index = kaçıncı mesaj gönderildi
// (0'dan başlar).
export function nextDelayMs(index, pacing = {}) {
    const { minMs, maxMs, batchSize, batchPauseMs } = { ...DEFAULT_PACING, ...pacing };

    const lo = Math.max(MIN_DELAY_FLOOR_MS, Math.floor(minMs) || 0);
    const hi = Math.max(lo, Math.floor(maxMs) || 0);
    const jitter = lo + Math.floor(Math.random() * (hi - lo + 1));

    // Parti sonu molası: 20 mesaj art arda gitmek, 20 mesaj gidip 2 dakika
    // durmaktan çok daha fazla dikkat çeker.
    if (batchSize > 0 && (index + 1) % batchSize === 0) {
        return Math.max(jitter, Math.floor(batchPauseMs) || 0);
    }
    return jitter;
}
