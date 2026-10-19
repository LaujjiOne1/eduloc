/**
 * Tests d'intégration AVEC OLLAMA RÉEL (modèle téléchargé par le service ollama-init). À lancer séparément :
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ollama ollama-init   # port 127.0.0.1:11434
 *   OLLAMA_URL=http://127.0.0.1:11434 npm run test:int
 *
 * Ignorés sans OLLAMA_URL. Les cas sémantiques (E11) sont relatifs (« plus proche que ... ») : aucun seuil absolu
 * n'est supposé tant que le matching n'est pas calibré, et aucune exigence de mots identiques.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { AppConfig } from '../../src/core/config/app.config';
import type { RedisService } from '../../src/core/redis/redis.service';
import { formatDocument } from '../../src/modules/matching/embedding/embedding-format';
import { OllamaEmbeddingService } from '../../src/modules/matching/embedding/ollama-embedding.service';

const ollamaUrl = process.env.OLLAMA_URL;
const skip = ollamaUrl ? false : 'OLLAMA_URL absent : tests Ollama réel ignorés';

const redis = { store: new Map<string, string>(), get: async (k: string) => redis.store.get(k) ?? null, set: async (k: string, v: string) => void redis.store.set(k, v) };
const cfg = {
  ollamaUrl,
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL',
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? 768),
} as AppConfig;
const service = new OllamaEmbeddingService(cfg, redis as unknown as RedisService);

/** Vecteurs normalisés ⇒ le produit scalaire est la similarité cosinus. */
const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe('Ollama réel — embeddings', { skip }, () => {
  before(async () => {
    await service.onModuleInit();
    await service.warmUp(); // le premier appel charge le modèle en mémoire
    assert.equal(await service.isAvailable(), true, `modèle ${cfg.embeddingModel} absent d'Ollama`);
  });

  it('un texte donne 768 valeurs sans NaN', async () => {
    const [v] = await service.embedTexts([formatDocument('Algèbre linéaire', 'Diagonalisation de matrices')]);
    assert.equal(v.length, 768);
    assert.ok(v.every(Number.isFinite));
  });

  it('une requête utilise le cache la seconde fois', async () => {
    const a = await service.embedQuery('diagonalisation de matrices');
    redis.store.clear();
    const b = await service.embedQuery('diagonalisation de matrices');
    assert.equal(a.length, 768);
    assert.ok(cosine(a, b) > 0.999);
  });

  describe('proximité sémantique sans mots identiques (E11)', () => {
    const doc = async (title: string, text: string) => (await service.embedTexts([formatDocument(title, text)]))[0];

    it('« Transformées de Fourier » rapproche « Traitement du signal »', async () => {
      const query = await service.embedQuery('Transformées de Fourier');
      const signal = await doc('Traitement du signal', 'Matière : Traitement du signal. Analyse spectrale, filtrage, échantillonnage.');
      const unrelated = await doc('Droit des affaires', 'Matière : Droit des affaires. Sociétés commerciales, contrats.');
      const cuisine = await doc('Cuisine', 'Matière : Cuisine. Recettes de pâtisserie et techniques de cuisson.');
      assert.ok(cosine(query, signal) > cosine(query, unrelated), 'plus proche du signal que du droit');
      assert.ok(cosine(query, signal) > cosine(query, cuisine), 'plus proche du signal que de la cuisine');
    });

    for (const need of ['Master MIAGE', 'Diplôme d’ingénieur logiciel']) {
      it(`« ${need} » est proche de « Master Informatique »`, async () => {
        const [a, informatique, droit, histoire] = await service.embedTexts([
          formatDocument('Parcours académique', `Niveau d'études : Master. Diplôme : ${need}.`),
          formatDocument('Parcours académique', "Niveau d'études : Master. Diplôme : Master Informatique."),
          formatDocument('Parcours académique', "Niveau d'études : Master. Diplôme : Master Droit privé."),
          formatDocument('Parcours académique', "Niveau d'études : Master. Diplôme : Master Histoire médiévale."),
        ]);
        assert.ok(cosine(a, informatique) > cosine(a, droit), 'plus proche de l’informatique que du droit');
        assert.ok(cosine(a, informatique) > cosine(a, histoire), 'plus proche de l’informatique que de l’histoire');
      });
    }
  });
});
