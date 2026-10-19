/**
 * Événements outbox traités par le module matching (indexation sémantique), pas par le relay générique :
 * leur traitement appelle Ollama et peut dépasser le délai de la transaction du relay.
 */
export const TUTOR_SEARCH_REINDEX = 'TUTOR_SEARCH_REINDEX';
export const TUTOR_DOCUMENT_EXTRACT = 'TUTOR_DOCUMENT_EXTRACT';
/** Import de CV : OCR + extraction par un LLM (plusieurs dizaines de secondes), traités hors de la transaction du relay. */
export const CV_IMPORT_PROCESS = 'CV_IMPORT_PROCESS';
export const INDEXING_EVENT_TYPES = [TUTOR_SEARCH_REINDEX, TUTOR_DOCUMENT_EXTRACT, CV_IMPORT_PROCESS] as const;
