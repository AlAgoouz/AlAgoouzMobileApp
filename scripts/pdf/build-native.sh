#!/usr/bin/env bash
set -euo pipefail
mkdir -p backend/native
docker run --rm --platform linux/amd64 \
  --mount "type=bind,src=$PWD/backend/native,dst=/output" \
  public.ecr.aws/amazonlinux/amazonlinux:2023 bash -euc '
dnf install -y pango fontconfig harfbuzz freetype libffi patchelf findutils
for root in libpango-1.0.so.0 libpangoft2-1.0.so.0 libgobject-2.0.so.0 libharfbuzz.so.0 libharfbuzz-subset.so.0 libfontconfig.so.1; do
  test -f "/usr/lib64/$root"
  cp -L "/usr/lib64/$root" "/output/$root"
  ldd "/usr/lib64/$root" | awk "/=> \\/usr\\/lib64\\// {print \$3}" >> /tmp/deps
done
sort -u /tmp/deps | while read -r lib; do
  case "$(basename "$lib")" in libc.so.*|libm.so.*|libpthread.so.*|librt.so.*|libdl.so.*|ld-linux*) continue;; esac
  cp -L "$lib" "/output/$(basename "$lib")"
done
for lib in /output/*.so*; do patchelf --set-rpath '\''$ORIGIN'\'' "$lib"; done
cp -a /usr/share/licenses /output/licenses
rpm -qa | sort > /output/RPM-PACKAGES.txt
cd /output
sha256sum *.so* > SHA256SUMS
'
