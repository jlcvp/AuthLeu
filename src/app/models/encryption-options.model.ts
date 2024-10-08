export interface EncryptionOptions {
    encryptionActive: boolean;
    shouldPerformPeriodicCheck: boolean;
}

export const ENCRYPTION_OPTIONS_KEY = 'encryptionOptions';
export const ENCRYPTION_OPTIONS_PASSWORD_KEY = '_eok';
export const ENCRYPTION_OPTIONS_DEFAULT: EncryptionOptions = {
    encryptionActive: false,
    shouldPerformPeriodicCheck: true
};
export const LAST_PASSWORD_CHECK_KEY = 'lastPasswordCheck';
export const PASSWORD_CHECK_PERIOD = 1000 * 60 * 60 * 24 * 7; // 7 days