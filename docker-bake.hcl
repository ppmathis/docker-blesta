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
    {
      blesta-version = "5.12.5"
      blesta-sha256 = "04e50937324a65e8a14527de782ef196d74c54e92fa14f1837254b6a688bf074"
      blesta-download-id = "305"
      alpine-version = "3.22"
      php-version = "8.2"
      ioncube-version = "14.0.0"
      ioncube-flavor-amd64 = "lin"
      ioncube-sha256-amd64 = "8d94da9e9f82386e5978ad25526ab812907fb572acc35f9555047cac0164a3ce"
      ioncube-sha256-arm64 = "c04f8b38e478fb3d2859af85b09e4079005845ba553be8657774b1e982d6e5a6"
      memory-limit = "256M"
      php-extra-extensions = ""
      php-disable-functions = "highlight_file, show_source"
      php-open-basedir = "/bin:/opt/blesta:/usr:/var/tmp/blesta:/var/tmp/php"
      extra-tags = []
    },
    {
      blesta-version = "5.13.10"
      blesta-sha256 = "4cb8a9d8afee7094060d3c7a51c475b40a74ef1b84d0d3ed20dbb39b01ec9a90"
      blesta-download-id = "312"
      alpine-version = "3.22"
      php-version = "8.2"
      ioncube-version = "14.0.0"
      ioncube-flavor-amd64 = "lin"
      ioncube-sha256-amd64 = "8d94da9e9f82386e5978ad25526ab812907fb572acc35f9555047cac0164a3ce"
      ioncube-sha256-arm64 = "c04f8b38e478fb3d2859af85b09e4079005845ba553be8657774b1e982d6e5a6"
      memory-limit = "256M"
      php-extra-extensions = ""
      php-disable-functions = "highlight_file, show_source"
      php-open-basedir = "/bin:/opt/blesta:/usr:/var/tmp/blesta:/var/tmp/php"
      extra-tags = []
    },
    {
      blesta-version = "6.0.3"
      blesta-sha256 = "2d7c18d5da963396b6658a48985dbced4437f5a2427ccd25e9018c016c02b506"
      blesta-download-id = "323"
      alpine-version = "3.24"
      php-version = "8.3"
      ioncube-version = "15.5.1"
      ioncube-flavor-amd64 = "lin-musl"
      ioncube-sha256-amd64 = "5c7d7913ceca745253d4bf99df3e7d11b16db34fca4fd6dc16feccd642ecdf8b"
      ioncube-sha256-arm64 = "b091974aa80a76bd798d71fd5209797d93749b0be13eaff978a3dbe0106b9e1f"
      memory-limit = "512M"
      php-extra-extensions = "ldap tokenizer zlib"
      php-disable-functions = "highlight_file, show_source"
      php-open-basedir = "/bin:/opt/blesta:/usr:/var/tmp/blesta:/var/tmp/php"
      extra-tags = ["latest"]
    },
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
    BLESTA_MEMORY_LIMIT = item.memory-limit
    BLESTA_PHP_DISABLE_FUNCTIONS = item.php-disable-functions
    BLESTA_PHP_OPEN_BASEDIR = item.php-open-basedir
    BLESTA_VERSION = item.blesta-version
    BLESTA_SHA256 = item.blesta-sha256
    IONCUBE_VERSION = item.ioncube-version
    IONCUBE_FLAVOR_AMD64 = item.ioncube-flavor-amd64
    IONCUBE_SHA256_AMD64 = item.ioncube-sha256-amd64
    IONCUBE_SHA256_ARM64 = item.ioncube-sha256-arm64
    PHP_EXTRA_EXTENSIONS = item.php-extra-extensions
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
