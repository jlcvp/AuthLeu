import { AccountsSyncType } from "../models/app-config.model";

export class GlobalUtils {
    static isMobile() {
        return window.innerWidth <= 768;
    }

    static isFirebaseSyncType(syncType: AccountsSyncType) {
        return syncType === AccountsSyncType.FIREBASE_REAL_TIME_BINDING ||
            syncType === AccountsSyncType.FIREBASE_MANUAL_TRIGGER ||
            syncType === AccountsSyncType.FIREBASE_PERIODIC_SYNC
    }

    static randomBytes(length: number): Uint8Array {
        if (length <= 0 || length > 65536) {
            throw new Error('Invalid length');
        }

        let buffer = new Uint8Array(length)
        if (window.crypto) {
            window.crypto.getRandomValues(buffer); // better random
        } else {
            for (let i = 0; i < length; i++) {
                buffer[i] = Math.floor(Math.random() * 255)
            }
        }
        return buffer;
    }
}