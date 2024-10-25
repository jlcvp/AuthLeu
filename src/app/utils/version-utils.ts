import { AppVersion } from "../models/app-version.enum"

export class VersionUtils {
    /**
     * Converts a version string to the corresponding AppVersion enum value.
     * 
     * @param {string} version - The version string to convert.
     * @returns {AppVersion} The corresponding AppVersion enum value.
     */
    static appVersionFromVersionString(version: string): AppVersion {
        const appVersion = Object.values(AppVersion).find((appVersion) => appVersion === version)
        return appVersion as AppVersion ?? AppVersion.UNKNOWN
    }

    /**
     * Compares two AppVersion enum values.
     * 
     * @param {AppVersion} a - The first AppVersion to compare.
     * @param {AppVersion} b - The second AppVersion to compare.
     * @returns {number} A negative number if a < b, zero if a === b, and a positive number if a > b.
     */
    static appVersionCompare(a: AppVersion, b: AppVersion): number {
        return Object.values(AppVersion).indexOf(a) - Object.values(AppVersion).indexOf(b)
    }

    /**
     * Compares two version strings in semver format.
     * 
     * @param {string} a - The first version string to compare.
     * @param {string} b - The second version string to compare.
     * @returns {number} A negative number if a < b, zero if a === b, and a positive number if a > b.
     */
    static semverCompare(a: string, b: string): number {
        const aParts = a.split('.').map((part) => parseInt(part))
        const bParts = b.split('.').map((part) => parseInt(part))
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            if(isNaN(aParts[i]) || isNaN(bParts[i])) {
                throw new Error('UTILS.ERROR_INVALID_SEMVER_FORMAT')
            }

            const aPart = aParts[i] ?? 0
            const bPart = bParts[i] ?? 0

            if (aPart < bPart) {
                return -1
            } else if (aPart > bPart) {
                return 1
            }
        }

        return 0
    }
}