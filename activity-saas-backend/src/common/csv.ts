/** CSV downloads are for human spreadsheet viewing. Formula-like text gets a
 * tab inside the quoted field (OWASP's Excel-resistant mitigation). The tab is
 * part of the exported value; stored data and real signed numbers are unchanged.
 * See https://community.owasp.org/attacks/CSV_Injection.
 */
export function csvCell(value: unknown, alwaysQuote = true): string {
  const text = value == null ? '' : String(value);
  const signedNumber = /^-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  const formula = !signedNumber && /^[\s\p{Cc}\p{Cf}]*[=+\-@\uff1d\uff0b\uff0d\uff20]/u.test(text);
  const protectedText = formula || /^[\t\r\n]/.test(text) ? `\t${text}` : text;
  return alwaysQuote || protectedText !== text || /[",\r\n]/.test(protectedText)
    ? `"${protectedText.replaceAll('"', '""')}"` : protectedText;
}
