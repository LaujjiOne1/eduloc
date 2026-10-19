import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../src/core/config/app.config';
import type { RedisService } from '../../src/core/redis/redis.service';
import {
  assertValidVector, formatDocument, formatQuery, l2Normalize, toPgVector,
} from '../../src/modules/matching/embedding/embedding-format';
import { OllamaEmbeddingService } from '../../src/modules/matching/embedding/ollama-embedding.service';
import { HealthController } from '../../src/modules/matching/health.controller';
import { MatchingAvailableGuard } from '../../src/modules/matching/matching-available.guard';

const MODEL = 'embeddinggemma-2:270m';
const DIM = 768;
const vec = (seed = 1, dim = DIM) => Array.from({ length: dim }, (_, i) => Math.sin(seed + i));

/** Faux Ollama : on pilote ses réponses test par test. */
interface FakeState {
  models: string[];
  embed: (input: string[]) => { status: number; body: unknown } | 'hang';
  embedCalls: string[][];
  tagCalls: number;
}
let state: FakeState;
let server: Server;
let baseUrl: string;

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url === '/api/tags') {
    state.tagCalls += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ models: state.models.map((name) => ({ name, model: name })) }));
    return;
  }
  if (req.url === '/api/embed' && req.method === 'POST') {
    void readBody(req).then((raw) => {
      const { input } = JSON.parse(raw) as { model: string; input: string[] };
      state.embedCalls.push(input);
      const out = state.embed(input);
      if (out === 'hang') return; // le client doit abandonner via son timeout
      res.statusCode = out.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out.body));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
}

const memoryRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
  };
};

function makeService(url = baseUrl, redis = memoryRedis()) {
  const cfg = { ollamaUrl: url, embeddingModel: MODEL, embeddingDim: DIM } as AppConfig;
  return { service: new OllamaEmbeddingService(cfg, redis as unknown as RedisService), redis };
}

const okEmbed = (input: string[]) => ({ status: 200, body: { embeddings: input.map((_, i) => vec(i + 1)) } });

before(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(async () => {
  // Laisse arriver les préchauffages lancés en arrière-plan par le test précédent avant de réinitialiser l'état.
  await new Promise((r) => setTimeout(r, 50));
  state = { models: [MODEL], embed: okEmbed, embedCalls: [], tagCalls: 0 };
});

describe('préfixes EmbeddingGemma (spec §1)', () => {
  it('document : title | text, « none » sans titre', () => {
    assert.equal(formatDocument('Algèbre linéaire', 'Matière : Algèbre'), 'title: Algèbre linéaire | text: Matière : Algèbre');
    assert.equal(formatDocument(null, 'x'), 'title: none | text: x');
    assert.equal(formatDocument('  ', 'x'), 'title: none | text: x');
  });
  it('requête : task: search result | query', () => {
    assert.equal(formatQuery('diagonalisation'), 'task: search result | query: diagonalisation');
  });
});

describe('validation des vecteurs', () => {
  it('accepte 768 valeurs finies', () => assert.doesNotThrow(() => assertValidVector(vec(), DIM)));
  it('refuse une mauvaise dimension, un NaN, un Infinity ou un non-tableau', () => {
    assert.throws(() => assertValidVector(vec(1, 767), DIM));
    assert.throws(() => assertValidVector([...vec(1, 767), NaN], DIM));
    assert.throws(() => assertValidVector([...vec(1, 767), Infinity], DIM));
    assert.throws(() => assertValidVector('abc', DIM));
  });
  it('normalise en L2 et refuse le vecteur nul', () => {
    const n = l2Normalize([3, 4]);
    assert.deepEqual(n, [0.6, 0.8]);
    assert.throws(() => l2Normalize([0, 0]));
  });
  it('sérialise pour pgvector avec JSON.stringify', () => assert.equal(toPgVector([0.5, -1]), '[0.5,-1]'));
});

describe('OllamaEmbeddingService', () => {
  it('un texte donne 768 valeurs sans NaN, normalisées', async () => {
    const { service } = makeService();
    const [v] = await service.embedTexts(['title: none | text: bonjour']);
    assert.equal(v.length, 768);
    assert.ok(v.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  });

  it('n’ajoute aucun préfixe aux textes reçus', async () => {
    const { service } = makeService();
    await service.embedTexts(['title: none | text: a']);
    assert.deepEqual(state.embedCalls, [['title: none | text: a']]);
  });

  it('découpe en lots de 16 au plus et conserve l’ordre', async () => {
    const { service } = makeService();
    const texts = Array.from({ length: 35 }, (_, i) => `t${i}`);
    const out = await service.embedTexts(texts);
    assert.equal(out.length, 35);
    assert.deepEqual(state.embedCalls.map((c) => c.length), [16, 16, 3]);
    assert.deepEqual(state.embedCalls.flat(), texts);
  });

  it('ne fait aucun appel pour une liste vide', async () => {
    const { service } = makeService();
    assert.deepEqual(await service.embedTexts([]), []);
    assert.equal(state.embedCalls.length, 0);
  });

  it('refuse (sans rien renvoyer) un vecteur de mauvaise dimension ou contenant un NaN', async () => {
    const { service } = makeService();
    state.embed = () => ({ status: 200, body: { embeddings: [vec(1, 256)] } });
    await assert.rejects(service.embedTexts(['x']), /Embedding invalide/);
    // JSON ne porte pas NaN : Ollama renverrait null, rejeté comme valeur non numérique.
    state.embed = () => ({ status: 200, body: { embeddings: [[...vec(1, 767), null]] } });
    await assert.rejects(service.embedTexts(['x']), /Embedding invalide/);
  });

  it('refuse une réponse dont le nombre d’embeddings ne correspond pas', async () => {
    const { service } = makeService();
    state.embed = () => ({ status: 200, body: { embeddings: [vec(1)] } });
    await assert.rejects(service.embedTexts(['a', 'b']), /2 textes/);
  });

  it('réessaie deux fois après une erreur 5xx, puis réussit', async () => {
    const { service } = makeService();
    let n = 0;
    state.embed = (input) => (++n < 3 ? { status: 500, body: {} } : okEmbed(input));
    const [v] = await service.embedTexts(['x']);
    assert.equal(v.length, 768);
    assert.equal(state.embedCalls.length, 3);
  });

  it('échoue en 503 MATCHING_UNAVAILABLE après trois tentatives', async () => {
    const { service } = makeService();
    state.embed = () => ({ status: 500, body: {} });
    await assert.rejects(service.embedTexts(['x']), (e: Error) => {
      assert.ok(e instanceof ServiceUnavailableException);
      assert.equal(e.getStatus(), 503);
      assert.equal(e.message, 'MATCHING_UNAVAILABLE');
      return true;
    });
    assert.equal(state.embedCalls.length, 3);
  });

  it('ne réessaie pas une erreur 4xx (modèle inconnu)', async () => {
    const { service } = makeService();
    state.embed = () => ({ status: 404, body: { error: 'model not found' } });
    await assert.rejects(service.embedTexts(['x']), (e: Error) => e.message === 'MATCHING_UNAVAILABLE');
    assert.equal(state.embedCalls.length, 1);
  });

  it('abandonne une requête qui ne répond pas (timeout)', { timeout: 60_000 }, async () => {
    const { service } = makeService();
    state.embed = () => 'hang';
    const started = Date.now();
    await assert.rejects(service.embedTexts(['x']), (e: Error) => e.message === 'MATCHING_UNAVAILABLE');
    assert.ok(Date.now() - started >= 10_000, 'timeout de 10 s respecté');
  });

  it('Ollama arrêté : 503 MATCHING_UNAVAILABLE', async () => {
    const { service } = makeService('http://127.0.0.1:9');
    await assert.rejects(service.embedTexts(['x']), (e: Error) => e.message === 'MATCHING_UNAVAILABLE');
    assert.equal(await service.isAvailable(), false);
  });

  it('embedQuery préfixe la requête et la met en cache Redis (clé emb:q:sha256)', async () => {
    const { service, redis } = makeService();
    const first = await service.embedQuery('diagonalisation de matrices');
    assert.deepEqual(state.embedCalls, [['task: search result | query: diagonalisation de matrices']]);
    const keys = [...redis.store.keys()];
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^emb:q:[0-9a-f]{64}$/);
    const second = await service.embedQuery('diagonalisation de matrices');
    assert.deepEqual(second, first);
    assert.equal(state.embedCalls.length, 1, 'le second appel vient du cache');
  });

  it('ignore une entrée de cache d’une autre dimension et la recalcule', async () => {
    const { service, redis } = makeService();
    await service.embedQuery('q');
    const [key] = [...redis.store.keys()];
    redis.store.set(key, JSON.stringify([1, 2, 3]));
    const v = await service.embedQuery('q');
    assert.equal(v.length, 768);
    assert.equal(state.embedCalls.length, 2);
  });

  describe('vérification du modèle', () => {
    it('onModuleInit : modèle présent ⇒ disponible', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      assert.equal(await service.isAvailable(), true);
    });

    it('modèle absent ⇒ le démarrage ne plante pas, matching indisponible', async () => {
      state.models = ['autre-modele:latest'];
      const { service } = makeService();
      await service.onModuleInit();
      assert.equal(await service.isAvailable(), false);
      await assert.rejects(service.assertAvailable(), (e: Error) => e.message === 'MATCHING_UNAVAILABLE');
    });

    it('Ollama injoignable au démarrage ⇒ pas d’exception', async () => {
      const { service } = makeService('http://127.0.0.1:9');
      await assert.doesNotReject(service.onModuleInit());
      assert.equal(await service.isAvailable(), false);
    });

    it('ne télécharge jamais de modèle (aucun appel /api/pull)', async () => {
      state.models = [];
      const calls: string[] = [];
      server.on('request', (req) => calls.push(String(req.url)));
      const { service } = makeService();
      await service.onModuleInit();
      server.removeAllListeners('request');
      server.on('request', handler);
      assert.ok(calls.every((u) => u === '/api/tags'), calls.join(','));
    });

    it('« nom » et « nom:latest » désignent le même modèle', async () => {
      state.models = [MODEL.split(':')[0] + ':latest'];
      const cfg = { ollamaUrl: baseUrl, embeddingModel: MODEL.split(':')[0], embeddingDim: DIM } as AppConfig;
      const service = new OllamaEmbeddingService(cfg, memoryRedis() as unknown as RedisService);
      await service.onModuleInit();
      assert.equal(await service.isAvailable(), true);
    });

    it('préchauffe le modèle au démarrage sans bloquer, et seulement s’il est présent', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual(state.embedCalls, [['warm-up']]);
      state.embedCalls = [];
      state.models = [];
      const absent = makeService().service;
      await absent.onModuleInit();
      await new Promise((r) => setTimeout(r, 100));
      assert.deepEqual(state.embedCalls, []);
    });

    it('l’état est mis en cache 10 s (un seul /api/tags)', async () => {
      const { service } = makeService();
      await service.onModuleInit();
      await service.isAvailable();
      await service.isAvailable();
      assert.equal(state.tagCalls, 1);
    });

    it('se rétablit quand Ollama revient (réévalué après le délai)', async () => {
      state.models = [];
      const { service } = makeService();
      await service.onModuleInit();
      assert.equal(await service.isAvailable(), false);
      state.models = [MODEL];
      (service as unknown as { status: { checkedAt: number } }).status.checkedAt = Date.now() - 11_000;
      assert.equal(await service.isAvailable(), true);
    });
  });
});

describe('garde et sonde de santé', () => {
  it('le garde laisse passer quand le matching est disponible', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    assert.equal(await new MatchingAvailableGuard(service).canActivate(), true);
  });

  it('le garde renvoie 503 MATCHING_UNAVAILABLE quand Ollama est arrêté', async () => {
    const { service } = makeService('http://127.0.0.1:9');
    await assert.rejects(new MatchingAvailableGuard(service).canActivate(), (e: ServiceUnavailableException) => {
      assert.equal(e.getStatus(), 503);
      assert.equal(e.message, 'MATCHING_UNAVAILABLE');
      return true;
    });
  });

  it('/health répond ok dans les deux cas et expose l’état du matching', async () => {
    const up = makeService().service;
    assert.deepEqual(await new HealthController(up).health(), { status: 'ok', matching: 'available' });
    const down = makeService('http://127.0.0.1:9').service;
    assert.deepEqual(await new HealthController(down).health(), { status: 'ok', matching: 'unavailable' });
  });
});
