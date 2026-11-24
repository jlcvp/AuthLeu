import { Observable } from "rxjs";
import { CryptoUtils } from "../utils/crypto-utils";
import { DataKey, VaultRecord } from "./vault.model";
import { Secret } from 'otpauth'

/** Hash algorithms supported for code generation, as listed in the Key URI format */
export const SUPPORTED_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];

export interface IAccount2FA {
    id: string;
    label: string;
    secret: string;
    tokenLength: number;
    interval: number;
    algorithm: string;
    issuer?: string;
    active?: boolean;
    logo?: string;
    added?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    encryptedSecret?: string;
    iv?: string;
    /** Set when the secret was encrypted by 2.x, with a key derived from the password and this salt */
    salt?: string;
    /** Identifies the data key that encrypted the secret */
    keyId?: string;
}

export interface IAccount2FAProvider {
    getAccounts(): Promise<Observable<Account2FA[]>>;
    addAccount(account: Account2FA): Promise<string>;
    updateAccount(account: Account2FA): Promise<void>;
    updateAccountsBatch(accounts: Account2FA[]): Promise<void>;
    clearCache?(): Promise<void>;
    /** The error that currently prevents the accounts from syncing, or undefined while they sync */
    syncError$?: Observable<unknown>;
    /** Reads the record of the data key that encrypts the secrets, if encryption is set up */
    getVaultRecord(): Promise<VaultRecord | undefined>;
    /**
     * Saves the record of a new data key, unless a record already exists (e.g. created by another device).
     * @returns The saved record, or the existing one, which must be used instead.
     */
    createVaultRecord(record: VaultRecord): Promise<VaultRecord>;
    /** Replaces the record of the data key, e.g. after a password change */
    updateVaultRecord(record: VaultRecord): Promise<void>;
    deleteVaultRecord(): Promise<void>;
}

export class Account2FA implements IAccount2FA {
    id: string;
    label: string;
    secret: string;
    tokenLength: number;
    interval: number;
    algorithm: string;
    issuer?: string;
    active?: boolean;
    logo?: string;
    added?: any;  // eslint-disable-line @typescript-eslint/no-explicit-any
    encryptedSecret?: string;
    iv?: string;
    salt?: string;
    keyId?: string;
    constructor(id: string, label: string, secret?: string, tokenLength?: number, interval?: number, algorithm?: string, issuer?:string, active?: boolean, logo?: string, encryptedSecret?: string, iv?: string, salt?: string, added?: any, keyId?: string) {  // eslint-disable-line @typescript-eslint/no-explicit-any
        this.id = id;
        this.label = label;
        this.secret = Account2FA.normalizeSecret(secret || '');
        // form inputs and older records may hold these numbers as strings
        this.tokenLength = Number(tokenLength) || 6;
        this.interval = Number(interval) || 30;
        this.algorithm = (algorithm || 'SHA1').toUpperCase();
        this.issuer = issuer;
        this.active = active;
        this.logo = logo;
        this.encryptedSecret = encryptedSecret;
        this.iv = iv;
        this.salt = salt;
        this.added = added;
        this.keyId = keyId;
    }

    /**
     * Normalizes a base32 secret: sites often show secrets in lowercase or split into groups
     * (e.g. "jbsw y3dp ehpk 3pxp"), so remove spaces and dashes and convert to upper case.
     */
    static normalizeSecret(secret: string): string {
        return secret.replace(/[\s-]/g, '').toUpperCase();
    }

    static fromDictionary(dict: any): Account2FA {  // eslint-disable-line @typescript-eslint/no-explicit-any
        if(!dict || typeof dict !== 'object') {
            throw new Error('Invalid dictionary');
        }

        // check if dict contains all required fields
        if(!dict.label || (!dict.secret && !(dict.encryptedSecret && dict.iv && (dict.salt || dict.keyId)))) {
            console.log({dict})
            throw new Error('Missing required fields');
        }

        const data = dict as IAccount2FA;
        // backups from other apps have no active flag
        return new Account2FA(data.id || '', data.label, data.secret, data.tokenLength, data.interval, data.algorithm, data.issuer, data.active ?? true, data.logo, data.encryptedSecret, data.iv, data.salt, data.added, data.keyId);
    }

    static fromOTPAuthURL(url: string): Account2FA {
        //otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30
        const urlObj = new URL(url);
        
        if(!urlObj.protocol.startsWith('otpauth:')) {
            throw new Error('Invalid OTPAuth URL');
        }
        
        const params = new URLSearchParams(urlObj.search)
        const pathComponents = url.replace('otpauth://', '')
            .split('/')
            .filter(e=>!!e)
            .map(e=>e.replace(/\?.*/, ''))
            .map(decodeURIComponent)
        
        const type = pathComponents[0];
        console.log({url})
        if (type !== 'totp') {
            throw new Error('Only TOTP is supported');
        }

        const label = pathComponents[1];
        if(!label) {
            throw new Error('Missing required fields');
        }

        const secret = params.get('secret')?.toUpperCase();
        if(!secret) {
            throw new Error('Missing secret key');
        }

        const issuer = params.get('issuer') ?? undefined;
        const algorithm = (params.get('algorithm') ?? 'SHA1').toUpperCase();
        if (!SUPPORTED_ALGORITHMS.includes(algorithm)) {
            throw new Error('Unsupported algorithm');
        }
        const tokenLength = params.get('digits') ? parseInt(params.get('digits')!) : undefined;
        const interval = params.get('period') ? parseInt(params.get('period')!) : undefined;

        const account = new Account2FA('', label, secret, tokenLength, interval, algorithm, issuer);
        if (account.hasInvalidSecret) {
            throw new Error('Invalid secret key');
        }
        return account;
    }

    get isLocked(): boolean {
        if(!this.secret) {
            return true;
        }
        try {
            Secret.fromBase32(this.secret); // this can be a costly operation, need to evaluate if it's worth it to check in a getter or have it computed once
        } catch {
            return true;
        }
        return false;
    }

    /**
     * Whether the account has a plaintext secret that can't generate codes (it isn't valid base32).
     * Such an account would otherwise look locked forever.
     */
    get hasInvalidSecret(): boolean {
        return !!this.secret && this.isLocked;
    }

    get isEncrypted(): boolean {
        return !!this.encryptedSecret && !!this.iv && (!!this.salt || !!this.keyId);
    }

    /** Whether the secret was encrypted by 2.x, with a key derived from the password instead of a data key */
    get isLegacyEncrypted(): boolean {
        return !!this.encryptedSecret && !!this.iv && !!this.salt && !this.keyId;
    }

    /** Decrypts a secret encrypted by 2.x, with a key derived from the password */
    async unlock(decryptionKey: string) {
        if(!this.isLocked) {
            throw new Error('CRYPTO.ALREADY_DECRYPTED');
        }

        if(!this.encryptedSecret || !this.iv || !this.salt) {
            throw new Error('CRYPTO.MISSING_ENCRYPTED_DATA');
        }

        const decryptedSecret = await CryptoUtils.shared.decryptSecretKey(this.encryptedSecret, decryptionKey, this.salt, this.iv);
        try {
            Secret.fromBase32(decryptedSecret);
        } catch {
            throw new Error('CRYPTO.INVALID_DECRYPTION_KEY');
        }
        this.secret = decryptedSecret;
        delete this.encryptedSecret;
        delete this.iv;
        delete this.salt;
    }

    /** Encrypts the secret in the 2.x format, with a key derived from the password */
    async lock(encryptionKey: string) {
        if(this.isLocked) {
            throw new Error('CRYPTO.ALREADY_ENCRYPTED');
        }

        const {encryptedKey, iv, salt} = await CryptoUtils.shared.encryptSecretKey(this.secret, encryptionKey);
        this.encryptedSecret = encryptedKey;
        this.iv = iv;
        this.salt = salt;
        this.secret = '';
    }

    /** Encrypts the secret with a data key */
    async lockWithDataKey(dataKey: DataKey) {
        if(this.isLocked) {
            throw new Error('CRYPTO.ALREADY_ENCRYPTED');
        }

        const { ciphertext, iv } = await CryptoUtils.shared.encryptWithDataKey(this.secret, dataKey.key);
        this.encryptedSecret = ciphertext;
        this.iv = iv;
        this.keyId = dataKey.keyId;
        delete this.salt;
        this.secret = '';
    }

    /** Decrypts a secret encrypted with lockWithDataKey */
    async unlockWithDataKey(dataKey: DataKey) {
        if(!this.isLocked) {
            throw new Error('CRYPTO.ALREADY_DECRYPTED');
        }

        if(!this.encryptedSecret || !this.iv || !this.keyId) {
            throw new Error('CRYPTO.MISSING_ENCRYPTED_DATA');
        }

        if(this.keyId !== dataKey.keyId) {
            throw new Error('CRYPTO.WRONG_DATA_KEY');
        }

        let decryptedSecret: string;
        try {
            decryptedSecret = await CryptoUtils.shared.decryptWithDataKey(this.encryptedSecret, this.iv, dataKey.key);
            Secret.fromBase32(decryptedSecret);
        } catch {
            throw new Error('CRYPTO.INVALID_DECRYPTION_KEY');
        }
        this.secret = decryptedSecret;
        delete this.encryptedSecret;
        delete this.iv;
        delete this.keyId;
    }

    getLogo(): string {
        return this.logo || 'assets/icon/128.png';
    }

    typeErased(): Object { // eslint-disable-line @typescript-eslint/no-wrapper-object-types
        const typeErasedObject = Object.assign({}, this);
        for (const key in typeErasedObject) {
            if (!typeErasedObject[key]) {
                delete typeErasedObject[key];
            }
        }
        return typeErasedObject
    }

    copy(): Account2FA {
        return new Account2FA(this.id, this.label, this.secret, this.tokenLength, this.interval, this.algorithm, this.issuer, this.active, this.logo, this.encryptedSecret, this.iv, this.salt, this.added, this.keyId);
    }
}