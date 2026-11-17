# FluffOS driver image shared by all games in this repo.
# Build:  docker build -t fluffos-mud -f docker/Dockerfile docker
# Behind a proxy / mirror, see README (BASE, FLUFFOS_REF, http_proxy build args).
ARG BASE=alpine:3.18
FROM ${BASE} AS builder
ARG FLUFFOS_REF=9526b49ea5614c147de5f6a03a8294a600cd1d87
RUN apk add --no-progress --no-cache \
    linux-headers gcc g++ make cmake bash curl tar \
    openssl-dev openssl-libs-static zlib-dev zlib-static icu-dev icu-static \
    pcre2-dev bison git musl-dev libelf-static elfutils-dev zstd-static bzip2-static xz-static \
    pkgconf libffi-dev sqlite-dev sqlite-static
WORKDIR /build
RUN curl -fsSL https://codeload.github.com/fluffos/fluffos/tar.gz/${FLUFFOS_REF} | tar xz \
    && mv fluffos-* fluffos
WORKDIR /build/fluffos/build
RUN cmake .. -DMARCH_NATIVE=OFF -DSTATIC=ON -DUSE_JEMALLOC=OFF -DPACKAGE_DB=OFF -DCMAKE_BUILD_TYPE=Release \
    && make -j"$(nproc)" install

FROM ${BASE}
RUN apk add --no-progress --no-cache icu-data-full
WORKDIR /fluffos
COPY --from=builder /build/fluffos/build/bin ./bin
COPY --from=builder /build/fluffos/src/www ./www
ENTRYPOINT ["/fluffos/bin/driver"]
