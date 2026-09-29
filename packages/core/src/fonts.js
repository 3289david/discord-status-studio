// Unicode "font" transforms that render nicely in Discord.

function mapAlpha(str, upperStart, lowerStart, digitStart, exceptions = {}) {
  return Array.from(str)
    .map((ch) => {
      if (exceptions[ch]) return exceptions[ch];
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90 && upperStart) return String.fromCodePoint(upperStart + c - 65);
      if (c >= 97 && c <= 122 && lowerStart) return String.fromCodePoint(lowerStart + c - 97);
      if (c >= 48 && c <= 57 && digitStart) return String.fromCodePoint(digitStart + c - 48);
      return ch;
    })
    .join('');
}

const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';

export const FONTS = {
  normal: (s) => s,
  bold: (s) => mapAlpha(s, 0x1d400, 0x1d41a, 0x1d7ce),
  italic: (s) => mapAlpha(s, 0x1d434, 0x1d44e, 0, { h: 'ℎ' }),
  boldItalic: (s) => mapAlpha(s, 0x1d468, 0x1d482, 0),
  script: (s) =>
    mapAlpha(s, 0x1d49c, 0x1d4b6, 0, {
      B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ',
    }),
  mono: (s) => mapAlpha(s, 0x1d670, 0x1d68a, 0x1d7f6),
  double: (s) =>
    mapAlpha(s, 0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }),
  sans: (s) => mapAlpha(s, 0x1d5a0, 0x1d5ba, 0x1d7e2),
  sansBold: (s) => mapAlpha(s, 0x1d5d4, 0x1d5ee, 0x1d7ec),
  smallCaps: (s) =>
    Array.from(s.toLowerCase())
      .map((ch) => (ch >= 'a' && ch <= 'z' ? SMALL_CAPS[ch.charCodeAt(0) - 97] : ch))
      .join(''),
  fullwidth: (s) =>
    Array.from(s)
      .map((ch) => {
        const c = ch.codePointAt(0);
        if (c === 32) return '　';
        return c >= 33 && c <= 126 ? String.fromCodePoint(c + 0xfee0) : ch;
      })
      .join(''),
  spaced: (s) => Array.from(s).join(' '),
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
};

export const FONT_NAMES = Object.keys(FONTS);

export function applyFont(name, s) {
  return (FONTS[name] || FONTS.normal)(s ?? '');
}
