import { scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
const HASH_PART_COUNT = 6;
const MIN_WORK_FACTOR = 16_384;
const MAX_WORK_FACTOR = 1_048_576;
const MAX_BLOCK_SIZE = 32;
const MAX_PARALLELIZATION = 16;
const MAX_DERIVED_KEY_BYTES = 128;
const MAX_SCRYPT_MEMORY_BYTES = 256 * 1024 * 1024;

// An unknown email still performs the same expensive password operation before
// returning the generic credentials error.
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$00000000000000000000000000000000$" + "00".repeat(64);

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function isPowerOfTwo(value: number) {
  return value > 1 && (value & (value - 1)) === 0;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const parts = encodedHash.split("$");

  if (parts.length !== HASH_PART_COUNT) {
    return false;
  }

  const [algorithm, workFactorText, blockSizeText, parallelizationText, saltHex, hashHex] =
    parts;
  const workFactor = Number(workFactorText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);

  if (
    algorithm !== "scrypt" ||
    !Number.isSafeInteger(workFactor) ||
    !isPowerOfTwo(workFactor) ||
    workFactor < MIN_WORK_FACTOR ||
    workFactor > MAX_WORK_FACTOR ||
    !Number.isSafeInteger(blockSize) ||
    blockSize < 1 ||
    blockSize > MAX_BLOCK_SIZE ||
    !Number.isSafeInteger(parallelization) ||
    parallelization < 1 ||
    parallelization > MAX_PARALLELIZATION ||
    saltHex === undefined ||
    !/^[a-f\d]+$/iu.test(saltHex) ||
    saltHex.length % 2 !== 0 ||
    hashHex === undefined ||
    !/^[a-f\d]+$/iu.test(hashHex) ||
    hashHex.length % 2 !== 0
  ) {
    return false;
  }

  const expectedHash = Buffer.from(hashHex, "hex");
  const requiredMemory = 128 * workFactor * blockSize + 16 * 1024 * 1024;

  if (
    expectedHash.length === 0 ||
    expectedHash.length > MAX_DERIVED_KEY_BYTES ||
    requiredMemory > MAX_SCRYPT_MEMORY_BYTES
  ) {
    return false;
  }

  try {
    const actualHash = await deriveKey(
      password,
      Buffer.from(saltHex, "hex"),
      expectedHash.length,
      {
        N: workFactor,
        r: blockSize,
        p: parallelization,
        maxmem: requiredMemory,
      },
    );

    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
