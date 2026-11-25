/**
 * The data key that encrypts the account secrets, wrapped (encrypted) with a key derived from the
 * user's password. The password itself is never stored. The derivation parameters are stored with
 * the key, so they can be strengthened later without re-encrypting the secrets.
 */
export interface VaultRecord {
    /** Format version of the record */
    version: 1;
    /** Identifies the data key, so secrets encrypted with another data key can be told apart */
    keyId: string;
    /** How the wrapping key is derived from the password */
    kdf: {
        name: 'PBKDF2';
        hash: 'SHA-256';
        iterations: number;
        /** Hex encoded */
        salt: string;
    };
    /** The data key, encrypted with AES-GCM under the wrapping key (hex encoded) */
    wrappedKey: string;
    /** Hex encoded */
    iv: string;
}

/** An unwrapped data key, ready to encrypt and decrypt secrets */
export interface DataKey {
    keyId: string;
    key: CryptoKey;
}

/** PBKDF2 iterations for new data keys (OWASP's recommendation for PBKDF2-HMAC-SHA256) */
export const VAULT_KDF_ITERATIONS = 600_000;

/** Device preferences for unlocking the data key */
export interface VaultOptions {
    /** Whether to keep the unlocked data key on this device, instead of asking for the password on every launch */
    rememberUnlock: boolean;
    /** When the password is asked on every launch: minutes without interaction before locking, or 0 to never lock */
    autoLockMinutes: number;
}

export const VAULT_OPTIONS_KEY = 'vaultOptions';
export const VAULT_OPTIONS_DEFAULT: VaultOptions = {
    rememberUnlock: true,
    autoLockMinutes: 5,
};
