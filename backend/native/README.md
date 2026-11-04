# Arabic PDF native runtime

These Linux x86-64 shared libraries are built from the official Amazon Linux
2023 RPM packages by `scripts/pdf/build-native.sh`, for the hosted Python
runtime. The application verifies `SHA256SUMS` before loading them. Rebuild with
the `Agouz PDF native runtime` GitHub workflow; inspect the artifact and commit
the complete library set, checksums, package manifest and license notices.

`RPM-PACKAGES.txt` identifies the distribution packages. Corresponding source
RPMs are available from the Amazon Linux 2023 source repositories:
https://docs.aws.amazon.com/linux/al2023/ug/using-srpm.html
Notices and licenses are preserved under `licenses/`.

Do not replace system glibc or copy a developer machine's libraries here.
