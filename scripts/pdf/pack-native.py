"""Package the verified Linux PDF libraries into a reproducible deployable archive."""
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[2] / "backend" / "native"
with ZipFile(root / "libraries.zip", "w") as archive:
    for entry in (root / "SHA256SUMS").read_text(encoding="ascii").splitlines():
        expected, name = entry.split()
        library = root / name
        if library.resolve().parent != root.resolve() or not library.name.startswith("lib"):
            raise ValueError("Unexpected native library path")
        data = library.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Checksum mismatch for {name}")
        info = ZipInfo(name)
        archive.writestr(info, data, ZIP_DEFLATED, compresslevel=9)
