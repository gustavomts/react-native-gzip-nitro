# react-native-gzip-nitro

[![npm version](https://img.shields.io/npm/v/react-native-gzip-nitro.svg)](https://www.npmjs.com/package/react-native-gzip-nitro)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Fast, native gzip compression and decompression for React Native, built on top of [Nitro Modules](https://nitro.margelo.com/) and [zlib](https://www.zlib.net/).

This library is a drop-in replacement for [`react-native-gzip`](https://www.npmjs.com/package/react-native-gzip) that:

- Uses **Nitro Modules** instead of the legacy bridge — direct C++/JSI calls, no JSON serialization, no async queue overhead.
- Runs the actual compression on a **background thread** so the JS thread stays free.
- Ships a small, dependency-free native core (`zlib` + a tiny inline base64 codec — no third-party native deps).
- Works on both **iOS** and **Android**, with the **New Architecture** (Fabric/TurboModules) enabled.
- Includes **batch APIs** (`inflateBatch` / `deflateBatch`) that fan a single JS call out across multiple native worker threads — ideal for hot paths that (de)compress many payloads back-to-back.

## Why?

`react-native-gzip` works, but it goes through the old bridge: every call serializes the input/output as a string across the bridge and queues the work on the module method queue. For large payloads (think: API responses, sync uploads, log batches) that's measurable.

`react-native-gzip-nitro` exposes the same two functions (`inflate` / `deflate`) over JSI via Nitro, so:

- The string crosses the JS/Native boundary as a `std::string` directly — no JSON.
- The native work runs on a Nitro background thread pool; you get a real `Promise` back.
- The C++ implementation is shared verbatim between iOS and Android (same `cpp/HybridGzip.cpp` file).

## Requirements

- React Native **0.74+** (New Architecture enabled — required by Nitro).
- iOS **13.4+**.
- Android **minSdk 26+**, NDK 27+.
- [`react-native-nitro-modules`](https://www.npmjs.com/package/react-native-nitro-modules) installed in the host app.

## Installation

```sh
yarn add react-native-gzip-nitro react-native-nitro-modules
# or
npm install react-native-gzip-nitro react-native-nitro-modules
```

Then install pods:

```sh
cd ios && pod install
```

That's it — autolinking handles the rest on both platforms.

> ⚠️ **New Architecture is required.** Make sure `newArchEnabled=true` in `android/gradle.properties` and `RCT_NEW_ARCH_ENABLED=1` in your iOS environment.

## Usage

```ts
import { inflate, deflate, inflateBatch, deflateBatch } from "react-native-gzip-nitro";

// Compress a string -> base64 of gzip bytes
const compressed = await deflate("Hello, world!");
console.log(compressed); // e.g. "H4sIAAAAAAAAA/NIzcnJ1w..."

// Decompress base64-encoded gzip back to the original UTF-8 string
const original = await inflate(compressed);
console.log(original); // "Hello, world!"

// Process many payloads in a single native call, in parallel
const payloads = ["a", "b", "c"];
const compressedBatch = await deflateBatch(payloads);
const originals = await inflateBatch(compressedBatch);
console.log(originals); // ["a", "b", "c"]
```

### API

#### `deflate(data: string): Promise<string>`

Gzip-compresses a UTF-8 string and returns a base64-encoded string of the gzip bytes.

- The output uses standard gzip framing (RFC 1952), with default compression level (`Z_DEFAULT_COMPRESSION`) and the standard 15+16 window-bit configuration.
- Runs on a background thread.

#### `inflate(base64: string): Promise<string>`

Decompresses a base64-encoded gzip (or zlib) payload and returns the original UTF-8 string.

- Internally uses `inflateInit2(..., 15 + 32)`, so it auto-detects both **gzip** (RFC 1952) and **zlib** (RFC 1950) framing — you can decode either.
- Whitespace inside the base64 input (newlines, CR, spaces, tabs) is tolerated.
- Runs on a background thread.

#### `deflateBatch(items: string[]): Promise<string[]>`

Gzip-compresses an array of UTF-8 strings in a single native call and returns the base64-encoded results in the same order as the input.

- Items are dispatched across native worker threads (capped at `std::thread::hardware_concurrency()`), so a batch of N items completes roughly in `ceil(N / cores)` × per-item time instead of `N ×` per-item time.
- An empty array resolves to an empty array.
- **Fail-fast:** if any item throws, the whole batch rejects with the first error encountered.

#### `inflateBatch(items: string[]): Promise<string[]>`

Decompresses an array of base64-encoded gzip (or zlib) payloads in a single native call and returns the UTF-8 strings in the same order as the input.

- Same parallel-execution and fail-fast semantics as `deflateBatch`.
- Each item independently auto-detects gzip vs. zlib framing, so a mixed batch is fine.

The batch APIs are best when you have ≥2 payloads to (de)compress at once: you amortize the JSI hop across all of them and exploit multiple cores. For a single payload, prefer `inflate` / `deflate` — there's no parallelism win, and you skip allocating a 1-element array.

#### Errors

`inflate` / `deflate` (and each item inside `inflateBatch` / `deflateBatch`) reject the returned promise with a JS `Error` if:

- the base64 input contains an invalid character (`inflate`),
- the gzip stream is truncated or corrupted (`inflate`),
- zlib fails to initialize (`Z_MEM_ERROR`, etc.).

For the batch variants, the first error wins and the whole promise rejects — successfully processed items are discarded.

```ts
try {
  await inflate("!!!not base64!!!");
} catch (err) {
  // err.message will include the underlying zlib message when available.
}
```

## How it works

```
                       ┌─────────────────────────────┐
   deflate("...")  ──► │  JS  (your app)             │
                       └────────────┬────────────────┘
                                    │  JSI (Nitro hybrid object)
                       ┌────────────▼────────────────┐
                       │  C++  HybridGzip            │
                       │   ├─ base64Decode/Encode    │
                       │   └─ zlib (deflate/inflate) │
                       └────────────┬────────────────┘
                                    │  background thread
                       ┌────────────▼────────────────┐
                       │  Promise<std::string>       │
                       └─────────────────────────────┘
```

The TypeScript spec is in [`src/Gzip.nitro.ts`](src/Gzip.nitro.ts); the C++ implementation lives in [`cpp/HybridGzip.cpp`](cpp/HybridGzip.cpp). Nitrogen-generated bindings live under `nitrogen/generated/` and are committed to the repo so consumers don't need to run codegen themselves.

## Building from source / contributing

```sh
git clone https://github.com/gustavomts/react-native-gzip-nitro.git
cd react-native-gzip-nitro
yarn install
yarn test          # runs the JS-level inflate/deflate tests
yarn specs         # regenerates the Nitrogen bindings if you edit Gzip.nitro.ts
```

To test inside an app, point your `package.json` at a local checkout:

```json
{
  "dependencies": {
    "react-native-gzip-nitro": "file:../react-native-gzip-nitro"
  }
}
```

### Project layout

| Path | What's in it |
|---|---|
| `src/` | TypeScript spec (`Gzip.nitro.ts`) and JS entry point (`index.ts`) |
| `cpp/` | Cross-platform C++ implementation (`HybridGzip.{hpp,cpp}`) |
| `android/` | Gradle module + CMake setup, links against `libz` |
| `ios/` | iOS bits (most logic is in `cpp/`) |
| `nitrogen/generated/` | Nitrogen output — regenerate via `yarn specs` |
| `__tests__/` | Jest tests for the gzip round-trip on Node's zlib |

## Compatibility with `react-native-gzip`

The exported function names and signatures match `react-native-gzip` (`deflate`/`inflate`, base64 in/out, `Promise<string>`), so most apps can swap the import:

```diff
- import { deflate, inflate } from "react-native-gzip";
+ import { deflate, inflate } from "react-native-gzip-nitro";
```

The output bytes are byte-compatible: gzip with a standard 32 KB window, default compression level. Anything that decompresses `react-native-gzip`'s output will decompress this library's output, and vice versa.

`inflateBatch` / `deflateBatch` are additive — they have no equivalent in `react-native-gzip` and don't change the behavior of the single-payload functions.

## License

MIT © [Gustavo Aires](https://github.com/gustavomts)

## Acknowledgements

- [Margelo](https://margelo.com/) — for the excellent Nitro Modules framework.
- [zlib](https://www.zlib.net/) — the reference compression library this is built on.
- [`react-native-gzip`](https://github.com/yodermk/react-native-gzip) — the API this library mirrors.
