import type { Hex } from "viem";

/**
 * Normalize a private key string to a 0x-prefixed hex string.
 * Accepts keys with or without the 0x prefix.
 */
export function normalizePrivateKey(key: string): Hex {
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}
