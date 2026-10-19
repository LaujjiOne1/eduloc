/** PDF minimal valide contenant du texte (une page, police Helvetica) : sert aux tests d'extraction sans fichier binaire. */
export function makeTextPdf(lines: string[]): Buffer {
  const escapePdf = (t: string) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  // Encodage WinAnsi : les caractères Latin-1 accentués passent par leur code octal.
  const toWinAnsi = (t: string) =>
    [...escapePdf(t)]
      .map((ch) => {
        const code = ch.charCodeAt(0);
        return code > 127 && code < 256 ? `\\${code.toString(8).padStart(3, '0')}` : ch;
      })
      .join('');
  const content = ['BT', '/F1 12 Tf', '14 TL', '50 780 Td', ...lines.map((l) => `(${toWinAnsi(l)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
