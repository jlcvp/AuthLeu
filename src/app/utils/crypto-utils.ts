import { AppConfigService } from "../services/app-config.service";
import { DataKey, VAULT_KDF_ITERATIONS, VaultRecord } from "../models/vault.model";

export class CryptoUtils {
    private static _shared: CryptoUtils;
    
    static get shared(): CryptoUtils {
        if (!this._shared) {
            this._shared = new CryptoUtils();
        }
        return this._shared;
    }

    static randomBytes(length: number): Uint8Array {
        if (length <= 0 || length > 65536) {
            throw new Error('Invalid length');
        }

        const buffer = new Uint8Array(length)
        if (window.crypto) {
            window.crypto.getRandomValues(buffer); // better random
        } else { // fallback to Math.random
            for (let i = 0; i < length; i++) {
                buffer[i] = Math.floor(Math.random() * 255)
            }
        }
        return buffer;
    }

    private constructor() {
        if (!AppConfigService.supportsCryptoAPI()) {
            throw new Error('CRYPTO_API_NOT_SUPPORTED');
        }
    }
    
    async deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, keyLength: number): Promise<CryptoKey> {
        // Encode password as Uint8Array
        const enc = new TextEncoder();
        const passwordKey = enc.encode(password);
    
        // Derive a key using PBKDF2
        const keyMaterial = await crypto.subtle.importKey(
            'raw', 
            passwordKey, 
            { name: 'PBKDF2' }, 
            false, 
            ['deriveKey']
        );
    
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: keyLength },
            false, 
            ['encrypt', 'decrypt']
        );
    }
    
    async encryptSecretKey(secretKey: string, password: string): Promise<{ encryptedKey: string, salt: string, iv: string }> {
        const salt = crypto.getRandomValues(new Uint8Array(16)); // 128-bit salt
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV (recommended for AES-GCM)
        const key = await this.deriveKey(password, salt, 100000, 256); // Deriving a 256-bit key
    
        const enc = new TextEncoder();
        const encodedSecretKey = enc.encode(secretKey);
    
        const encryptedKeyBuffer = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encodedSecretKey
        );
    
        return {
            encryptedKey: Array.from(new Uint8Array(encryptedKeyBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''),
            salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
        };
    }

    async decryptSecretKey(encryptedKey: string, password: string, salt: string, iv: string): Promise<string> {
        const saltBuffer = Uint8Array.from(salt.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const ivBuffer = Uint8Array.from(iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const encryptedKeyBuffer = Uint8Array.from(encryptedKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
        // Derive the key using the same parameters as during encryption
        const key = await this.deriveKey(password, saltBuffer, 100000, 256);
    
        // Decrypt the secret key
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: ivBuffer
            },
            key,
            encryptedKeyBuffer
        );
    
        const dec = new TextDecoder();
        return dec.decode(decryptedBuffer);
    }

    /**
     * Creates a random data key for encrypting secrets, wrapped with a key derived from the password.
     * @returns The record to store, and the data key, which can't be exported.
     */
    async createDataKey(password: string, iterations = VAULT_KDF_ITERATIONS): Promise<{ record: VaultRecord, dataKey: DataKey }> {
        const extractableKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const keyId = CryptoUtils.toHex(crypto.getRandomValues(new Uint8Array(16)));
        const record = await this.wrapDataKey(extractableKey, keyId, password, iterations);

        // keep only a copy of the key that can't be exported
        const rawKey = await crypto.subtle.exportKey('raw', extractableKey);
        const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        return { record, dataKey: { keyId, key } };
    }

    /**
     * Unwraps the data key of a record with the password.
     * @param extractable - Whether the key can be exported, which wrapping it again requires.
     * @throws {Error} 'VAULT.INVALID_PASSWORD' if the password is wrong.
     */
    async unlockDataKey(record: VaultRecord, password: string, extractable = false): Promise<DataKey> {
        if (record.version !== 1 || record.kdf?.name !== 'PBKDF2' || record.kdf.hash !== 'SHA-256') {
            throw new Error('VAULT.UNSUPPORTED_FORMAT');
        }

        const wrappingKey = await this.deriveWrappingKey(password, CryptoUtils.fromHex(record.kdf.salt), record.kdf.iterations);
        try {
            const key = await crypto.subtle.unwrapKey(
                'raw',
                CryptoUtils.fromHex(record.wrappedKey),
                wrappingKey,
                { name: 'AES-GCM', iv: CryptoUtils.fromHex(record.iv) },
                { name: 'AES-GCM' },
                extractable,
                ['encrypt', 'decrypt']
            );
            return { keyId: record.keyId, key };
        } catch {
            // AES-GCM authentication fails when the wrapping key is derived from another password
            throw new Error('VAULT.INVALID_PASSWORD');
        }
    }

    /**
     * Wraps the data key of a record with a new password. The data key, and so the encrypted secrets, don't change.
     * @throws {Error} 'VAULT.INVALID_PASSWORD' if the old password is wrong.
     */
    async rewrapDataKey(record: VaultRecord, oldPassword: string, newPassword: string, iterations = VAULT_KDF_ITERATIONS): Promise<VaultRecord> {
        const { key } = await this.unlockDataKey(record, oldPassword, true);
        return this.wrapDataKey(key, record.keyId, newPassword, iterations);
    }

    /** Encrypts text with a data key, using a random IV */
    async encryptWithDataKey(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV (recommended for AES-GCM)
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
        return { ciphertext: CryptoUtils.toHex(new Uint8Array(ciphertext)), iv: CryptoUtils.toHex(iv) };
    }

    /** Decrypts text encrypted with encryptWithDataKey */
    async decryptWithDataKey(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: CryptoUtils.fromHex(iv) }, key, CryptoUtils.fromHex(ciphertext));
        return new TextDecoder().decode(plaintext);
    }

    private async wrapDataKey(key: CryptoKey, keyId: string, password: string, iterations: number): Promise<VaultRecord> {
        const salt = crypto.getRandomValues(new Uint8Array(16)); // 128-bit salt
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrappingKey = await this.deriveWrappingKey(password, salt, iterations);
        const wrappedKey = await crypto.subtle.wrapKey('raw', key, wrappingKey, { name: 'AES-GCM', iv });
        return {
            version: 1,
            keyId,
            kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: CryptoUtils.toHex(salt) },
            wrappedKey: CryptoUtils.toHex(new Uint8Array(wrappedKey)),
            iv: CryptoUtils.toHex(iv),
        };
    }

    private async deriveWrappingKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['wrapKey', 'unwrapKey']
        );
    }

    private static toHex(bytes: Uint8Array): string {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private static fromHex(hex: string): Uint8Array<ArrayBuffer> {
        return Uint8Array.from(hex.match(/.{1,2}/g) ?? [], byte => parseInt(byte, 16));
    }
}