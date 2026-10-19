import { createRequire } from 'module';

const requireCjs = createRequire(__filename);

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Texte d'un PDF avec pdf.js moderne (pdfjs-dist 3, build « legacy » pour Node). Contrairement à pdf-parse (pdf.js 1.10),
 * il lit les PDF produits par les outils actuels (Word, Canva, reportlab) et rend le texte PAR POSITION : les blocs sont
 * regroupés en lignes (même ordonnée) puis lus de gauche à droite, un espace étant ajouté quand l'écart le justifie.
 * Les colonnes ne sont pas démêlées ici : un CV à deux colonnes passe par l'OCR (PaddleOCR) si le texte est illisible.
 */
export async function extractPdfText(file: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = requireCjs('pdfjs-dist/legacy/build/pdf.js') as {
    getDocument(src: Record<string, unknown>): {
      promise: Promise<{
        numPages: number;
        getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }>;
        destroy(): Promise<void>;
      }>;
    };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(file), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(pageText(content.items));
    }
    return { text: pages.join('\f'), pages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

/** Blocs de texte → lignes. Exporté pour les tests. */
export function pageText(rawItems: TextItem[]): string {
  const items = rawItems
    .filter((i) => typeof i.str === 'string' && Array.isArray(i.transform))
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; items: typeof items }[] = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= Math.max(2, item.h * 0.4)) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }

  return lines
    .map((line) => {
      line.items.sort((a, b) => a.x - b.x);
      let out = '';
      let previousEnd: number | null = null;
      for (const item of line.items) {
        const gap = previousEnd === null ? 0 : item.x - previousEnd;
        if (previousEnd !== null && gap > item.h * 0.18 && !out.endsWith(' ') && !item.s.startsWith(' ')) out += ' ';
        out += item.s;
        previousEnd = item.x + item.w;
      }
      return out.trim();
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Vrai quand les mots sont collés (« EtudiantenMaster2Genie… ») : certains PDF n'ont pas de glyphe d'espace dans leur couche
 * texte. Le français courant compte ~15 % d'espaces ; en dessous de 7 % sur un texte assez long, la couche texte est
 * inexploitable et l'OCR lit mieux la page.
 */
export function looksGlued(text: string): boolean {
  const visible = text.replace(/[\n\f]/g, '');
  if (visible.length < 400) return false;
  const spaces = (visible.match(/ /g) ?? []).length;
  return spaces / visible.length < 0.07;
}
