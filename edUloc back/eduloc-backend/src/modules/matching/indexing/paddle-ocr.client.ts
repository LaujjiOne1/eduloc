import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../core/config/app.config';

/** Un PDF de plusieurs pages passe par l'OCR sur CPU : plusieurs minutes possibles. */
const REQUEST_TIMEOUT_MS = 600_000;

/** Le service PaddleOCR ne répond pas, ou refuse l'image : l'appelant retombe sur Tesseract. */
export class PaddleOcrError extends Error {}

/**
 * Client du service OCR (docker/paddleocr). Une page = une image PNG/JPEG ; le service renvoie le texte dans l'ordre de
 * lecture (deux colonnes comprises). Désactivé quand PADDLEOCR_URL est absent.
 */
@Injectable()
export class PaddleOcrClient {
  private readonly logger = new Logger(PaddleOcrClient.name);

  constructor(private readonly cfg: AppConfig) {}

  get enabled(): boolean {
    return this.cfg.paddleOcrUrl !== null;
  }

  async ocrImage(file: Buffer, mimeType: string): Promise<string> {
    return this.ocrFile(file, mimeType);
  }

  /** Image (PNG, JPEG) ou PDF entier : le service rastérise les pages d'un PDF et renvoie leur texte à la suite. */
  async ocrFile(file: Buffer, mimeType: string): Promise<string> {
    if (!this.cfg.paddleOcrUrl) throw new PaddleOcrError('PADDLEOCR_URL non configuré.');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file)], { type: mimeType }), mimeType === 'application/pdf' ? 'doc.pdf' : mimeType === 'image/png' ? 'page.png' : 'page.jpg');
    let response: Response;
    try {
      response = await fetch(`${this.cfg.paddleOcrUrl}/ocr`, { method: 'POST', body: form, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new PaddleOcrError(`PaddleOCR injoignable : ${(err as Error).message}`);
    }
    if (!response.ok) throw new PaddleOcrError(`PaddleOCR a répondu ${response.status}.`);
    const body = (await response.json()) as { text?: unknown };
    if (typeof body.text !== 'string') throw new PaddleOcrError('Réponse PaddleOCR invalide.');
    this.logger.debug(`PaddleOCR : ${body.text.length} caractères.`);
    return body.text;
  }
}
