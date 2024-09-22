export interface EncryptionOptions {
    encryptionActive: boolean;
    shouldPerformPeriodicCheck: boolean;
    shouldAlertToActivateEncryption: boolean;
}

export const ENCRYPTION_OPTIONS_KEY = 'encryptionOptions';
export const ENCRYPTION_OPTIONS_PASSWORD_KEY = '_eok';
export const LAST_PASSWORD_CHECK_KEY = 'lastPasswordCheck';