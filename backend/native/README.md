# Arabic PDF native runtime

These Linux x86-64 shared libraries are built from the official Amazon Linux
2023 RPM packages by `scripts/pdf/build-native.sh`, for the hosted Python
runtime. The application unpacks `libraries.zip` once per warm Linux worker and verifies each library against `SHA256SUMS` before loading it. Rebuild with
the `Agouz PDF native runtime` GitHub workflow; inspect the artifact and commit
the archive, checksums, package manifest and license notices. Use `python3 scripts/pdf/pack-native.py` to package freshly collected libraries.

`RPM-PACKAGES.txt` identifies the distribution packages. Corresponding source
RPMs are available from the Amazon Linux 2023 source repositories:
https://docs.aws.amazon.com/linux/al2023/ug/using-srpm.html
Notices and licenses are preserved under `licenses/`.

Do not replace system glibc or copy a developer machine's libraries here.
