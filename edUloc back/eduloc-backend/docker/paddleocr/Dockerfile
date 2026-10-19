# OCR des CV et justificatifs : PaddleOCR (CPU) derrière une petite API HTTP interne.
# Les modèles (détection, reconnaissance française, orientation) sont téléchargés au premier appel puis conservés
# dans le volume paddleocr_models : le premier CV est plus lent, les suivants non.
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PADDLEOCR_HOME=/models \
    OMP_NUM_THREADS=4

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Versions épinglées : paddleocr 2.7 ↔ paddlepaddle 2.6.2 ↔ numpy < 2 (incompatibilités connues sinon).
# Une couche par gros paquet : sur une connexion lente ou coupée (« do not match the hashes » = téléchargement tronqué),
# ce qui est déjà installé reste en cache et un nouveau build repart de là.
ENV PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10 PIP_NO_CACHE_DIR=1
RUN pip install "numpy<2" "pillow<11"
RUN pip install "paddlepaddle==2.6.2"
RUN pip install scipy
RUN pip install "opencv-python-headless<4.10"
RUN pip install "paddleocr==2.7.3"
RUN pip install "pymupdf==1.24.14"
RUN pip install "fastapi==0.115.6" "uvicorn[standard]==0.34.0" "python-multipart==0.0.20"

# paddleocr installe opencv-python (et non « headless ») : il lui faut libGL. Couche placée APRÈS les paquets pip pour ne pas
# invalider leur cache (le build complet est long sur une connexion lente).
RUN apt-get update     && apt-get install -y --no-install-recommends libgl1     && rm -rf /var/lib/apt/lists/*

COPY server.py .

EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]
