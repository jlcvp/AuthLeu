/**
 * Enum representing different versions of the application.
 * 
 * @enum {string}
 */
export enum AppVersion {
    UNKNOWN = 'UNKNOWN',
    V1_0_0 = '1.0.0',
    V2_0_0 = '2.0.0',
    V2_1_0 = '2.1.0'
}

export interface AppVersionInfo {
    versionNumber: string;
    buildDate: string;
    commitHash: string;
    versionName: string;
}
