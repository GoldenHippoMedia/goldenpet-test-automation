/**
 * Parse a money string into a number.
 *   "$179.85"    -> 179.85
 *   "$1,179.85"  -> 1179.85
 *   "Free"       -> 0
 *   "FREE"       -> 0
 *   "TBD"        -> null   (not yet calculated)
 *   ""/undefined -> null
 */
function parseMoney(text) {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  if (/free/i.test(trimmed))  return 0;
  if (/tbd/i.test(trimmed))   return null;
  const match = trimmed.match(/\$?\s*([\d,]+\.\d{2})/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

module.exports = { parseMoney };
