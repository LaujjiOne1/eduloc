import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { AppConfig } from '../../src/core/config/app.config';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { StorageProvider } from '../../src/infrastructure/storage/storage-provider.port';
import { buildAutoCheck } from '../../src/modules/matching/indexing/auto-check';
import { cleanExtractedText } from '../../src/modules/matching/indexing/document-cleaning';
import { AUTHENTICITY_CHECKED_TYPES, approvalMeaning } from '../../src/modules/matching/indexing/document-labels';
import { DocumentExtractionError, DocumentTextService } from '../../src/modules/matching/indexing/document-text.service';
import { makeTextPdf } from '../support/make-pdf';

/**
 * pdf.js (dans pdf-parse) ne s'exécute pas sous le loader tsx : l'analyseur PDF est simulé ici. Le vrai analyseur est
 * validé par la sonde en Node natif ci-dessous et, de bout en bout, dans le conteneur Docker (code compilé).
 */
const fakePdf = (text: string, pages = 1) => Buffer.from(JSON.stringify({ text, pages }));
const fakeParser = async (file: Buffer) => {
  try {
    return JSON.parse(file.toString()) as { text: string; pages: number };
  } catch {
    throw new Error('Invalid PDF structure');
  }
};
const service = (run?: (file: string, args: string[]) => Promise<{ stdout: string }>) =>
  new DocumentTextService({} as PrismaService, { tutorDocsBucket: 'b' } as AppConfig, {} as StorageProvider, run, fakeParser);

describe('nettoyage du texte extrait', () => {
  it('retire en-têtes/pieds de page répétés, numéros de page, lignes trop courtes et données personnelles', () => {
    const raw = [
      'UNIVERSITÉ DE FIANARANTSOA', 'Page 1/2', 'Aina Rakoto', 'Email : aina@example.mg', 'EXPÉRIENCES',
      'Développeur web, 2020-2023', '-', 'UNIVERSITÉ DE FIANARANTSOA', '2', 'Projet RSA 2022',
      'UNIVERSITÉ DE FIANARANTSOA', 'Tél : 034 12 345 67', 'Page 2/2',
    ].join('\n');
    const out = cleanExtractedText(raw);
    assert.ok(!out.includes('UNIVERSITÉ DE FIANARANTSOA'), 'en-tête répété (3 fois) retiré');
    assert.ok(!/Page \d/.test(out) && !/^2$/m.test(out), 'numéros de page retirés');
    assert.ok(!out.includes('@') && !out.includes('345 67'), 'e-mail et téléphone retirés');
    assert.ok(!/^-$/m.test(out), 'ligne trop courte retirée');
    assert.ok(out.includes('Développeur web, 2020-2023') && out.includes('Projet RSA 2022') && out.includes('EXPÉRIENCES'));
  });
});

describe('pré-contrôle indicatif (jamais décisionnel)', () => {
  it('détecte le niveau mentionné et le nom du titulaire', () => {
    const check = buildAutoCheck({ type: 'DIPLOMA', text: 'DIPLÔME DE MASTER en informatique décerné à Aina RAKOTO', holderLastName: 'Rakoto', declaredDegree: 'MASTER' });
    assert.equal(check.indicative, true);
    assert.equal(check.detectedDegree, 'MASTER');
    assert.equal(check.holderNameFound, true);
    assert.deepEqual(check.alerts, []);
  });

  it('signale une incohérence possible sans jamais rejeter', () => {
    const check = buildAutoCheck({ type: 'DIPLOMA', text: 'Licence en gestion décernée à Jean DUPONT', holderLastName: 'Rakoto', declaredDegree: 'MASTER' });
    assert.equal(check.holderNameFound, false);
    assert.equal(check.alerts.length, 2);
    assert.ok(check.alerts.every((a) => /à vérifier/.test(a)));
    assert.ok(!('rejected' in check) && !('approved' in check));
  });

  it('ne vérifie pas le nom d’un CV ni les niveaux d’un justificatif non diplômant', () => {
    const check = buildAutoCheck({ type: 'CV', text: 'Master Informatique', holderLastName: 'Rakoto', declaredDegree: 'LICENCE' });
    assert.equal(check.holderNameFound, null);
    assert.deepEqual(check.alerts, []);
  });
});

describe('approbation d’un document = attestation', () => {
  it('seuls les documents dont l’authenticité est contrôlée exigent une confirmation', () => {
    assert.deepEqual([...AUTHENTICITY_CHECKED_TYPES].sort(), ['CERTIFICATE', 'DIPLOMA', 'ENROLLMENT_CERTIFICATE', 'PROFESSIONAL_PROOF', 'TRANSCRIPT']);
    assert.ok(!AUTHENTICITY_CHECKED_TYPES.has('CV') && !AUTHENTICITY_CHECKED_TYPES.has('OTHER') && !AUTHENTICITY_CHECKED_TYPES.has('IDENTITY'));
  });
  it('le rappel affiché à l’admin nomme l’authenticité', () => {
    assert.match(approvalMeaning('DIPLOMA'), /attester de son authenticité/);
    assert.match(approvalMeaning('CV'), /jamais présenté comme « vérifié »/);
  });
});

describe('extraction de texte', () => {
  it('PDF texte : extraction directe, sans OCR', async () => {
    const calls: string[] = [];
    const pdf = fakePdf([
      'Master Informatique - parcours Securite des systemes', 'Universite de Fianarantsoa, promotion 2021',
      'Cours suivis : cryptographie, reseaux, bases de donnees, algorithmique avancee.',
    ].join('\n'));
    const text = await service(async (file) => { calls.push(file); return { stdout: '' }; }).extractText(pdf, 'application/pdf');
    assert.match(text, /Master Informatique/);
    assert.match(text, /cryptographie/);
    assert.deepEqual(calls, [], 'aucune commande système pour un PDF texte');
  });

  it('PDF sans couche texte (scan) : bascule sur pdftoppm puis Tesseract (fra+eng)', async () => {
    const calls: [string, string[]][] = [];
    const scan = fakePdf('  \n', 2); // aucune couche texte exploitable
    const runner = async (file: string, args: string[]) => {
      calls.push([file, args]);
      if (file === 'pdftoppm') {
        const prefix = args[args.length - 1];
        writeFileSync(`${prefix}-1.png`, 'x');
        writeFileSync(`${prefix}-2.png`, 'x');
        return { stdout: '' };
      }
      return { stdout: `texte OCR de ${args[0].split(/[\\/]/).pop()}` };
    };
    const text = await service(runner).extractText(scan, 'application/pdf');
    assert.equal(calls[0][0], 'pdftoppm');
    assert.ok(calls[0][1].includes('-png') && calls[0][1].includes('-l'));
    const ocrCalls = calls.filter(([f]) => f === 'tesseract');
    assert.equal(ocrCalls.length, 2);
    assert.ok(ocrCalls.every(([, args]) => args.includes('fra+eng') && args.includes('stdout')));
    assert.match(text, /page-1\.png/);
    assert.match(text, /page-2\.png/);
  });

  it('image JPG/PNG : OCR directe', async () => {
    const calls: string[] = [];
    const text = await service(async (file, args) => { calls.push(file); return { stdout: `lu ${args[0].endsWith('.png') ? 'png' : 'jpg'}` }; })
      .extractText(Buffer.from('img'), 'image/png');
    assert.deepEqual(calls, ['tesseract']);
    assert.equal(text, 'lu png');
  });

  it('OCR indisponible ⇒ DocumentExtractionError (le document passera en FAILED, sans nouvelle tentative)', async () => {
    const failing = async () => { throw new Error('spawn tesseract ENOENT'); };
    await assert.rejects(service(failing).extractText(Buffer.from('img'), 'image/jpeg'), DocumentExtractionError);
    await assert.rejects(service(failing).extractText(fakePdf(''), 'application/pdf'), DocumentExtractionError);
  });

  it('PDF illisible ou type non pris en charge ⇒ DocumentExtractionError', async () => {
    await assert.rejects(service().extractText(Buffer.from('pas un pdf'), 'application/pdf'), DocumentExtractionError);
    await assert.rejects(service().extractText(Buffer.from('x'), 'video/mp4'), DocumentExtractionError);
  });
});

describe('analyseur PDF réel (pdf-parse) en Node natif', () => {
  it('lit la couche texte d’un PDF généré (hors loader tsx)', () => {
    const pdfPath = join(process.cwd(), 'test', 'support', `_probe-${process.pid}.pdf`);
    writeFileSync(pdfPath, makeTextPdf(['Master Informatique', 'Cours : cryptographie asymetrique']));
    const script = [
      `const pdfParse = require('pdf-parse/lib/pdf-parse.js');`,
      `const fs = require('fs');`,
      `pdfParse(fs.readFileSync(process.argv[1])).then((r) => process.stdout.write(r.text));`,
    ].join('\n');
    try {
      const out = execFileSync(process.execPath, ['-e', script, pdfPath], { encoding: 'utf8', cwd: process.cwd() });
      assert.match(out, /Master Informatique/);
      assert.match(out, /cryptographie asymetrique/);
    } finally {
      execFileSync(process.execPath, ['-e', `require('fs').rmSync(process.argv[1], { force: true })`, pdfPath]);
    }
  });
});
