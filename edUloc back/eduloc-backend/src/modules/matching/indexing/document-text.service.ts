import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { Prisma } from '../../../generated/prisma/client';
import { AppConfig } from '../../../core/config/app.config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../../../infrastructure/storage/storage-provider.port';
import { buildAutoCheck } from './auto-check';
import { PaddleOcrClient } from './paddle-ocr.client';
import { extractPdfText, looksGlued } from './pdf-text';
import { cleanExtractedText } from './document-cleaning';
import { enqueueTutorReindex } from './reindex-events';

const execFileAsync = promisify(execFile);
const requireCjs = createRequire(__filename);

/** Moins de caractères par page : le PDF est un scan, on bascule sur l'OCR. */
const MIN_CHARS_PER_PAGE = 40;
const MAX_OCR_PAGES = 10;
const COMMAND_TIMEOUT_MS = 90_000;
/** En dessous, le texte nettoyé n'apporte rien au matching. */
const MIN_USEFUL_CHARS = 30;

/** Jeton d'injection pour remplacer l'exécution des commandes système dans les tests. */
export const COMMAND_RUNNER = Symbol('COMMAND_RUNNER');

/** Jeton d'injection pour remplacer l'analyseur PDF dans les tests (pdf.js ne s'exécute pas sous le loader tsx). */
export const PDF_PARSER = Symbol('PDF_PARSER');
export type PdfParser = (file: Buffer) => Promise<{ text: string; pages: number }>;

/** Exécute une commande système ; remplaçable dans les tests. */
export type CommandRunner = (file: string, args: string[]) => Promise<{ stdout: string }>;
const defaultRunner: CommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  return { stdout: String(stdout) };
};

const pdfParseFallback: PdfParser = async (file) => {
  // Chemin direct : l'index de pdf-parse@1.1.1 lit un fichier de test quand il est exécuté comme module principal.
  const pdfParse = requireCjs('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
  const parsed = await pdfParse(file);
  return { text: parsed.text ?? '', pages: parsed.numpages ?? 1 };
};

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Moteur qui a produit le texte (journal et suivi de la qualité de l'import de CV). */
export type TextEngine = 'pdf-text' | 'docx' | 'paddleocr' | 'tesseract';

/** Le fichier n'est pas exploitable (vide, illisible, OCR impossible) : pas la peine de réessayer. */
export class DocumentExtractionError extends Error {}

/**
 * Extraction du texte des justificatifs (spec §5.3), en tâche de fond après l'upload :
 *  - PDF texte : extraction directe (pdf-parse) ;
 *  - PDF scanné ou image JPG/PNG : OCR Tesseract (fra + eng), PDF rasterisé par pdftoppm ;
 *  - puis nettoyage (données personnelles, en-têtes, numéros de page).
 * Les documents IDENTITY ne sont jamais traités. Le texte reste côté serveur (jamais exposé au Demandeur).
 */
@Injectable()
export class DocumentTextService {
  private readonly logger = new Logger(DocumentTextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfig,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Optional() @Inject(COMMAND_RUNNER) runner?: CommandRunner,
    @Optional() @Inject(PDF_PARSER) pdfParser?: PdfParser,
    @Optional() paddle?: PaddleOcrClient,
  ) {
    this.run = runner ?? defaultRunner;
    this.injectedPdfParser = pdfParser;
    this.paddle = paddle;
  }

  private readonly paddle?: PaddleOcrClient;

  private readonly run: CommandRunner;
  private readonly injectedPdfParser?: PdfParser;

  /** Texte brut d'un fichier. Lève DocumentExtractionError si rien d'exploitable. */
  async extractText(file: Buffer, mimeType: string): Promise<string> {
    return (await this.extractTextDetailed(file, mimeType)).text;
  }

  /**
   * Comme extractText, en indiquant le moteur : texte natif d'un PDF ou d'un DOCX d'abord, OCR seulement pour un scan
   * ou une photo (PaddleOCR, ou Tesseract s'il est absent ou en panne).
   */
  async extractTextDetailed(file: Buffer, mimeType: string): Promise<{ text: string; engine: TextEngine }> {
    if (mimeType === 'application/pdf') {
      const parsed = await this.parsePdf(file);
      if (parsed.text.replace(/\s/g, '').length >= MIN_CHARS_PER_PAGE * Math.max(1, Math.min(parsed.pages, 3))) {
        // Couche texte sans espaces (« EtudiantenMaster2Genie… ») : l'OCR lit mieux la page, quand il est disponible.
        if (looksGlued(parsed.text) && this.paddle?.enabled) {
          try {
            return await this.ocrPdf(file);
          } catch (err) {
            this.logger.warn(`Texte du PDF sans espaces et OCR impossible, texte brut conservé : ${(err as Error).message}`);
          }
        }
        return { text: parsed.text, engine: 'pdf-text' };
      }
      return this.ocrPdf(file); // PDF scanné : pas de couche texte exploitable
    }
    if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      return this.ocrImage(file, mimeType === 'image/png' ? '.png' : '.jpg');
    }
    if (mimeType === DOCX_MIME) return { text: await this.readDocx(file), engine: 'docx' };
    throw new DocumentExtractionError(`Type de fichier non pris en charge pour l’extraction : ${mimeType}`);
  }

  private async readDocx(file: Buffer): Promise<string> {
    try {
      const mammoth = requireCjs('mammoth') as { extractRawText(input: { buffer: Buffer }): Promise<{ value: string }> };
      return (await mammoth.extractRawText({ buffer: file })).value ?? '';
    } catch (err) {
      throw new DocumentExtractionError(`Document Word illisible : ${(err as Error).message}`);
    }
  }

  private async parsePdf(file: Buffer): Promise<{ text: string; pages: number }> {
    try {
      if (this.injectedPdfParser) return await this.injectedPdfParser(file);
      // pdftotext (poppler, déjà dans l'image pour l'OCR) d'abord ; sans poppler (développement sous Windows), pdf.js
      // moderne (texte par position) ; pdf-parse, plus ancien et plus fragile, en dernier recours.
      const viaPoppler = await this.pdftotext(file);
      if (viaPoppler) return viaPoppler;
      try {
        return await extractPdfText(file);
      } catch (err) {
        this.logger.warn(`pdf.js n'a pas lu ce PDF (${(err as Error).message}), essai avec pdf-parse.`);
        return await pdfParseFallback(file);
      }
    } catch (err) {
      throw new DocumentExtractionError(`PDF illisible : ${(err as Error).message}`);
    }
  }

  /** Texte d'un PDF via `pdftotext -layout` ; null si poppler n'est pas installé. Une page = un saut de page (caractère de saut de page). */
  private async pdftotext(file: Buffer): Promise<{ text: string; pages: number } | null> {
    return this.withTempDir(async (dir) => {
      const path = join(dir, 'doc.pdf');
      await fs.writeFile(path, file);
      try {
        const { stdout } = await this.run('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-']);
        return { text: stdout, pages: Math.max(1, (stdout.match(//g) ?? []).length) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    });
  }

  private async withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'eduloc-ocr-'));
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  private async ocrImage(file: Buffer, ext: string): Promise<{ text: string; engine: TextEngine }> {
    return this.withTempDir(async (dir) => {
      const path = join(dir, `page${ext}`);
      await fs.writeFile(path, file);
      return this.ocr(path);
    });
  }

  /** PaddleOCR d'abord (meilleur sur les CV à colonnes) ; Tesseract s'il est désactivé ou indisponible. */
  private async ocr(imagePath: string): Promise<{ text: string; engine: TextEngine }> {
    if (this.paddle?.enabled) {
      try {
        const mime = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        return { text: await this.paddle.ocrImage(await fs.readFile(imagePath), mime), engine: 'paddleocr' };
      } catch (err) {
        this.logger.warn(`PaddleOCR indisponible, repli sur Tesseract : ${(err as Error).message}`);
      }
    }
    return { text: await this.tesseract(imagePath), engine: 'tesseract' };
  }

  private async ocrPdf(file: Buffer): Promise<{ text: string; engine: TextEngine }> {
    // Le service PaddleOCR rastérise lui-même le PDF (PyMuPDF) : aucun besoin de poppler sur la machine du backend.
    if (this.paddle?.enabled) {
      try {
        return { text: await this.paddle.ocrFile(file, 'application/pdf'), engine: 'paddleocr' };
      } catch (err) {
        this.logger.warn(`PaddleOCR n'a pas lu le PDF, repli sur poppler + Tesseract : ${(err as Error).message}`);
      }
    }
    return this.withTempDir(async (dir) => {
      const pdf = join(dir, 'doc.pdf');
      await fs.writeFile(pdf, file);
      try {
        await this.run('pdftoppm', ['-r', '200', '-png', '-l', String(MAX_OCR_PAGES), pdf, join(dir, 'page')]);
      } catch (err) {
        throw new DocumentExtractionError(`Rasterisation du PDF impossible (poppler-utils absent ?) : ${(err as Error).message}`);
      }
      const pages = (await fs.readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
      if (pages.length === 0) throw new DocumentExtractionError('Aucune page rasterisée.');
      const texts: string[] = [];
      let engine: TextEngine = 'tesseract';
      for (const page of pages) {
        const done = await this.ocr(join(dir, page));
        texts.push(done.text);
        engine = done.engine;
      }
      return { text: texts.join('\n'), engine };
    });
  }

  private async tesseract(imagePath: string): Promise<string> {
    try {
      const { stdout } = await this.run('tesseract', [imagePath, 'stdout', '-l', 'fra+eng']);
      return stdout;
    } catch (err) {
      throw new DocumentExtractionError(`OCR impossible (tesseract absent ?) : ${(err as Error).message}`);
    }
  }

  /**
   * Tâche de fond TUTOR_DOCUMENT_EXTRACT : extrait, nettoie, calcule le pré-contrôle indicatif, puis demande la
   * réindexation si le document est déjà approuvé. Une erreur de stockage remonte (l'outbox réessaie) ; un fichier
   * inexploitable passe en FAILED sans nouvelle tentative.
   */
  async extractDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.tutorDocument.findUnique({
      where: { id: documentId },
      include: {
        tutorApplication: {
          select: { tutorProfileId: true, tutorProfile: { select: { highestDegree: true, user: { select: { lastName: true } } } } },
        },
      },
    });
    if (!doc || doc.type === 'IDENTITY') return;

    await this.prisma.tutorDocument.update({ where: { id: doc.id }, data: { extractionStatus: 'PENDING' } });
    const file = await this.storage.downloadObject(this.cfg.tutorDocsBucket, doc.storagePath).catch(async (err) => {
      await this.prisma.tutorDocument.update({ where: { id: doc.id }, data: { extractionStatus: 'NONE' } });
      throw err;
    });

    let data: Prisma.TutorDocumentUpdateInput;
    try {
      const text = cleanExtractedText(await this.extractText(file, doc.mimeType));
      if (text.replace(/\s/g, '').length < MIN_USEFUL_CHARS) throw new DocumentExtractionError('Texte extrait vide ou trop court.');
      data = {
        extractedText: text,
        extractionStatus: 'DONE',
        autoCheck: buildAutoCheck({
          type: doc.type,
          text,
          holderLastName: doc.tutorApplication.tutorProfile.user.lastName,
          declaredDegree: doc.tutorApplication.tutorProfile.highestDegree,
        }) as unknown as Prisma.InputJsonValue,
      };
    } catch (err) {
      if (!(err instanceof DocumentExtractionError)) throw err;
      this.logger.warn(`Extraction du document ${doc.id} impossible : ${err.message}`);
      data = { extractedText: null, extractionStatus: 'FAILED' };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tutorDocument.update({ where: { id: doc.id }, data });
      // Déjà approuvé : son texte entre dans l'index maintenant que l'extraction est terminée.
      if (doc.status === 'APPROVED') await enqueueTutorReindex(tx, doc.tutorApplication.tutorProfileId);
    });
  }
}
