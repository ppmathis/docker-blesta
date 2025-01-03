<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/ppmathis/docker-blesta/raw/main/assets/blesta-logo-white.png">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/ppmathis/docker-blesta/raw/main/assets/blesta-logo-color.png">
  <img alt="Blesta Logo" src="https://github.com/ppmathis/docker-blesta/raw/main/assets/blesta-logo-color.png" width="300px">
</picture>

# Blesta Docker Image

[![Docker Pulls](https://img.shields.io/docker/pulls/ppmathis/blesta?style=flat)](https://hub.docker.com/r/ppmathis/blesta)
[![GitHub Stars](https://img.shields.io/github/stars/ppmathis/docker-blesta?style=flat)](https://github.com/ppmathis/docker-blesta/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/ppmathis/docker-blesta?style=flat)](https://github.com/ppmathis/docker-blesta/issues)
[![License](https://img.shields.io/github/license/ppmathis/docker-blesta?style=flat)](https://github.com/ppmathis/docker-blesta/blob/main/LICENSE.txt)
[![CI](https://github.com/ppmathis/docker-blesta/actions/workflows/main.yml/badge.svg)](https://github.com/ppmathis/docker-blesta/actions/workflows/main.yml)

This is an unofficial Docker image for [Blesta](https://blesta.com/), the professional client management, billing, and support software provided by Phillips Data, Inc. This image uses the following stack for running Blesta:

- [Alpine Linux](https://alpinelinux.org/), a lightweight Linux distribution
- [Nginx](https://nginx.org/), a high-performance web server
- [PHP-FPM](https://www.php.net/manual/en/install.fpm.php), a FastCGI process manager for PHP
- [s6-overlay](https://github.com/just-containers/s6-overlay), a process supervisor and init system
- [Supercronic](https://github.com/aptible/supercronic), a container-friendly cron scheduler
- [Vector](https://vector.dev/), a high-performance log aggregator

## Features

With security in mind, this image is built with the following features:

- Automatic minutely cron job scheduling for Blesta
- Basic tamper guard to kill the container if config files are edited during runtime
- Best practice configuration for Nginx and PHP-FPM
- Built with minimal set of packages, to reduce the attack surface
- Daily builds with latest packages to ensure security updates
- Fully automated builds with GitHub Actions including SBOM and Provenance
- Multi-architecture support for x86-64 and ARM64
- Proper license handling without static IPs or host-networking
- Running completely rootless as 65532:65532 (nonroot:nonroot)
- Runs out-of-the-box with all required PHP extensions
- Support for `--read-only`, `--cap-drop ALL` and `--security-opt no-new-privileges`
- Unified logging architecture, all Blesta logs are streamed to stdout

To ensure reliable builds and avoid potential breakage due to upstream changes, the image build also executes automated end-to-end tests with [Playwright](https://playwright.dev/), testing the setup procedure, licensing, and some features of Blesta.

Please note that this image is not officially supported by Phillips Data, Inc. and should be used at your own risk. While personally invested to keep this up-to-date and secure, as I'm also running this in production for my own business, I cannot guarantee the same level of support as the official Blesta team. Please report any issues you encounter on the [GitHub repository](https://github.com/ppmathis/docker-blesta/issues).

## Available Images

You may pull this image either from Docker Hub via `ppmathis/blesta` or from GitHub Container Registry via `ghcr.io/ppmathis/blesta`. Both registries are automatically maintained by GitHub Actions and in sync. All images are automatically built on a daily basis to ensure freshness and security.

All images are tagged like `<blesta-version>-php<php-version>`, e.g. `5.10.3-php8.2`, and use the latest available Alpine Linux version that ships with the specified PHP version. You can find a list of all tags by checking the [Docker Hub](https://hub.docker.com/r/ppmathis/blesta/tags) or [GitHub Container Registry](https://github.com/ppmathis/docker-blesta/pkgs/container/blesta) repositories. Please note that while a `latest` tag is available, you should NEVER use it in production, and pin a specific version along with manually testing upgrades in a staging environment.

Missing any specific tag? Feel free to open an issue on the [GitHub repository](https://github.com/ppmathis/docker-blesta/issues) and I'll add it as soon as possible.

## Configuration

The following environment variables must be configured when running this image:

- `BLESTA_ADDRESS` must be the static IPv4 / IPv6 address of the server hosting Blesta. This should not be the container IP, but instead whichever IP the Docker host itself is running on. If your server has a public IP address, use this one. If your server is behind a NAT, use its static private IP address. An example value would be `203.0.113.42`. This value is required for the Blesta licensing system to work correctly.
- `BLESTA_HOST` must be the publicly accessible hostname of the server hosting Blesta. An example value would be `blesta.example.com`. This value is required for the Blesta licensing system to work correctly.

Additionally, further environment variables can be configured. These are not required to be set and already ship with sane defaults, but can be adjusted to your needs:

- `BLESTA_CRON_SCHEDULE` (default: `* * * * *`) sets the cron schedule for Blesta. By default, the cron job runs every minute. Use the special value `#` to disable the cron job completely.
- `BLESTA_MEMORY_LIMIT` (default: `256M`) sets the maximum memory limit for PHP in Blesta.
- `BLESTA_UPLOAD_LIMIT` (default: `25M`) sets the maximum upload size for files in Blesta. Please make sure that your reverse proxy in front of this container also allows uploads of this size.

This image expects you to mount `/opt/blesta/data` to a local directory or Docker volume to persist the Blesta data directory. This directory contains all uploaded files, logs, and other data that should persist across container restarts. An anonymous volume is used by default, but all data will be lost when the container is removed. A second anonymous volume for `/var/tmp` is also defined to store temporary data, but this directory can safely be transient. The container will automatically create missing subdirectories during startup in `/opt/blesta/data` and `/var/tmp/blesta` if they don't exist.

## Deployment

An easy way to deploy this image is using Docker Compose. You may find an example stack in the [compose.yaml](./compose.yaml) file in this repository. To deploy this stack, you must set the following environment variables in a `.env` file in the same directory as your Compose file:

```shell
BLESTA_ADDRESS="<replace-me>" # see next section for details
BLESTA_HOST="<replace-me>" # see next section for details
MARIADB_BLESTA_PASSWORD="<replace-me>" # secure password for the `blesta` database user
MARIADB_ROOT_PASSWORD="<replace-me>" # secure password for the `root` database user
```

Afterwards, you can deploy the stack by simply running `docker compose up -d`. This will expose Blesta on your system via HTTP on port `8080`, customizable via `BLESTA_HTTP_PORT` in the `.env` file. You can access Blesta by navigating to `http://localhost:8080` in your browser. The database information you will need to provide is going to be:

- **Database Host**: `mariadb`
- **Database Port**: `3306`
- **Database Name**: `blesta`
- **Database User**: `blesta`
- **Database Password**: whatever you set in `MARIADB_BLESTA_PASSWORD`

Please note that this is only a basic example. When running in production, you should remove the `ports:` section from the Blesta container and instead use a reverse proxy like Nginx or Traefik to expose Blesta to the public internet with TLS termination.

Should you be interested in quickly spawning up this image for local testing purposes, you can also use the following `docker run` command:

```shell
docker run \
  --name blesta \
  --env BLESTA_ADDRESS="127.0.0.1" \
  --env BLESTA_HOST="localhost" \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run:uid=65532,gid=65532,mode=0755,exec,nodev,nosuid \
  --tmpfs /tmp:uid=65532,gid=65532,mode=2777,noexec,nodev,nosuid \
  ppmathis/blesta:latest
```

## Initial Setup

Once the Blesta container is running, access the regular setup wizard in your browser, and complete both the database and initial admin user setup. Before you enter your license key, ensure that you properly configured `BLESTA_ADDRESS` and `BLESTA_HOST`, and reissue your license key if necessary.

When you're done with the setup and redirected to the Blesta admin panel, you **MUST** head to `Settings -> System -> General -> Basic Setup` and configure the following paths:

- **Root Web Directory** should be correctly set by default to `/opt/blesta/public/`.
- **Temp Directory** must be set to `/var/tmp/blesta/`.
- **Uploads Directory** must be set to `/opt/blesta/data/uploads/`.
- **Log Directory** must be set to `/opt/blesta/data/logs/`.
- **My installation is behind a proxy or load balancer** should be checked if you run this container behind a reverse proxy.

Confirm with the `Update Settings` button and all directories should show up with a checkmark icon, confirming they're accessible and writable. That's all, you're now ready to use Blesta!

## FAQ

### How can I upgrade my Blesta installation?

Before upgrading your Blesta installation, you should consider reading the official [Blesta upgrade guide](https://docs.blesta.com/display/user/Upgrading+Blesta) to be aware of potential breaking changes. Then, you can follow these steps to upgrade your Blesta installation:

- Ensure this repository already has a new image available for the Blesta version you want to upgrade to.
- Backup your current Blesta installation, including the database and the `data/` directory.
- Bump your Blesta container image tag in your Docker Compose file to the new version.
- Head to `/admin/upgrade` in your browser and confirm the upgrade process with `Continue with Upgrade`.

If you encounter any issues during the upgrade process, feel free to reach out to me on the [GitHub repository](https://github.com/ppmathis/docker-blesta/issues).

### How can I ensure that my Blesta installation is secure?

This image is built with security in mind, but there are some additional steps you can take to ensure your Blesta installation is secure:

- Configure two-factor authentication for all your Blesta staff members to prevent unauthorized access.
- Ensure to use strong passwords for all your Blesta accounts and the database user.
- Regularly update your Blesta installation to the latest version to patch known vulnerabilities.
- Send your container logs to a centralized logging solution to monitor for potential security incidents.
- Use a reverse proxy like Nginx or Traefik in front of this container to terminate TLS and handle security headers.

### How can I ensure that Blesta can send emails?

This container is not designed to handle `sendmail` or any other mail transport agent. Instead, you should configure Blesta to use an external SMTP server for sending emails. You can do this by navigating to `Settings -> Company -> Emails -> Mail Settings` and configuring your SMTP server there.

## Final Remarks

- The container will automatically exit if either `nginx`, `php-fpm`, or the built-in `anti-tamper` process dies. This ensures the container does not run in an inconsistent state. Other services, such as `supercronic` and `vector`, are not considered critical and will not cause the container to exit if they fail. Instead, they will be automatically restarted, which is also visible in the container logs.

- A rudimentary anti-tamper script is included to prevent the dynamic configuration files inside `/run` from being modified. While these files can't be baked into the image due to the need for some dynamic configuration, this ensures that if an attacker exploits Blesta and tries to change files like `php.ini`, the container will automatically exit.
