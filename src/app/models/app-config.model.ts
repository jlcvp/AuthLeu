export interface AppConfig {
    accountsSyncType: AccountsSyncType,
}

export enum AccountsSyncType {
    NONE = 'none',
    FIREBASE_REAL_TIME_BINDING = 'firebase-binding',
    FIREBASE_MANUAL_TRIGGER = 'firebase-manual-trigger',
    FIREBASE_PERIODIC_SYNC = 'firebase-periodic-sync',
}