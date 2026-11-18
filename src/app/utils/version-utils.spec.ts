import { AppVersion } from "../models/app-version.enum"
import { VersionUtils } from "./version-utils"

describe('VersionUtils', () => {
    describe('semverCompare', () => {
        it('compares each part numerically', () => {
            expect(VersionUtils.semverCompare('1.0.0', '2.0.0')).toBeLessThan(0)
            expect(VersionUtils.semverCompare('2.10.0', '2.2.0')).toBeGreaterThan(0)
            expect(VersionUtils.semverCompare('10.0.0', '9.9.9')).toBeGreaterThan(0)
            expect(VersionUtils.semverCompare('2.2.3', '2.2.3')).toBe(0)
        })

        it('treats missing parts as zero', () => {
            expect(VersionUtils.semverCompare('2.2', '2.2.0')).toBe(0)
            expect(VersionUtils.semverCompare('2.2.0', '2.2')).toBe(0)
            expect(VersionUtils.semverCompare('2.2', '2.2.1')).toBeLessThan(0)
        })

        it('throws on invalid versions', () => {
            expect(() => VersionUtils.semverCompare('%VERSION%', '1.0.0')).toThrowError('UTILS.ERROR_INVALID_SEMVER_FORMAT')
            expect(() => VersionUtils.semverCompare('1.0.0', AppVersion.UNKNOWN)).toThrowError('UTILS.ERROR_INVALID_SEMVER_FORMAT')
        })
    })

    describe('pendingMigrations', () => {
        it('returns every migration for fresh data, in ascending order', () => {
            expect(VersionUtils.pendingMigrations('0.0.0', '2.2.3')).toEqual([
                AppVersion.V1_0_0,
                AppVersion.V2_0_0,
                AppVersion.V2_1_0,
                AppVersion.V2_2_0,
            ])
        })

        it('returns only the migrations newer than the data version', () => {
            expect(VersionUtils.pendingMigrations('2.1.0', '2.2.3')).toEqual([AppVersion.V2_2_0])
            expect(VersionUtils.pendingMigrations('2.2.0', '3.0.0')).toEqual([AppVersion.V3_0_0])
            expect(VersionUtils.pendingMigrations('3.0.0', '3.0.0')).toEqual([])
        })

        it('does not run migrations newer than the app version', () => {
            expect(VersionUtils.pendingMigrations('0.0.0', '2.0.0')).toEqual([AppVersion.V1_0_0, AppVersion.V2_0_0])
        })

        it('compares versions numerically rather than lexically', () => {
            // as strings, '2.2.0' > '10.0.0', so this migration used to be skipped
            expect(VersionUtils.pendingMigrations('2.1.0', '10.0.0')).toEqual([AppVersion.V2_2_0, AppVersion.V3_0_0])
        })

        it('throws when the app version is not semver', () => {
            expect(() => VersionUtils.pendingMigrations('0.0.0', '%VERSION%')).toThrowError('UTILS.ERROR_INVALID_SEMVER_FORMAT')
        })
    })
})
