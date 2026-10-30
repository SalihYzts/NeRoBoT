// Davet (toplu gönderim) çekirdeğinin birim testleri — ağ, WhatsApp ya da
// Electron gerektirmez. src/broadcast.js bilinçli olarak saf tutuldu
// (hiçbir şey import etmez) ki numara ayrıştırma mantığı buradan, uygulamayı
// hiç açmadan kanıtlanabilsin.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizePhone,
    normalizeUsername,
    parseRecipients,
    applyTemplate,
    nextDelayMs,
    chatIdForSend,
    MIN_DELAY_FLOOR_MS,
    MAX_RECIPIENTS,
} from '../src/broadcast.js';

describe('normalizePhone — tek numara normalleştirme', () => {
    // Formun topladığı listede aynı kişi beş farklı şekilde yazılmış olabilir;
    // hepsi tek bir E.164 numarasına inmek ZORUNDA, yoksa aynı kişiye iki
    // mesaj gider.
    test('aynı numaranın bütün yazımları tek sonuca iner', () => {
        const beklenen = '905551234567';
        for (const girdi of [
            '5551234567',
            '05551234567',
            '905551234567',
            '+905551234567',
            '0090 555 123 45 67',
            '+90 555 123 45 67',
            '+90 (555) 123-45-67',
            '0 555 123 45 67',
            '555 123 45 67',
            '+90-555-123-45-67',
            '  +90 555 123 45 67  ',
            '0555.123.45.67',
        ]) {
            const sonuc = normalizePhone(girdi);
            assert.equal(sonuc.ok, true, `başarısız girdi: ${girdi} (${sonuc.reason})`);
            assert.equal(sonuc.e164, beklenen, `yanlış sonuç: ${girdi}`);
            assert.equal(sonuc.chatId, `${beklenen}@c.us`);
        }
    });

    test('Türkçe karakterli/görünmez boşluklu yapıştırmalar da temizlenir', () => {
        // Google Forms/Excel kopyalarında sık görülen daraltılmamış boşluklar
        // (NBSP, narrow NBSP) ve tipografik tireler.
        assert.equal(normalizePhone('+90 555 123 45 67').e164, '905551234567');
        assert.equal(normalizePhone('0555–123–45–67').e164, '905551234567');
        assert.equal(normalizePhone('‪+90 555 123 45 67‬').e164, '905551234567');
    });

    test('sabit hat ve geçersiz uzunluklar reddedilir', () => {
        // Türkiye'de WhatsApp yalnızca 5XX mobil hatlarda var — sabit hatta
        // gönderim denemesi boşa gider, listeden ayıklanması daha iyi.
        assert.equal(normalizePhone('02121234567').ok, false);
        assert.equal(normalizePhone('02121234567').reason, 'not_mobile');
        assert.equal(normalizePhone('0555123456').reason, 'too_short');
        assert.equal(normalizePhone('05551234567890').reason, 'too_long');
        assert.equal(normalizePhone('').reason, 'empty');
        assert.equal(normalizePhone('   ').reason, 'empty');
        assert.equal(normalizePhone('merhaba').reason, 'invalid_chars');
        assert.equal(normalizePhone('555-ABC-1234').reason, 'invalid_chars');
        assert.equal(normalizePhone(null).reason, 'empty');
        assert.equal(normalizePhone(undefined).reason, 'empty');
    });

    test('yurt dışı numaraları + ile verildiğinde korunur', () => {
        // Kulübe yurt dışından katılan biri olabilir; + ile yazdığı sürece
        // ülke kodunu Türkiye'ye çevirmek YANLIŞ olur.
        assert.equal(normalizePhone('+49 170 1234567').e164, '491701234567');
        assert.equal(normalizePhone('+1 415 555 0132').e164, '14155550132');
        assert.equal(normalizePhone('00447911123456').e164, '447911123456');
    });

    test('ülke kodu seçilebilir', () => {
        assert.equal(normalizePhone('0170 1234567', { defaultCountry: '49' }).e164, '491701234567');
    });
});

describe('parseRecipients — liste ayrıştırma', () => {
    test('karışık düzende yapıştırılmış liste tek biçime iner', () => {
        const liste = `
            5551234567
            0555 123 45 68
            +90 555 123 45 69
            90 555 123 45 70
        `;
        const { recipients, invalid } = parseRecipients(liste);
        assert.equal(invalid.length, 0);
        assert.deepEqual(recipients.map(r => r.e164), [
            '905551234567', '905551234568', '905551234569', '905551234570',
        ]);
    });

    test('aynı numara farklı yazımlarla geçse bile bir kez gönderilir', () => {
        const { recipients, duplicates } = parseRecipients([
            '05551234567',
            '+90 555 123 45 67',
            '5551234567',
            '905551234568',
        ].join('\n'));
        assert.equal(recipients.length, 2);
        assert.equal(duplicates.length, 2);
        // Tekrarlar hangi numaraya denk geldiğiyle birlikte raporlanır, ki
        // kullanıcı listesinde ne olduğunu görebilsin.
        assert.equal(duplicates[0].e164, '905551234567');
    });

    test('virgüllü/sekmeli (CSV) satırlardan numara ve isim ayıklanır', () => {
        const { recipients } = parseRecipients([
            'Ahmet Yılmaz, 0555 123 45 67',
            '+90 555 123 45 68;Ayşe Demir',
            'Mehmet\t5551234569',
            'Zeynep Kaya,zeynep@mail.com,05551234570',
        ].join('\n'));
        assert.equal(recipients.length, 4);
        assert.equal(recipients[0].label, 'Ahmet Yılmaz');
        assert.equal(recipients[1].label, 'Ayşe Demir');
        assert.equal(recipients[2].label, 'Mehmet');
        // E-posta sütunu isim sanılmamalı.
        assert.equal(recipients[3].label, 'Zeynep Kaya');
    });

    test('başlık satırı, boş satır ve # yorumu atlanır', () => {
        const { recipients, invalid } = parseRecipients([
            '# kulüp formu çıktısı',
            'isim,telefon',
            '',
            '   ',
            'Ahmet,05551234567',
        ].join('\n'));
        assert.equal(recipients.length, 1);
        // Başlık satırı "geçersiz numara" olarak kullanıcıyı korkutmamalı.
        assert.equal(invalid.length, 0);
    });

    test('gerçekten bozuk satırlar sebebiyle birlikte raporlanır', () => {
        const { recipients, invalid } = parseRecipients([
            '05551234567',
            '0212 123 45 67',
            '0555 12',
        ].join('\n'));
        assert.equal(recipients.length, 1);
        assert.equal(invalid.length, 2);
        assert.equal(invalid[0].reason, 'not_mobile');
        assert.equal(invalid[0].raw, '0212 123 45 67');
        assert.equal(invalid[1].reason, 'too_short');
    });

    test('tek satıra boşlukla dizilmiş numaralar da ayrılır', () => {
        // "5551234567 5551234568" gibi tek satır yapıştırmalar — boşluk hem
        // numara içinde hem ayırıcı olarak kullanıldığı için ayrı ele alınır.
        const { recipients } = parseRecipients('05551234567 05551234568 05551234569');
        assert.equal(recipients.length, 3);
    });

    test('üst sınırın üstündeki liste kesilir ve bu bildirilir', () => {
        const cok = Array.from({ length: MAX_RECIPIENTS + 5 },
            (_, i) => `555${String(1000000 + i).padStart(7, '0')}`).join('\n');
        const { recipients, truncated } = parseRecipients(cok);
        assert.equal(recipients.length, MAX_RECIPIENTS);
        assert.equal(truncated, 5);
    });
});

describe('applyTemplate — mesaj kişiselleştirme', () => {
    test('isim yer tutucuları doldurulur', () => {
        const sablon = 'Merhaba {isim}, kulübe hoş geldin!';
        assert.equal(
            applyTemplate(sablon, { label: 'Ahmet' }),
            'Merhaba Ahmet, kulübe hoş geldin!'
        );
        assert.equal(applyTemplate('Selam {ad}!', { label: 'Ayşe' }), 'Selam Ayşe!');
        assert.equal(applyTemplate('Hi {name}!', { label: 'Jo' }), 'Hi Jo!');
    });

    test('isim yoksa cümle bozulmaz', () => {
        // İsmi olmayan kayıtlarda "Merhaba , kulübe" gibi bir şey çıkmamalı.
        assert.equal(
            applyTemplate('Merhaba {isim}, kulübe hoş geldin!', { label: '' }),
            'Merhaba, kulübe hoş geldin!'
        );
        assert.equal(applyTemplate('{isim} selam', {}), 'selam');
    });

    test('yer tutucu yoksa mesaj aynen kalır', () => {
        assert.equal(applyTemplate('Düz mesaj', { label: 'Ahmet' }), 'Düz mesaj');
    });
});

describe('chatIdForSend — hangi sohbet id\'sine gönderilir', () => {
    // GERİLEME TESTİ. Gerçek bir hatanın kaydı:
    // Numara doğrulandıktan sonra gönderim hedefi olarak client.getNumberId()
    // sonucu (modern WhatsApp'ta bir @lid id'si) kullanılıyordu. @lid yalnızca
    // o sohbet YEREL OLARAK ZATEN VARSA çalışıyor; ilk kez yazılan birinde
    // WhatsApp Web sadece LID'den sohbet oluşturamıyor ve şu hatayı veriyor:
    //   "Data passed to getter must include an id property
    //    (it's how we memoize) but got undefined"
    // Yani araç tam da asıl işinde — hiç yazılmamış kişilere ilk mesajda —
    // çöküyordu. Telefon formu (@c.us) verildiğinde WhatsApp eşlemeyi kendisi
    // yapıyor ve var olan @lid sohbetini buluyor.
    const alici = normalizePhone('05551234567');

    test('doğrulama @lid döndürse bile telefon formuna gönderilir', () => {
        assert.equal(chatIdForSend(alici, '276746905587891@lid'), '905551234567@c.us');
    });

    test('doğrulama yapılmadıysa yine telefon formu', () => {
        assert.equal(chatIdForSend(alici, null), '905551234567@c.us');
        assert.equal(chatIdForSend(alici, undefined), '905551234567@c.us');
    });

    test('doğrulama kendi telefon formunu döndürürse o kullanılır', () => {
        // WhatsApp numarayı kendi kanonik telefon biçiminde döndürürse ona
        // uymak doğru — ama yalnızca @c.us olduğunda.
        assert.equal(chatIdForSend(alici, '905551234567@c.us'), '905551234567@c.us');
        assert.equal(chatIdForSend(alici, '905551239999@c.us'), '905551239999@c.us');
    });

    test('anlamsız doğrulama sonuçları yok sayılır', () => {
        assert.equal(chatIdForSend(alici, ''), '905551234567@c.us');
        assert.equal(chatIdForSend(alici, 'abc'), '905551234567@c.us');
        assert.equal(chatIdForSend(alici, '905551234567@g.us'), '905551234567@c.us');
    });
});

describe('nextDelayMs — gönderim hızı', () => {
    test('bekleme süresi asla tabanın altına inmez', () => {
        // Aracın "hızlandırılarak" spam makinesine çevrilememesi için taban
        // ayar değil, kod seviyesinde sabit.
        for (let i = 0; i < 50; i++) {
            const ms = nextDelayMs(i, { minMs: 0, maxMs: 0, batchSize: 0 });
            assert.ok(ms >= MIN_DELAY_FLOOR_MS, `${ms} < ${MIN_DELAY_FLOOR_MS}`);
        }
    });

    test('bekleme verilen aralıkta ve rastgele dağılır', () => {
        const ornekler = new Set();
        for (let i = 0; i < 200; i++) {
            const ms = nextDelayMs(i, { minMs: 8000, maxMs: 20000, batchSize: 0 });
            assert.ok(ms >= 8000 && ms <= 20000, `aralık dışı: ${ms}`);
            ornekler.add(ms);
        }
        // Sabit aralık (her mesaj tam 10sn) en kolay yakalanan bot desenidir.
        assert.ok(ornekler.size > 50, `yeterince dağılmıyor: ${ornekler.size}`);
    });

    test('her partiden sonra uzun mola verilir', () => {
        const normal = nextDelayMs(0, { minMs: 8000, maxMs: 9000, batchSize: 20, batchPauseMs: 120000 });
        const mola = nextDelayMs(19, { minMs: 8000, maxMs: 9000, batchSize: 20, batchPauseMs: 120000 });
        assert.ok(normal <= 9000);
        assert.ok(mola >= 120000, `mola kısa: ${mola}`);
    });
});

describe('Telegram — kullanıcı adları', () => {
    test('@ad, t.me/ad ve isimli satırlar alıcı olur (yalnızca allowUsernames ile)', () => {
        const liste = [
            '@Ahmet_Yilmaz',
            'https://t.me/ayse_demir',
            'Mehmet Kaya, @mehmetk',
            'Zeynep @zeynep_k',
            '05551234567',
            '@ahmet_yilmaz',
        ].join('\n');
        const { recipients, duplicates, invalid } = parseRecipients(liste, { allowUsernames: true });
        assert.equal(invalid.length, 0);
        assert.deepEqual(recipients.map(r => r.e164), [
            '@ahmet_yilmaz', '@ayse_demir', '@mehmetk', '@zeynep_k', '905551234567',
        ]);
        assert.equal(recipients[0].display, '@Ahmet_Yilmaz');
        assert.equal(recipients[0].username, true);
        assert.equal(recipients[2].label, 'Mehmet Kaya');
        assert.equal(recipients[3].label, 'Zeynep');
        // Büyük/küçük harf farkı aynı kişi.
        assert.equal(duplicates.length, 1);
    });

    test('WhatsApp listesinde kullanıcı adı alıcı sayılmaz', () => {
        const { recipients } = parseRecipients('@ahmet_yilmaz\n05551234567');
        assert.deepEqual(recipients.map(r => r.e164), ['905551234567']);
    });

    test('geçersiz kullanıcı adları reddedilir', () => {
        assert.equal(normalizeUsername('@ab').ok, false);       // çok kısa
        assert.equal(normalizeUsername('@1abcde').ok, false);   // rakamla başlıyor
        assert.equal(normalizeUsername('ahmet').ok, false);     // @ yok
        assert.equal(normalizeUsername('@ahmet.yilmaz').ok, false);
    });
});
