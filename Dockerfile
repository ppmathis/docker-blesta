ARG ALPINE_VERSION
ARG BLESTA_DOWNLOAD_ID
ARG BLESTA_VERSION
ARG PHP_VERSION
ARG VECTOR_IMAGE="docker.io/timberio/vector:0.58.0-alpine@sha256:5dcf67db0ee378caa87f3395cb9484ebe3e97bb0334d119f2ac33116e00c5773"

################################################################################
# Alpine Base
################################################################################
FROM docker.io/library/alpine:${ALPINE_VERSION:-latest} AS base
ARG ALPINE_VERSION
ARG BLESTA_DOWNLOAD_ID
ARG BLESTA_VERSION
ARG PHP_VERSION

RUN true \
  && fatal() { echo "FATAL: $*" 1>&2; exit 1; } \
  && (test -n "${ALPINE_VERSION}" || fatal "ALPINE_VERSION is not set") \
  && (test -n "${BLESTA_DOWNLOAD_ID}" || fatal "BLESTA_DOWNLOAD_ID is not set") \
  && (test -n "${BLESTA_VERSION}" || fatal "BLESTA_VERSION is not set") \
  && (test -n "${PHP_VERSION}" || fatal "PHP_VERSION is not set") \
  && true

RUN true \
  && apk add --no-cache curl \
  && addgroup -g 65532 nonroot \
  && adduser -D -u 65532 -G nonroot -H -h /home/nonroot nonroot \
  && install -d -o 65532 -g 65532 -m 0755 /home/nonroot \
  && true

USER 65532:65532

################################################################################
# Blesta Source
################################################################################
FROM base AS source-blesta
ARG BLESTA_VERSION
ARG BLESTA_DOWNLOAD_ID
ARG BLESTA_SHA256

USER 0:0
RUN install -d -o 65532 -g 65532 -m 0700 /usr/local/src/blesta
USER 65532:65532

RUN true \
  && curl --retry 3 -fsSL -o "/tmp/blesta-${BLESTA_VERSION}.zip" "https://account.blesta.com/plugin/download_manager/client_main/download/${BLESTA_DOWNLOAD_ID}/" \
  && echo "${BLESTA_SHA256}  /tmp/blesta-${BLESTA_VERSION}.zip" | sha256sum -c - \
  && unzip -qd /usr/local/src/blesta "/tmp/blesta-${BLESTA_VERSION}.zip" \
  && rm -f "/tmp/blesta-${BLESTA_VERSION}.zip" \
  && true

################################################################################
# Ioncube Source
################################################################################
FROM base AS source-ioncube
ARG IONCUBE_VERSION
ARG IONCUBE_SHA256_AMD64
ARG IONCUBE_SHA256_ARM64
ARG IONCUBE_FLAVOR_AMD64="lin"
ARG PHP_VERSION

USER 0:0
RUN install -d -o 65532 -g 65532 -m 0700 /usr/local/src/ioncube
USER 65532:65532

RUN true \
  && ARCH="$(uname -m | sed -e 's/x86_64/x86-64/;s/aarch64/aarch64/;t;d')" \
  && if [ -z "${ARCH}" ]; then echo "Unknown architecture: $(uname -m)" 2>&1 && exit 1; fi \
  && case "${ARCH}" in x86-64) CHECKSUM="${IONCUBE_SHA256_AMD64}"; FLAVOR="${IONCUBE_FLAVOR_AMD64}" ;; aarch64) CHECKSUM="${IONCUBE_SHA256_ARM64}"; FLAVOR="lin" ;; esac \
  && curl --retry 3 -fsSLo "/tmp/ioncube.tar.gz" "https://downloads.ioncube.com/loader_downloads/ioncube_loaders_${FLAVOR}_${ARCH}_${IONCUBE_VERSION}.tar.gz" \
  && echo "${CHECKSUM}  /tmp/ioncube.tar.gz" | sha256sum -c - \
  && tar -xf "/tmp/ioncube.tar.gz" -C /usr/local/src/ioncube --strip-components=1 \
  && cp "/usr/local/src/ioncube/ioncube_loader_${FLAVOR}_${PHP_VERSION}.so" /usr/local/src/ioncube/loader.so \
  && rm -f "/tmp/ioncube.tar.gz" \
  && true

################################################################################
# Vector Source
################################################################################
FROM ${VECTOR_IMAGE} AS source-vector

################################################################################
# Runtime
################################################################################
FROM base AS image
ARG BLESTA_MEMORY_LIMIT="256M"
ARG BLESTA_PHP_DISABLE_FUNCTIONS="highlight_file, show_source"
ARG BLESTA_PHP_OPEN_BASEDIR="/bin:/opt/blesta:/usr:/var/tmp/blesta:/var/tmp/php"
ARG PHP_EXTRA_EXTENSIONS=""
ARG PHP_VERSION
ARG BLESTA_VERSION

USER 0:0
# TCPDF probes system paths unless its local image directory exists.
RUN install -d -o 0 -g 0 -m 0755 /opt/blesta/public/vendors/tecnickcom/tcpdf/images

RUN true \
  # Strip dots from PHP version
  && PHP_VERSION=$(echo "${PHP_VERSION}" | tr -d '.') \
  # Build the major-version-specific extension package list
  && set -- \
  && for EXTENSION in ${PHP_EXTRA_EXTENSIONS}; do set -- "$@" "php${PHP_VERSION}-${EXTENSION}"; done \
  # Install system dependencies
  && apk add --no-cache \
  envsubst \
  inotify-tools \
  mariadb-client \
  nginx \
  "php${PHP_VERSION}" \
  "php${PHP_VERSION}-openssl" \
  "php${PHP_VERSION}-zip" \
  "php${PHP_VERSION}-dom" \
  "php${PHP_VERSION}-xmlreader" \
  "php${PHP_VERSION}-xmlwriter" \
  "php${PHP_VERSION}-opcache" \
  "php${PHP_VERSION}-curl" \
  "php${PHP_VERSION}-fileinfo" \
  "php${PHP_VERSION}-fpm" \
  "php${PHP_VERSION}-gd" \
  "php${PHP_VERSION}-gmp" \
  "php${PHP_VERSION}-iconv" \
  "php${PHP_VERSION}-imap" \
  "php${PHP_VERSION}-mbstring" \
  "php${PHP_VERSION}-pdo" \
  "php${PHP_VERSION}-pdo_mysql" \
  "php${PHP_VERSION}-pecl-mailparse" \
  "php${PHP_VERSION}-session" \
  "php${PHP_VERSION}-simplexml" \
  "php${PHP_VERSION}-soap" \
  "php${PHP_VERSION}-xml" \
  s6-overlay \
  supercronic \
  "$@" \
  # Manage version-less PHP symlinks
  && ln -sf "/usr/bin/php${PHP_VERSION}" /usr/bin/php \
  && ln -sf "/usr/sbin/php-fpm${PHP_VERSION}" /usr/sbin/php-fpm \
  && ln -sf "/etc/php${PHP_VERSION}" /etc/php \
  # Cleanup Nginx configuration
  && find /etc/nginx -mindepth 1 \
  ! -name 'fastcgi.conf' \
  ! -name 'modules' \
  ! -name 'mime.types' \
  -delete \
  # Cleanup PHP configuration
  && find /etc/php -mindepth 1 \
  ! -name 'php.ini' \
  ! -name 'conf.d' \
  -delete \
  && true

USER 65532:65532

COPY --chown=0:0 --from=source-blesta /usr/local/src/blesta/blesta /opt/blesta/public

USER 0:0
RUN true \
  && install -d -o 0 -g 0 -m 0755 \
  /opt/blesta \
  /opt/blesta/defaults \
  /opt/blesta/defaults/config \
  /opt/ioncube \
  && cp -a /opt/blesta/public/config/. /opt/blesta/defaults/config/ \
  && chmod -R go-w /opt/blesta/defaults/config \
  && install -d -o 65532 -g 65532 -m 0750 \
  /opt/blesta/data \
  /opt/blesta/data/cache \
  /opt/blesta/data/config \
  /opt/blesta/data/logs \
  /opt/blesta/data/uploads \
  /var/tmp \
  && rm -rf /opt/blesta/public/cache /opt/blesta/public/config \
  && ln -sf /opt/blesta/data/cache /opt/blesta/public/cache \
  && ln -sf /opt/blesta/data/config /opt/blesta/public/config \
  && ln -sf /opt/blesta/data/cache /opt/blesta/cache_blesta \
  && ln -sf /opt/blesta/data/logs /opt/blesta/logs_blesta \
  && ln -sf /opt/blesta/data/uploads /opt/blesta/uploads \
  && printf 'zend_extension = /opt/ioncube/ioncube_loader_lin.so\n' > /etc/php/conf.d/00-ioncube.ini \
  && ln -sf /run/php.ini /etc/php/conf.d/99-custom.ini \
  && true
USER 65532:65532

COPY --chown=0:0 --chmod=755 docker/s6-fatal /usr/local/bin/s6-fatal
COPY --chown=0:0 --chmod=755 docker/blesta-cron /usr/local/bin/blesta-cron
COPY --chown=0:0 --chmod=555 --from=source-vector /usr/local/bin/vector /usr/local/bin/vector
COPY --chown=0:0 --from=source-ioncube /usr/local/src/ioncube/loader.so /opt/ioncube/ioncube_loader_lin.so

COPY --chown=0:0 --chmod=444 docker/health.php /opt/blesta/health.php
RUN php -r 'require "/opt/blesta/health.php"; if (http_response_code() !== 204) { exit(1); }'
COPY --chown=0:0 docker/nginx.conf /etc/nginx/nginx.conf.tpl
COPY --chown=0:0 docker/php-custom.ini /etc/php/conf.d/99-custom.ini.tpl.in
COPY --chown=0:0 docker/php-fpm.conf /etc/php/php-fpm.conf
COPY --chown=0:0 docker/s6-rc.d/ /etc/s6-overlay/s6-rc.d/
COPY --chown=0:0 docker/supercronic /etc/supercronic
COPY --chown=0:0 docker/vector.toml /etc/vector.toml

USER 0:0
RUN true \
  && envsubst '$BLESTA_PHP_DISABLE_FUNCTIONS $BLESTA_PHP_OPEN_BASEDIR' \
  < /etc/php/conf.d/99-custom.ini.tpl.in \
  > /etc/php/conf.d/99-custom.ini.tpl \
  && rm /etc/php/conf.d/99-custom.ini.tpl.in \
  && envsubst '$BLESTA_VERSION' \
  < /etc/s6-overlay/s6-rc.d/blesta-init/up \
  > /etc/s6-overlay/s6-rc.d/blesta-init/up.generated \
  && mv /etc/s6-overlay/s6-rc.d/blesta-init/up.generated /etc/s6-overlay/s6-rc.d/blesta-init/up \
  && true
USER 65532:65532

ENV S6_KILL_GRACETIME="0"
ENV S6_READ_ONLY_ROOT="1"
ENV S6_VERBOSITY="2"

ENV BLESTA_VERSION="${BLESTA_VERSION}"
ENV PHP_VERSION="${PHP_VERSION}"

ENV BLESTA_CRON_HEALTHCHECK_URL=""
ENV BLESTA_CRON_SCHEDULE="* * * * *"
ENV BLESTA_MEMORY_LIMIT="${BLESTA_MEMORY_LIMIT}"
ENV BLESTA_UPLOAD_LIMIT="25M"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS --max-time 5 http://127.0.0.1:8080/healthz > /dev/null || exit 1

ENTRYPOINT [ "/init" ]
VOLUME [ "/opt/blesta/data" ]
VOLUME [ "/var/tmp" ]
