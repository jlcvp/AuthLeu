export interface EncryptionOptions {
    encryptionActive: boolean;
    shouldPerformPeriodicCheck: boolean;
}

export const ENCRYPTION_OPTIONS_KEY = 'encryptionOptions';
export const ENCRYPTION_OPTIONS_PASSWORD_KEY = '_eok';