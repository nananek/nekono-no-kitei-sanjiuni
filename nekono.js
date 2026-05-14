// 猫乃の基底参拾弐 (Nekono Base32) コア実装
// RFC-CAT 4649 §1〜§3 準拠 — エンコーダ・デコーダ・xxdパーサ
// UMD: ブラウザでは globalThis.NekonoBase32、Node では module.exports

;(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.NekonoBase32 = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // §1.1 アルファベット (32文字)
  const ALPHABET = [
    'あ','い','う','え','お', 'か','き','く','け','こ',
    'さ','し','す','せ','そ', 'た','ち','て','と',
    'な','に','の', 'は','ひ','ふ',
    'ま','み','む','も', 'や','ゆ','よ'
  ];
  const PADDING = '。';
  const SEPARATOR = '・';
  const CHAR_TO_VAL = new Map(ALPHABET.map((c, i) => [c, i]));

  // §2.1 カタカナ寛容マッピング
  const KATAKANA_MAP = new Map([
    ['ア','あ'],['イ','い'],['ウ','う'],['エ','え'],['オ','お'],
    ['カ','か'],['キ','き'],['ク','く'],['ケ','け'],['コ','こ'],
    ['サ','さ'],['シ','し'],['ス','す'],['セ','せ'],['ソ','そ'],
    ['タ','た'],['チ','ち'],['テ','て'],['ト','と'],
    ['ナ','な'],['ニ','に'],['ノ','の'],
    ['ハ','は'],['ヒ','ひ'],['フ','ふ'],
    ['マ','ま'],['ミ','み'],['ム','む'],['モ','も'],
    ['ヤ','や'],['ユ','ゆ'],['ヨ','よ']
  ]);
  // §2.2 OCR 救済
  const OCR_RESCUE = new Map([['ツ','し'], ['ヘ','ふ']]);
  // §2.3 無視
  const IGNORE_CHARS = new Set([' ', '\t', '\n', '\r', '　', '・', '、']);
  // §2.4 拒絶対象 (説明文用)
  const REJECT_HINTS = new Map([
    ['つ','除外字 (シ/ツ問題)'],
    ['ぬ','除外字 (相互判読不能)'],
    ['ね','除外字 (ね/れ/わ 三つ巴)'],
    ['め','除外字 (相互判読不能)'],
    ['れ','除外字 (ね/れ/わ 三つ巴)'],
    ['わ','除外字 (ね/れ/わ 三つ巴)'],
    ['る','除外字 (る/ろ 上点)'],
    ['ろ','除外字 (る/ろ 上点)'],
    ['ほ','除外字 (は と混同)'],
    ['へ','除外字 (カタカナ ヘ と同一)'],
    ['を','除外字 (お と混同)'],
    ['ん','除外字 (筆跡上 ソ と混同)']
  ]);

  // §1.2 入力バイト % 5 → 末尾の出力数(余り)と必要パディング
  const PAD_FOR_REM = {0:0, 2:6, 4:4, 5:3, 7:1};
  const BYTES_FOR_REM = {0:0, 2:1, 4:2, 5:3, 7:4};

  // ==========================================================
  // エンコーダ (§1)
  // ==========================================================
  function nekonoEncode(bytes) {
    if (!bytes || bytes.length === 0) return '';
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    const dataChars = Math.ceil(bits.length / 5);
    const totalChars = Math.ceil(bytes.length / 5) * 8;
    const padCount = totalChars - dataChars;
    while (bits.length % 5 !== 0) bits += '0';
    let out = '';
    for (let i = 0; i < bits.length; i += 5) {
      out += ALPHABET[parseInt(bits.substr(i, 5), 2)];
    }
    return out + PADDING.repeat(padCount);
  }

  // §1.3 区切り: 4字ごと「・」、8字ごと改行
  function nekonoFormat(encoded) {
    const chars = [...encoded];
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      if (i > 0) {
        if (i % 8 === 0) out += '\n';
        else if (i % 4 === 0) out += SEPARATOR;
      }
      out += chars[i];
    }
    return out;
  }

  // ==========================================================
  // デコーダ (§2)
  // ==========================================================
  function nekonoDecode(text, lenient) {
    if (lenient === undefined) lenient = true;
    const warnings = [];
    const errors = [];
    let body = '';
    const arr = [...text];

    for (let i = 0; i < arr.length; i++) {
      const ch = arr[i];
      if (IGNORE_CHARS.has(ch)) continue;
      if (ch === PADDING) { body += ch; continue; }
      if (CHAR_TO_VAL.has(ch)) { body += ch; continue; }
      if (KATAKANA_MAP.has(ch)) {
        if (lenient) { body += KATAKANA_MAP.get(ch); continue; }
        errors.push({pos: i, char: ch, msg: 'カタカナ「' + ch + '」は厳格モードでは拒絶 (§2.1)'});
        continue;
      }
      if (OCR_RESCUE.has(ch)) {
        if (lenient) {
          const mapped = OCR_RESCUE.get(ch);
          body += mapped;
          warnings.push({pos: i, char: ch, mapped: mapped, msg: 'OCR救済: 「' + ch + '」→「' + mapped + '」 (§2.2)'});
          continue;
        }
        errors.push({pos: i, char: ch, msg: '「' + ch + '」は厳格モードでは拒絶 (§2.2)'});
        continue;
      }
      const hint = REJECT_HINTS.get(ch);
      errors.push({pos: i, char: ch, msg: hint ? '「' + ch + '」: ' + hint + ' (§2.4)' : '不正文字「' + ch + '」'});
    }

    if (errors.length > 0) return { error: true, errors: errors, warnings: warnings };
    if (body.length === 0) return { bytes: new Uint8Array(0), warnings: warnings, errors: [] };

    // 末尾パディング数を数える
    let padCount = 0;
    let dataBody = body;
    while (dataBody.endsWith(PADDING)) {
      padCount++;
      dataBody = dataBody.slice(0, -1);
    }
    if (dataBody.includes(PADDING)) {
      return { error: true, warnings: warnings, errors: [{msg: 'パディング「。」は末尾にのみ許可されます (§1.2)'}] };
    }

    const bodyLen = dataBody.length;
    const fullBlocks = Math.floor(bodyLen / 8);
    const rem = bodyLen % 8;

    if (PAD_FOR_REM[rem] === undefined) {
      return { error: true, warnings: warnings, errors: [{msg: '本体文字数(' + bodyLen + ')が不正 (mod 8 = ' + rem + ')'}] };
    }

    const expectedPad = PAD_FOR_REM[rem];
    if (padCount !== expectedPad) {
      if (!lenient) {
        return { error: true, warnings: warnings, errors: [{msg: 'パディング数が不一致 (期待 ' + expectedPad + ', 実際 ' + padCount + ') §1.2'}] };
      }
      warnings.push({msg: '寛容モード: パディング数を補正 (' + padCount + ' → ' + expectedPad + ') §2.5'});
    }

    let bits = '';
    for (const ch of dataBody) {
      bits += CHAR_TO_VAL.get(ch).toString(2).padStart(5, '0');
    }
    const dataBytes = fullBlocks * 5 + BYTES_FOR_REM[rem];
    const dataBits = bits.slice(0, dataBytes * 8);
    const tailBits = bits.slice(dataBytes * 8);
    if (tailBits.includes('1')) {
      warnings.push({msg: 'パディングビット(' + tailBits + ')が非零です'});
    }
    const out = new Uint8Array(dataBytes);
    for (let i = 0; i < dataBytes; i++) {
      out[i] = parseInt(dataBits.substr(i * 8, 8), 2);
    }
    return { bytes: out, warnings: warnings, errors: [] };
  }

  // ==========================================================
  // xxd パーサ / フォーマッタ (§3)
  // ==========================================================
  function parseXxd(input) {
    if (!input || !input.trim()) return { bytes: new Uint8Array(0) };
    let hex = '';
    if (input.includes(':')) {
      const lines = input.split(/\r?\n/);
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) {
          hex += line.replace(/[^0-9a-fA-F]/g, '');
          continue;
        }
        let rest = line.slice(colonIdx + 1);
        const asciiSep = rest.search(/ {2,}/);
        if (asciiSep !== -1) rest = rest.slice(0, asciiSep);
        hex += rest.replace(/[^0-9a-fA-F]/g, '');
      }
    } else {
      hex = input.replace(/[^0-9a-fA-F]/g, '');
    }
    if (hex.length % 2 !== 0) {
      return { error: true, msg: '16進文字数が奇数 (' + hex.length + ') — 1桁余っています §3.3' };
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i*2, 2), 16);
    return { bytes: bytes };
  }

  function formatXxd(bytes) {
    if (!bytes || bytes.length === 0) return '';
    const lines = [];
    for (let offset = 0; offset < bytes.length; offset += 16) {
      const end = Math.min(offset + 16, bytes.length);
      const cells = new Array(16);
      for (let i = 0; i < 16; i++) {
        cells[i] = (offset + i < end) ? bytes[offset + i].toString(16).padStart(2, '0') : '  ';
      }
      const groups = [];
      for (let i = 0; i < 16; i += 2) groups.push(cells[i] + cells[i+1]);
      const hexSection = groups.join(' ');
      let ascii = '';
      for (let i = offset; i < end; i++) {
        const b = bytes[i];
        ascii += (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.';
      }
      const offsetStr = offset.toString(16).padStart(8, '0');
      lines.push(offsetStr + ': ' + hexSection + '  ' + ascii);
    }
    return lines.join('\n');
  }

  return {
    nekonoEncode: nekonoEncode,
    nekonoFormat: nekonoFormat,
    nekonoDecode: nekonoDecode,
    parseXxd: parseXxd,
    formatXxd: formatXxd,
    ALPHABET: ALPHABET,
    PADDING: PADDING,
    SEPARATOR: SEPARATOR,
    KATAKANA_MAP: KATAKANA_MAP,
    OCR_RESCUE: OCR_RESCUE,
    REJECT_HINTS: REJECT_HINTS
  };
}));
