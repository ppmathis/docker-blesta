import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = ['run', '--rm', '--network', 'none', '--entrypoint', 'sh'];
if (process.env.BLESTA_PLATFORM) args.push('--platform', process.env.BLESTA_PLATFORM);
args.push(
  '--mount', `type=bind,source=${resolve('tests/fixtures/v5-services.php')},target=/probe/v5-services.php,readonly`,
  // Also prove that a future image shipping blesta.php cannot replace installed settings.
  '--mount', `type=bind,source=${resolve('tests/fixtures/v5-services.php')},target=/opt/blesta/defaults/config/blesta.php,readonly`,
  process.env.BLESTA_IMAGE ?? 'localhost/blesta:latest',
  '-ec', `
    cp /opt/blesta/defaults/config/* /opt/blesta/data/config/
    cp /opt/blesta/data/config/blesta-new.php /opt/blesta/data/config/blesta.php
    printf '\n// Persisted installation settings\n' >> /opt/blesta/data/config/blesta.php
    case "$BLESTA_VERSION" in
      5.*)
        for config in /opt/blesta/data/config/*.php; do
          printf '\n// Existing v5 customization\n' >> "$config"
        done
        rm /opt/blesta/data/config/blesta-new.php
        sha256sum /opt/blesta/data/config/*.php > /tmp/preserved-v5-config.sha256
        ;;
      *)
        for config in /opt/blesta/defaults/config/*; do
          name=\${config##*/}
          if [ "$name" != blesta.php ]; then
            printf '<?php // Stale image-provided configuration\n' > "/opt/blesta/data/config/$name"
          fi
        done
        cp /probe/v5-services.php /opt/blesta/data/config/services.php
        ;;
    esac
    installed_config=$(sha256sum /opt/blesta/data/config/blesta.php)
    execlineb -P /etc/s6-overlay/s6-rc.d/blesta-init/up
    test "$installed_config" = "$(sha256sum /opt/blesta/data/config/blesta.php)" || {
      echo 'Installed blesta.php was modified' >&2
      exit 1
    }
    php -r 'try {
      require "/opt/blesta/public/lib/init.php";
      new ReflectionClass("Security");
      require "/opt/blesta/public/plugins/cms/cms_model.php";
    } catch (Throwable $e) {
      fwrite(STDERR, get_class($e) . ": " . $e->getMessage() . "\\n");
      exit(1);
    }'
    case "$BLESTA_VERSION" in
      5.*)
        sha256sum -c /tmp/preserved-v5-config.sha256 > /dev/null
        cmp /opt/blesta/defaults/config/blesta-new.php /opt/blesta/data/config/blesta-new.php
        ;;
      *)
        for config in /opt/blesta/defaults/config/*; do
          name=\${config##*/}
          if [ "$name" != blesta.php ]; then
            cmp "$config" "/opt/blesta/data/config/$name"
          fi
        done
        ;;
    esac
  `,
);
const result = spawnSync('docker', args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Version-specific config policy passes; installed blesta.php remains unchanged.');
