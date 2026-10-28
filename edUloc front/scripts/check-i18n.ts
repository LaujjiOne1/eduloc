/**
 * Vérifie les traductions : `npm run i18n:check`.
 *  1. chaque langue a exactement les clés du français, avec les mêmes variables {{x}} ;
 *  2. les formes plurielles (`_one` / `_other`) vont par paires ;
 *  3. chaque appel t("clé", { … }) du code cible une clé existante et fournit toutes ses variables.
 * Code de sortie 1 au moindre écart (utilisable en CI).
 */
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const LOCALES = path.join(SRC, "i18n", "locales");
const REFERENCE = "fr";

type Flat = Map<string, string>;
const problems: string[] = [];
const report = (message: string) => problems.push(message);

function flatten(value: unknown, prefix: string, out: Flat) {
  if (typeof value === "string") out.set(prefix, value);
  else if (Array.isArray(value)) out.set(prefix, JSON.stringify(value));
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
}

function loadLanguage(code: string): Flat {
  const dir = path.join(LOCALES, code);
  const out: Flat = new Map();
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    flatten(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")), file.replace(/\.json$/, ""), out);
  }
  return out;
}

const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].sort();
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const languages = fs.readdirSync(LOCALES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const flats = new Map(languages.map((code) => [code, loadLanguage(code)]));
const reference = flats.get(REFERENCE);
if (!reference) throw new Error(`Langue de référence « ${REFERENCE} » introuvable dans ${LOCALES}`);

// 1 + 2 : parité entre langues
for (const [code, flat] of flats) {
  if (code === REFERENCE) continue;
  for (const [key, text] of reference) {
    const other = flat.get(key);
    if (other === undefined) report(`[${code}] clé manquante : ${key}`);
    else if (placeholders(text).join() !== placeholders(other).join() && !PLURAL_SUFFIX.test(key)) report(`[${code}] variables différentes pour ${key} : ${placeholders(text)} ≠ ${placeholders(other)}`);
    else if (other.trim() === "") report(`[${code}] traduction vide : ${key}`);
  }
  for (const key of flat.keys()) if (!reference.has(key)) report(`[${code}] clé en trop (absente du français) : ${key}`);
}
for (const [code, flat] of flats) {
  for (const key of flat.keys()) {
    const match = key.match(PLURAL_SUFFIX);
    if (match && match[1] === "one" && !flat.has(key.replace(PLURAL_SUFFIX, "_other"))) report(`[${code}] forme plurielle incomplète (pas de _other) : ${key}`);
  }
}

// 3 : appels t() du code
function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSources(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}
const TRANSLATORS = new Set(["t", "tr", "translate"]);
let calls = 0;
for (const file of listSources(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const where = (node: ts.Node) => `${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && TRANSLATORS.has(node.expression.text) && node.arguments.length > 0) {
      const keyArg = node.arguments[0];
      const keys = ts.isStringLiteralLike(keyArg)
        ? [keyArg.text]
        : ts.isConditionalExpression(keyArg) && ts.isStringLiteralLike(keyArg.whenTrue) && ts.isStringLiteralLike(keyArg.whenFalse)
          ? [keyArg.whenTrue.text, keyArg.whenFalse.text]
          : [];
      const options = node.arguments[1];
      const given = new Set<string>();
      let spread = false;
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const prop of options.properties) {
          if (ts.isSpreadAssignment(prop)) spread = true;
          else if (prop.name) given.add(prop.name.getText());
        }
      }
      for (const key of keys) {
        calls++;
        const isPlural = !reference.has(key) && reference.has(`${key}_other`);
        const exists = reference.has(key) || isPlural;
        if (!exists) {
          // clés de tableau (returnObjects) ou clé dynamique : seulement si elle existe comme préfixe
          if (![...reference.keys()].some((k) => k.startsWith(`${key}.`))) report(`${where(node)} : clé inconnue « ${key} »`);
          continue;
        }
        if (spread) continue;
        const templates = isPlural ? [...reference].filter(([k]) => k.startsWith(`${key}_`) && PLURAL_SUFFIX.test(k)).map(([, v]) => v) : [reference.get(key) as string];
        const needed = new Set(templates.flatMap(placeholders));
        if (isPlural) needed.add("count");
        for (const name of needed) if (!given.has(name)) report(`${where(node)} : « ${key} » attend la variable {{${name}}}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (problems.length) {
  console.error(`${problems.length} problème(s) de traduction :\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Traductions OK — ${languages.length} langue(s) (${languages.join(", ")}), ${reference.size} clés, ${calls} appels t() vérifiés.`);
