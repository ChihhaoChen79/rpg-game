"""Cuts the game font down to the characters it needs (plan §10).

Keeps: every character in data/*.json (UI text, item/monster/spell names), printable ASCII,
common punctuation, and the ~5,400 common Traditional Chinese characters of Big5 level 1 (so
typed player names usually use the pixel font too; anything rarer falls back to the system font).

Run after adding text with new characters (tests/font.test.ts tells you when):
    pip install fonttools brotli
    python3 tools/subset-font.py
Input:  assets/fonts/source/fusion-pixel-12px-proportional-tc.woff2 (full font, SIL OFL 1.1)
Output: assets/fonts/fusion-pixel-tc-subset.woff2 and .chars.txt (the characters it covers)
"""
import glob
from fontTools import subset

SRC = 'assets/fonts/source/fusion-pixel-12px-proportional-tc.woff2'
OUT = 'assets/fonts/fusion-pixel-tc-subset.woff2'
CHARS = 'assets/fonts/fusion-pixel-tc-subset.chars.txt'  # checked by tests/font.test.ts


def big5_level1() -> str:
    """Big5 level-1 (common) hanzi: lead bytes 0xA4-0xC6."""
    out = []
    for lead in range(0xA4, 0xC7):
        for trail in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                out.append(bytes([lead, trail]).decode('big5'))
            except UnicodeDecodeError:
                pass
    return ''.join(out)


def game_text() -> str:
    text = ''
    for path in sorted(glob.glob('data/*.json')):
        with open(path, encoding='utf-8') as f:
            text += f.read()
    return text


chars = set(game_text()) | set(big5_level1())
chars |= {chr(c) for c in range(0x20, 0x7F)}
chars |= set('，。、！？：；「」『』（）《》〈〉…—～·　＋－×÷％／')
font_chars = ''.join(sorted(c for c in chars if c.isprintable() or c == '　'))

options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
options.name_IDs = ['*']
options.notdef_outline = True
font = subset.load_font(SRC, options)
subsetter = subset.Subsetter(options)
subsetter.populate(text=font_chars)
subsetter.subset(font)
subset.save_font(font, OUT, options)
cmap = font.getBestCmap()
kept = ''.join(c for c in font_chars if ord(c) in cmap)
with open(CHARS, 'w', encoding='utf-8') as f:
    f.write(kept)
print(f'wrote {OUT}: {len(kept)} characters (list in {CHARS})')
