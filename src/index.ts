import { NitroModules } from "react-native-nitro-modules";

import type { Gzip as GzipSpec } from "./Gzip.nitro";

const Gzip = NitroModules.createHybridObject<GzipSpec>("Gzip");

/**
 * Decompress a gzip-compressed, base64-encoded payload into a UTF-8 string.
 */
export function inflate(base64: string): Promise<string> {
    return Gzip.inflate(base64);
}

/**
 * Gzip-compress a UTF-8 string and return a base64-encoded string.
 */
export function deflate(data: string): Promise<string> {
    return Gzip.deflate(data);
}

/**
 * Decompress an array of gzip-compressed, base64-encoded payloads in a single
 * native call. Items are processed in parallel on native worker threads and
 * results are returned in the same order. Rejects on the first failure.
 */
export function inflateBatch(items: string[]): Promise<string[]> {
    return Gzip.inflateBatch(items);
}

/**
 * Gzip-compress an array of UTF-8 strings in a single native call. Items are
 * processed in parallel on native worker threads and base64 results are
 * returned in the same order. Rejects on the first failure.
 */
export function deflateBatch(items: string[]): Promise<string[]> {
    return Gzip.deflateBatch(items);
}
