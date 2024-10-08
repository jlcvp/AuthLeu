import { AppConfigService } from "../services/app-config.service";

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

        let buffer = new Uint8Array(length)
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
    
    async deriveKey(password: string, salt: Uint8Array, iterations: number, keyLength: number): Promise<CryptoKey> {
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
}