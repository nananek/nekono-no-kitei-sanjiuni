# 猫乃の基底参拾弐 ⇄ xxd 相互変換器

**Request-for-Cat 4649** 準拠の、内容証明郵便で送るためのひらがな Base32 双方向変換器。

公開URL: <https://nananek.github.io/nekono-no-kitei-sanjiuni/>
仕様書: <https://nananek.github.io/nekono-no-kitei-sanjiuni/spec.html>

## これは何

内容証明郵便には文字種制限があり、公開鍵のような任意バイナリをそのまま書けません。本プロジェクトはバイナリを **ひらがな32文字 + 句点「。」パディング** で符号化することで、毛筆判読性とOCR耐性を兼ね備えた郵送可能な表現を提供します。

(注: Request-for-Cat 4649 は IETF 非公認の語呂合わせです。本物の Base32 は [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648)。)

## 使い方

ブラウザで `index.html` を開くだけ。ビルドステップ無し、依存ゼロ。

- 左ペインに `xxd` 出力 (既定形式 / `xxd -p` 両対応) を貼ると、右ペインに猫乃Base32が即座に出力されます
- 中央の **⇄** ボタンで変換方向を切替 (右ペインに猫乃Base32を入れると左にxxd)
- **寛容モード**: カタカナ入力やパディング過不足を黙って補正 (Crockford Base32 流の「生成は厳格・受理は寛容」)
- **縦書きプレビュー**: 内容証明っぽい縦書き表示
- **520字制限カウンタ**: 内容証明1枚の上限を超えると警告

## 仕様

完全な仕様書は [spec.html](https://nananek.github.io/nekono-no-kitei-sanjiuni/spec.html) を参照。要点:

| 値 | 字 | 値 | 字 | 値 | 字 | 値 | 字 |
|-:|:-:|-:|:-:|-:|:-:|-:|:-:|
| 0  | あ | 8  | け | 16 | ち | 24 | ふ |
| 1  | い | 9  | こ | 17 | て | 25 | ま |
| 2  | う | 10 | さ | 18 | と | 26 | み |
| 3  | え | 11 | し | 19 | な | 27 | む |
| 4  | お | 12 | す | 20 | に | 28 | も |
| 5  | か | 13 | せ | 21 | の | 29 | や |
| 6  | き | 14 | そ | 22 | は | 30 | ゆ |
| 7  | く | 15 | た | 23 | ひ | 31 | よ |

除外字: つ ぬ ね め れ わ る ろ ほ へ を ん (毛筆・OCR・カタカナ衝突)。パディングは「。」。

### §4 テストベクトル

| 平文 | xxd -p | 猫乃Base32 |
|:-|:-|:-|
| (空) | (空) | (空) |
| `A` | `41` | `けお。。。。。。` |
| `Hi` | `4869` | `こいにち。。。。` |
| `Cat` | `436174` | `けせちひけ。。。` |
| `Hello` | `48656c6c6f` | `こいとはふむえた` |
| `猫` | `e78cab` | `もゆきさは。。。` |
| `4649` | `34363439` | `きちむえけそけ。` ¹ |

¹ **誤植訂正**: 原典 Request-for-Cat 4649 §4 では `4649` の値が `きそきけきそきす` と記載されていますが、これは §1.2 のパディング表 (4バイト→7文字+1パディング) と矛盾するため、本実装では正しい値 `きちむえけそけ。` を採用しています。

## 開発

```
.
├── index.html        # 本体 (UI + CSS)
├── nekono.js         # コアロジック (UMD, ブラウザ+Node 両対応)
├── test.html         # ブラウザ版テストランナ (ファズ可変)
├── tests/
│   └── core.test.mjs # Node 組込みテスト (node --test)
└── .github/workflows/
    └── ci.yml        # CI + GitHub Pages 自動デプロイ
```

### テストを走らせる

```sh
# ブラウザ: test.html を開く
# Node: 依存ゼロ (Node 20+ 標準機能のみ)
node --test tests/
```

68 件のテスト (静的ベクトル + ラウンドトリップ + ファズ1000本 + 寛容性 + xxd パーサ) が約 800ms で完了します。

### コアAPI

```js
import N from './nekono.js'; // Node では const N = require('./nekono.js')

N.nekonoEncode(uint8)             // → ひらがな + 末尾「。」
N.nekonoFormat(encoded)           // → 4字ごと「・」、8字ごと改行
N.nekonoDecode(text, lenient=true)// → { bytes, warnings, errors? }
N.parseXxd(text)                  // → { bytes } または { error, msg }
N.formatXxd(uint8)                // → xxd default形式
```

## ライセンス

- 仕様: 猫乃名無 (仮) 著, CC BY 4.0
- 実装: MIT
