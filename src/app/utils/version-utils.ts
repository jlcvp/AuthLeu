import { AppVersion } from "../models/app-version.enum"

export class VersionUtils {
    /**
     * Lists the AppVersion migrations that must run to bring data from `dataVersion` up to `appVersion`.
     *
     * @param {string} dataVersion - The version of the stored data, in semver format.
     * @param {string} appVersion - The version of the running app, in semver format.
     * @returns {AppVersion[]} The versions in (dataVersion, appVersion], sorted in ascending order.
     * @throws {Error} If either version is not in semver format.
     */
    static pendingMigrations(dataVersion: string, appVersion: string): AppVersion[] {
        return Object.values(AppVersion)
            .filter((version) => version !== AppVersion.UNKNOWN)
            .filter((version) => VersionUtils.semverCompare(version, dataVersion) > 0 && VersionUtils.semverCompare(version, appVersion) <= 0)
            .sort(VersionUtils.semverCompare)
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
            const aPart = aParts[i] ?? 0
            const bPart = bParts[i] ?? 0

            if(isNaN(aPart) || isNaN(bPart)) {
                throw new Error('UTILS.ERROR_INVALID_SEMVER_FORMAT')
            }

            if (aPart < bPart) {
                return -1
            } else if (aPart > bPart) {
                return 1
            }
        }

        return 0
    }
}