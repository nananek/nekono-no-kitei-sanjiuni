// Node 組込みテスト (node --test tests/) — 依存ゼロ
// 同じテストベクトル・寛容性・ファズを CI で実行する。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const N = require(resolve(__dirname, '..', 'nekono.js'));

const hex = b => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
const bytesFromHex = h => {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i*2, 2), 16);
  return b;
};

// ============================================================
// §4 静的テストベクトル
// ============================================================
const VECTORS = [
  { label: '(空)',          input: '',           expected: '' },
  { label: 'A',             input: '41',         expected: 'けお。。。。。。' },
  { label: 'Hi',            input: '4869',       expected: 'こいにち。。。。' },
  { label: 'Cat',           input: '436174',     expected: 'けせちひけ。。。' },
  { label: 'Hello',         input: '48656c6c6f', expected: 'こいとはふむえた' },
  { label: '猫',            input: 'e78cab',     expected: 'もゆきさは。。。' },
  { label: '4649', input: '34363439',   expected: 'きちむえけそけ。' }
];

describe('§4 静的テストベクトル', () => {
  for (const v of VECTORS) {
    test(`encode ${v.label}`, () => {
      assert.equal(N.nekonoEncode(bytesFromHex(v.input)), v.expected);
    });
    test(`decode ${v.label}`, () => {
      const r = N.nekonoDecode(v.expected, true);
      assert.equal(r.error, undefined, `decode error: ${JSON.stringify(r.errors)}`);
      assert.equal(hex(r.bytes), v.input);
    });
  }
});

// ============================================================
// §4.1 ラウンドトリップ
// ============================================================
describe('§4.1 ラウンドトリップ (固定ベクトル)', () => {
  for (const v of VECTORS) {
    test(`xxd ↻ "${v.label}"`, () => {
      const b = bytesFromHex(v.input);
      const r = N.parseXxd(N.formatXxd(b));
      assert.deepEqual(r.bytes, b);
    });
    test(`nekono ↻ "${v.label}" (厳格モードでも往復)`, () => {
      const b = bytesFromHex(v.input);
      const enc = N.nekonoEncode(b);
      const r = N.nekonoDecode(enc, false);
      assert.equal(r.error, undefined);
      assert.deepEqual(r.bytes, b);
    });
    test(`nekonoFormat ↻ "${v.label}"`, () => {
      const b = bytesFromHex(v.input);
      const fmt = N.nekonoFormat(N.nekonoEncode(b));
      const r = N.nekonoDecode(fmt, true);
      assert.equal(r.error, undefined);
      assert.deepEqual(r.bytes, b);
    });
  }
});

// ============================================================
// §4.2 ファズテスト 1000本
// ============================================================
describe('§4.2 ファズ (1〜1024 バイト × 1000 本)', () => {
  test('全1000本ラウンドトリップ完全一致 (厳格デコード)', () => {
    const FUZZ_COUNT = 1000;
    let fails = 0;
    const failExamples = [];
    for (let i = 0; i < FUZZ_COUNT; i++) {
      const len = 1 + Math.floor(Math.random() * 1024);
      const data = randomBytes(len);
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.length);
      const enc = N.nekonoEncode(bytes);
      const fmt = N.nekonoFormat(enc);
      const r = N.nekonoDecode(fmt, false);
      const ok = !r.error && r.bytes.length === bytes.length &&
                 r.bytes.every((b, k) => b === bytes[k]);
      if (!ok) {
        fails++;
        if (failExamples.length < 3) {
          failExamples.push({ len, hex: hex(bytes).slice(0,80), err: r.error ? r.errors : 'mismatch' });
        }
      }
    }
    assert.equal(fails, 0,
      `${fails}/${FUZZ_COUNT} 本失敗: ${JSON.stringify(failExamples)}`);
  });
});

// ============================================================
// §2 デコーダ寛容性
// ============================================================
describe('§2.1 カタカナ自動マッピング', () => {
  test('「コイニチ。。。。」→ 0x4869', () => {
    const r = N.nekonoDecode('コイニチ。。。。', true);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.bytes, bytesFromHex('4869'));
  });
  test('厳格モードではカタカナ拒絶', () => {
    const r = N.nekonoDecode('コイニチ。。。。', false);
    assert.equal(r.error, true);
    assert.equal(r.errors[0].char, 'コ');
  });
});

describe('§2.2 OCR 救済', () => {
  test('ツ→し: 受理かつ警告', () => {
    const r = N.nekonoDecode('こいにツ。。。。', true);
    assert.equal(r.error, undefined);
    assert(r.warnings.some(w => /OCR/.test(w.msg)));
  });
  test('ヘ→ふ: 受理かつ警告', () => {
    const r = N.nekonoDecode('こいにヘ。。。。', true);
    assert.equal(r.error, undefined);
    assert(r.warnings.some(w => /OCR/.test(w.msg)));
  });
  test('ツ厳格モードで拒絶', () => {
    const r = N.nekonoDecode('こいにツ。。。。', false);
    assert.equal(r.error, true);
  });
});

describe('§2.3 無視文字', () => {
  test('ASCII空白・タブ・全角SP・中黒・読点を無視', () => {
    const r = N.nekonoDecode('こい にち\t　・、。。。。', true);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.bytes, bytesFromHex('4869'));
  });
});

describe('§2.4 拒絶', () => {
  for (const ch of ['つ', 'ぬ', 'ね', 'め', 'れ', 'わ', 'る', 'ろ', 'ほ', 'へ', 'を', 'ん']) {
    test(`除外字「${ch}」→ エラー (位置つき)`, () => {
      const r = N.nekonoDecode('こい' + ch + 'ち。。。。', true);
      assert.equal(r.error, true);
      const e = r.errors.find(e => e.char === ch);
      assert(e, `not found: ${ch} in ${JSON.stringify(r.errors)}`);
      assert.equal(e.pos, 2);
    });
  }
  test('非マップ・カタカナ「ヌ」→ エラー', () => {
    const r = N.nekonoDecode('こいヌち。。。。', true);
    assert.equal(r.error, true);
  });
});

describe('§2.5 パディング検証', () => {
  test('寛容: パディング全省略を補正', () => {
    const r = N.nekonoDecode('こいにち', true);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.bytes, bytesFromHex('4869'));
    assert(r.warnings.some(w => /補正/.test(w.msg)));
  });
  test('寛容: パディング不足を補正', () => {
    const r = N.nekonoDecode('こいにち。。', true);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.bytes, bytesFromHex('4869'));
  });
  test('厳格: パディング省略はエラー', () => {
    const r = N.nekonoDecode('こいにち', false);
    assert.equal(r.error, true);
  });
  test('パディングが本体中にあるとエラー', () => {
    const r = N.nekonoDecode('こ。にち。。。。', true);
    assert.equal(r.error, true);
  });
});

// ============================================================
// §3 xxd パーサ
// ============================================================
describe('§3 xxd パーサ', () => {
  test('既定形式 (xxd) — ASCII列を無視', () => {
    const r = N.parseXxd('00000000: 4865 6c6c 6f2c 2057 6f72 6c64 210a       Hello, World!.');
    assert.equal(r.error, undefined);
    assert.equal(hex(r.bytes), '48656c6c6f2c20576f726c64210a');
  });
  test('plain hex (xxd -p)', () => {
    const r = N.parseXxd('48656c6c6f');
    assert.equal(hex(r.bytes), '48656c6c6f');
  });
  test('奇数桁 → エラー', () => {
    const r = N.parseXxd('48656c6c6');
    assert.equal(r.error, true);
  });
  test('plain で非hex字混入は黙ってスキップ', () => {
    // 注: a-fA-F は hex として拾われるので、それを含まない文字列を使う
    const r = N.parseXxd('Hi! こんにちは\n42 41');
    assert.equal(r.error, undefined);
    assert.equal(hex(r.bytes), '4241');
  });
  test('既定形式: ASCII列にhex字が含まれても本文のみ抽出', () => {
    const r = N.parseXxd('00000000: 4244 4546                                BDEF');
    assert.equal(hex(r.bytes), '42444546');
  });
  test('空入力 → 空バイト列', () => {
    const r = N.parseXxd('');
    assert.deepEqual(r.bytes, new Uint8Array(0));
  });
  test('複数行 既定形式', () => {
    const r = N.parseXxd([
      '00000000: 4865 6c6c 6f2c 2057 6f72 6c64 2120 4865  Hello, World! He',
      '00000010: 6c6c 6f                                  llo'
    ].join('\n'));
    assert.equal(hex(r.bytes), '48656c6c6f2c20576f726c642120' + '48656c6c6f');
  });
});

describe('§3.1 formatXxd', () => {
  test('formatXxd は xxd -r 互換', () => {
    const bytes = new TextEncoder().encode('Hello, World!\n');
    const out = N.formatXxd(bytes);
    assert.match(out, /^00000000: 4865 6c6c 6f2c 2057 6f72 6c64 210a {7}Hello, World!\.$/m);
  });
  test('formatXxd は 16バイト境界で改行', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    const lines = N.formatXxd(bytes).split('\n');
    assert.equal(lines.length, 2);
    assert(lines[0].startsWith('00000000:'));
    assert(lines[1].startsWith('00000010:'));
  });
});
