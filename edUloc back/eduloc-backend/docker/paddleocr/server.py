"""Service OCR d'EduLoc (PaddleOCR, CPU) : image -> texte dans l'ordre de lecture.

Un PDF est rastérisé ici page par page (PyMuPDF, sans poppler) : le backend n'a rien à installer.
Le service reste interne (réseau « eduloc »), sans authentification.

POST /ocr  (multipart « file » : PNG / JPEG / PDF)  ->  {"text": "...", "lines": [{"text", "confidence", "box"}], "columns": 1|2}
GET  /health
"""
from __future__ import annotations

import io
import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

LANG = os.environ.get("OCR_LANG", "fr")
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "2600"))
MIN_CONFIDENCE = float(os.environ.get("OCR_MIN_CONFIDENCE", "0.45"))
PDF_DPI = int(os.environ.get("OCR_PDF_DPI", "130"))
# Le classifieur d'orientation (cls) ralentit chaque ligne de ~25 % et ne sert qu'aux photos prises de travers.
ANGLE_CLS = os.environ.get("OCR_ANGLE_CLS", "false").lower() == "true"
MAX_PDF_PAGES = int(os.environ.get("OCR_MAX_PDF_PAGES", "6"))

app = FastAPI(title="eduloc-paddleocr")
_engine = None
_lock = threading.Lock()  # PaddleOCR n'est pas réentrant : un appel à la fois


def engine():
    global _engine
    if _engine is None:
        from paddleocr import PaddleOCR  # import tardif : le démarrage reste rapide, les modèles se chargent au premier appel

        _engine = PaddleOCR(use_angle_cls=ANGLE_CLS, lang=LANG, show_log=False, enable_mkldnn=True, cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "4")))
    return _engine


def _box_metrics(box: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    return {"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys), "yc": (min(ys) + max(ys)) / 2, "h": max(ys) - min(ys)}


def split_columns(items: list[dict[str, Any]], width: float) -> list[list[dict[str, Any]]]:
    """Deux colonnes si presque aucun bloc ne traverse le milieu de la page et si les deux moitiés sont bien remplies."""
    if len(items) < 8 or width <= 0:
        return [items]
    mid = width / 2
    left = [i for i in items if i["x1"] <= mid * 1.04]
    right = [i for i in items if i["x0"] >= mid * 0.96]
    crossing = [i for i in items if i not in left and i not in right]
    if len(left) >= 4 and len(right) >= 4 and len(crossing) <= max(2, len(items) * 0.12):
        # Les blocs qui traversent (titre, nom en en-tête) restent au-dessus : on les lit d'abord.
        return [crossing, left, right]
    return [items]


def read_order(items: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Regroupe les blocs en lignes (même hauteur) puis lit chaque ligne de gauche à droite."""
    items = sorted(items, key=lambda i: (i["yc"], i["x0"]))
    rows: list[list[dict[str, Any]]] = []
    for item in items:
        if rows and abs(item["yc"] - rows[-1][0]["yc"]) <= max(item["h"], rows[-1][0]["h"]) * 0.6:
            rows[-1].append(item)
        else:
            rows.append([item])
    return [sorted(row, key=lambda i: i["x0"]) for row in rows]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "lang": LANG}


def ocr_image(image: Image.Image) -> dict[str, Any]:
    """Une page (image PIL) -> texte dans l'ordre de lecture, lignes et nombre de colonnes."""
    scale = 1.0
    if max(image.size) > MAX_SIDE:  # évite des minutes de calcul sur une photo 12 Mpx
        scale = MAX_SIDE / max(image.size)
        image = image.resize((int(image.width * scale), int(image.height * scale)))

    with _lock:
        result = engine().ocr(np.array(image), cls=ANGLE_CLS)

    detections = (result[0] if result else None) or []
    items: list[dict[str, Any]] = []
    for box, (text, confidence) in detections:
        text = (text or "").strip()
        if not text or confidence < MIN_CONFIDENCE:
            continue
        items.append({"text": text, "confidence": float(confidence), "box": box, **_box_metrics(box)})

    columns = split_columns(items, float(image.width))
    ordered_rows: list[list[dict[str, Any]]] = []
    for group in columns:
        ordered_rows.extend(read_order(group))

    text = "\n".join(" ".join(i["text"] for i in row) for row in ordered_rows)
    lines = [
        {"text": i["text"], "confidence": round(i["confidence"], 3), "box": [[round(p[0] / scale), round(p[1] / scale)] for p in i["box"]]}
        for row in ordered_rows
        for i in row
    ]
    return {"text": text, "lines": lines, "columns": 2 if len(columns) == 3 else 1}


def pdf_pages(raw: bytes) -> list[Image.Image]:
    import fitz  # PyMuPDF : import tardif, comme PaddleOCR

    document = fitz.open(stream=raw, filetype="pdf")
    pages: list[Image.Image] = []
    for index in range(min(document.page_count, MAX_PDF_PAGES)):
        pixmap = document[index].get_pixmap(dpi=PDF_DPI)
        pages.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
    return pages


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Fichier vide")
    is_pdf = raw[:5] == b"%PDF-"
    try:
        images = pdf_pages(raw) if is_pdf else [Image.open(io.BytesIO(raw)).convert("RGB")]
    except Exception as exc:  # noqa: BLE001 — tout fichier illisible est un 422
        raise HTTPException(status_code=422, detail=f"Fichier illisible : {exc}") from exc
    if not images:
        raise HTTPException(status_code=422, detail="Aucune page")

    pages = [ocr_image(image) for image in images]
    # Un PDF : le texte des pages bout à bout (le backend n'a besoin que du texte).
    return {
        "text": "\n".join(p["text"] for p in pages),
        "lines": [line for p in pages for line in p["lines"]],
        "columns": max(p["columns"] for p in pages),
        "pages": len(pages),
    }
