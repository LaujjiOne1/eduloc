# PostgreSQL 16 + PostGIS (géolocalisation) + pgvector (recherche sémantique, voir eduloc-recherche-semantique.md).
# Même base Alpine que l'image postgis d'origine : le volume `pgdata` existant reste lisible (pas de changement de libc/collation).
FROM postgis/postgis:16-3.4-alpine

ARG PGVECTOR_VERSION=v0.8.0

# with_llvm=no : pas de bitcode JIT, donc pas besoin de clang/llvm pour compiler l'extension.
RUN apk add --no-cache --virtual .pgvector-build git build-base postgresql16-dev \
 && git clone --branch "${PGVECTOR_VERSION}" --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
 && make -C /tmp/pgvector install with_llvm=no \
 && rm -rf /tmp/pgvector \
 && apk del .pgvector-build
