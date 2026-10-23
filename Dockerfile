# syntax=docker/dockerfile:1

FROM node:22.18.0-bookworm-slim AS node-base

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM node-base AS deps

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.json tsconfig.base.json ./

RUN npm install --no-audit --no-fund

FROM node-base AS runtime

ARG DBT_CORE_VERSION=1.10.23
ARG DBT_DREMIO_VERSION=1.10.1
ARG PYTHON_VERSION=3.11

ENV DBT_CORE_VERSION=${DBT_CORE_VERSION} \
    DBT_DREMIO_VERSION=${DBT_DREMIO_VERSION} \
    DBT_BIN=dbt \
    DBT_PYTHON_BIN=python3 \
    WORKSPACE_ROOT=/workspaces

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        python3 \
        python3-pip \
        python3-venv \
        build-essential \
    && python3 -m venv /opt/dbt \
    && /opt/dbt/bin/pip install --no-cache-dir \
        "dbt-core==${DBT_CORE_VERSION}" \
        "dbt-dremio==${DBT_DREMIO_VERSION}" \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/dbt/bin:${PATH}"

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && mkdir -p /workspaces \
    && chown -R node:node /app /workspaces

USER node

EXPOSE 4000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["api"]
