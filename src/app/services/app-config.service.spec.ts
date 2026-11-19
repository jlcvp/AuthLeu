import { environment } from 'src/environments/environment';
import { AppConfigService } from './app-config.service';
import { LocalStorageService } from './local-storage.service';

describe('AppConfigService', () => {
  let storedOfflineMode: boolean | undefined
  let service: AppConfigService
  const isOfflineEnv = environment.isOfflineEnv

  beforeEach(() => {
    storedOfflineMode = undefined
    const localStorage = { get: async () => storedOfflineMode }
    service = new AppConfigService(localStorage as unknown as LocalStorageService)
  })

  afterEach(() => {
    environment.isOfflineEnv = isOfflineEnv
  })

  describe('isOfflineMode', () => {
    it("defaults to the build's offline setting until the user chooses", async () => {
      environment.isOfflineEnv = true
      expect(await service.isOfflineMode()).toBeTrue()

      environment.isOfflineEnv = false
      expect(await service.isOfflineMode()).toBeFalse()
    })

    it("uses the user's choice over the build's setting", async () => {
      environment.isOfflineEnv = true
      storedOfflineMode = false
      expect(await service.isOfflineMode()).toBeFalse()

      environment.isOfflineEnv = false
      storedOfflineMode = true
      expect(await service.isOfflineMode()).toBeTrue()
    })
  })
});
