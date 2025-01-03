ARG ALPINE_VERSION
ARG BLESTA_DOWNLOAD_ID
ARG BLESTA_VERSION
ARG PHP_VERSION

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

USER 0:0
RUN install -d -o 65532 -g 65532 -m 0700 /usr/local/src/blesta
USER 65532:65532

RUN true \
  && curl -fsSLOJ --output-dir "/tmp/" "https://account.blesta.com/plugin/download_manager/client_main/download/${BLESTA_DOWNLOAD_ID}/" \
  && ls -la /tmp \
  && unzip -qd /usr/local/src/blesta "/tmp/blesta-${BLESTA_VERSION}.zip" \
  && rm -f "/tmp/blesta-${BLESTA_VERSION}.zip" \
  && true

################################################################################
# Ioncube Source
################################################################################
FROM base AS source-ioncube

USER 0:0
RUN install -d -o 65532 -g 65532 -m 0700 /usr/local/src/ioncube
USER 65532:65532

RUN true \
  && ARCH="$(uname -m | sed -e 's/x86_64/x86-64/;s/aarch64/aarch64/;t;d')" \
  && if [ -z "${ARCH}" ]; then echo "Unknown architecture: $(uname -m)" 2>&1 && exit 1; fi \
  && curl -fsSLo "/tmp/ioncube.tar.gz" "https://downloads.ioncube.com/loader_downloads/ioncube_loaders_lin_${ARCH}.tar.gz" \
  && tar -xf "/tmp/ioncube.tar.gz" -C /usr/local/src/ioncube --strip-components=1 \
  && rm -f "/tmp/ioncube.tar.gz" \
  && true

################################################################################
# Vector Source
################################################################################
FROM base AS source-vector

COPY --chown=0:0 --chmod=555 --from=docker.io/timberio/vector:latest-alpine /usr/local/bin/vector /usr/local/bin/vector

################################################################################
# Runtime
################################################################################
FROM base AS image
ARG PHP_VERSION

USER 0:0
RUN true \
  # Strip dots from PHP version
  && PHP_VERSION=$(echo "${PHP_VERSION}" | tr -d '.') \
  # Install system dependencies
  && apk add --no-cache \
  envsubst \
  inotify-tools \
  nginx \
  "php${PHP_VERSION}" \
  "php${PHP_VERSION}-curl" \
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
  /opt/ioncube \
  && install -d -o 65532 -g 65532 -m 0750 \
  /var/tmp/blesta \
  /var/tmp/nginx \
  /var/tmp/nginx/client-body \
  /var/tmp/nginx/fastcgi \
  /var/tmp/nginx/proxy \
  /var/tmp/nginx/scgi \
  /var/tmp/nginx/uwsgi \
  /var/tmp/php \
  /var/tmp/php/misc \
  /var/tmp/php/sessions \
  /var/tmp/php/uploads \
  /var/tmp/php/wsdl \
  /var/tmp/vector \
  && mv /opt/blesta/public/config /opt/blesta/public/config-default \
  && install -d -o 65532 -g 65532 -m 0750 \
  /opt/blesta/data \
  /opt/blesta/data/cache \
  /opt/blesta/data/config \
  /opt/blesta/data/logs \
  /opt/blesta/data/uploads \
  && rm -rf /opt/blesta/public/cache /opt/blesta/public/config \
  && ln -sf /opt/blesta/data/cache /opt/blesta/public/cache \
  && ln -sf /opt/blesta/data/config /opt/blesta/public/config \
  && ln -sf /run/php.ini /etc/php/conf.d/99-custom.ini \
  && true
USER 65532:65532

COPY --chown=0:0 --chmod=755 docker/s6-fatal /usr/local/bin/s6-fatal
COPY --chown=0:0 --from=source-vector /usr/local/bin/vector /usr/local/bin/vector
COPY --chown=0:0 --from=source-ioncube /usr/local/src/ioncube/ioncube_loader_lin_${PHP_VERSION}.so /opt/ioncube/ioncube_loader_lin.so

COPY --chown=0:0 docker/nginx.conf /etc/nginx/nginx.conf.tpl
COPY --chown=0:0 docker/php-custom.ini /etc/php/conf.d/99-custom.ini.tpl
COPY --chown=0:0 docker/php-fpm.conf /etc/php/php-fpm.conf
COPY --chown=0:0 docker/s6-rc.d/ /etc/s6-overlay/s6-rc.d/
COPY --chown=0:0 docker/supercronic /etc/supercronic
COPY --chown=0:0 docker/vector.toml /etc/vector.toml

ENV S6_KILL_GRACETIME="0"
ENV S6_READ_ONLY_ROOT="1"
ENV S6_VERBOSITY="2"

ENV BLESTA_CRON_SCHEDULE="* * * * *"
ENV BLESTA_MEMORY_LIMIT="256M"
ENV BLESTA_UPLOAD_LIMIT="25M"

ENTRYPOINT [ "/init" ]
VOLUME [ "/opt/blesta/data" ]
VOLUME [ "/var/tmp" ]
