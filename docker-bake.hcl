function "gen_image_names" {
  params = []
  result = [for x in split(",", IMAGE_NAMES): trimspace(x)]
}

variable "IMAGE_NAMES" {
  default = "localhost/blesta:<version>"
}

variable "PLATFORMS" {
  default = ["linux/amd64", "linux/arm64"]
}

variable "VERSIONS" {
  default = [
    { blesta-version = "5.11.2", blesta-download-id = "266", alpine-version = "3.21", php-version = "8.2", extra-tags = ["latest"] },
    { blesta-version = "5.11.1", blesta-download-id = "264", alpine-version = "3.21", php-version = "8.2", extra-tags = [] },
    { blesta-version = "5.11.0", blesta-download-id = "262", alpine-version = "3.21", php-version = "8.2", extra-tags = [] },
    { blesta-version = "5.10.3", blesta-download-id = "256", alpine-version = "3.21", php-version = "8.2", extra-tags = [] },
  ]
}

group "default" {
  targets = ["blesta"]
}

target "blesta" {
  platforms = PLATFORMS
  matrix = {
    item = VERSIONS
  }

  name = "blesta-${replace(item.blesta-version, ".", "-")}-php${replace(item.php-version, ".", "")}"
  target = "image"
  args = {
    ALPINE_VERSION = item.alpine-version
    BLESTA_DOWNLOAD_ID = item.blesta-download-id
    BLESTA_VERSION = item.blesta-version
    PHP_VERSION = item.php-version
  }
  annotations = [
    "index,manifest:org.opencontainers.image.authors=Pascal Mathis (https://ppmathis.com/)",
    "index,manifest:org.opencontainers.image.base.name=docker.io/library/alpine:${item.alpine-version}",
    "index,manifest:org.opencontainers.image.created=${timestamp()}",
    "index,manifest:org.opencontainers.image.description=Inofficial Docker image for Blesta, a professional client management, billing, and support software.",
    "index,manifest:org.opencontainers.image.source=https://github.com/ppmathis/docker-blesta",
    "index,manifest:org.opencontainers.image.title=Blesta",
    "index,manifest:org.opencontainers.image.url=https://www.blesta.com/",
    "index,manifest:org.opencontainers.image.version=${item.blesta-version}",
    "index,manifest:org.opencontainers.image.vendor=Phillips Data, Inc.",
  ]
  tags = flatten([
    for IMAGE_NAME in gen_image_names() : [
      for IMAGE_TAG in concat(["${item.blesta-version}-php${item.php-version}"], item.extra-tags) :
      replace(IMAGE_NAME, "<version>", IMAGE_TAG)
    ]
  ])
  attest = [
    "type=provenance,mode=max",
    "type=sbom",
  ]
}
