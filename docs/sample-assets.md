# sample-assets

Provenance for the demo inputs bundled under `public/samples/`, used by the
`/browser` playground pages. Both are public-domain works of the United States
federal government (17 U.S.C. § 105).

## jfk.wav (352,078 bytes)

Eleven seconds of John F. Kennedy's inaugural address, January 20, 1961
("ask not what your country can do for you"). A work of a sitting US
President in official capacity; the Internet Archive listing of the full
recording (credited to the JFK Presidential Library & Museum) is marked
"Copyright: Public domain".

- Fetched from: https://github.com/ggml-org/whisper.cpp/raw/master/samples/jfk.wav
  (checked-in asset there, blob sha `3184d372cd2f8b804d3a540c70ec50d927b335d2`;
  the same clip ships as `tests/jfk.flac` in openai/whisper)
- Rights basis: https://archive.org/details/JohnF.KennedyInauguralAddress
- Format: 16 kHz, 16-bit, mono WAV, 11.0 s

## portrait.jpg (101,619 bytes)

Neil Armstrong's official NASA portrait (1969), a NASA photograph and
therefore public domain. Used as the sample input for the background-removal,
image-description, depth-estimation, and zero-shot-classification demos.

- Source: https://commons.wikimedia.org/wiki/File:Neil_Armstrong_pose.jpg
  (Wikimedia Commons copy of the NASA original, marked PD-USGov-NASA)
- Processing: downscaled to 576×720 JPEG (quality 78) with macOS `sips`;
  no other edits.
