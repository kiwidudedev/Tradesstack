# Synthetic image fixture

`synthetic-solid.heic` contains a 32 × 24 solid RGB image (20, 100, 200).
It was generated locally from a Sharp-created PNG with macOS `sips -s format heic`.
It contains no customer image or production data. The tests also generate PNG,
JPEG, WebP and AV1-compressed HEIF/AVIF buffers in memory.

The HEVC test accepts successful conversion where the native codec is available.
Where the prebuilt library explicitly reports missing HEVC support, it verifies
that the application returns its existing controlled error instead of exposing
native diagnostics. Both the original and upgraded macOS builds lack this codec.
