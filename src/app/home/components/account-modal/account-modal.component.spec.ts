import { FormBuilder } from '@angular/forms';
import { AlertController, LoadingController, ModalController, SearchbarCustomEvent, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { Account2FA } from 'src/app/models/account2FA.model';
import { BrandFetchSearchResult } from 'src/app/models/brand-fetch-search.model';
import { LogoService } from 'src/app/services/logo.service';
import { AccountModalComponent } from './account-modal.component';

describe('AccountModalComponent', () => {
  let logoService: jasmine.SpyObj<LogoService>
  let modalController: jasmine.SpyObj<ModalController>
  let component: AccountModalComponent

  beforeEach(() => {
    logoService = jasmine.createSpyObj<LogoService>('LogoService', ['searchServiceInfo'])
    logoService.searchServiceInfo.and.resolveTo([])
    modalController = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss'])
    modalController.dismiss.and.resolveTo(true)
    const translateService = { get: (key: string) => of(key) }
    component = new AccountModalComponent(
      new FormBuilder(),
      translateService as unknown as TranslateService,
      logoService,
      {} as ToastController,
      {} as LoadingController,
      {} as AlertController,
      modalController,
    )
  })

  describe('createAccount', () => {
    it('keeps the issuer of a scanned QR code', async () => {
      await component['processQRCode']('otpauth://totp/ACME%20Co:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8')

      await component.createAccount(component.validations_form.value)
      await new Promise(resolve => setTimeout(resolve)) // createAccount doesn't wait for the modal to be dismissed

      const account = modalController.dismiss.calls.mostRecent().args[0] as Account2FA
      expect(account.issuer).toBe('ACME Co')
      expect(account.algorithm).toBe('SHA256')
      expect(account.tokenLength).toBe(8)
    })
  })

  describe('handleSearchLogo', () => {
    const search = (term: string) => new CustomEvent('search', { detail: { value: term } }) as SearchbarCustomEvent
    const brand = (logo: string): BrandFetchSearchResult => ({ brandId: '', claimed: false, domain: '', icon: '', name: '', logo })

    it('ignores the results of a search that finishes after a newer one', async () => {
      let resolveOlderSearch!: (brands: BrandFetchSearchResult[]) => void
      logoService.searchServiceInfo.and.callFake(term => term === 'git'
        ? new Promise(resolve => resolveOlderSearch = resolve)
        : Promise.resolve([brand('github-logo')]))

      const olderSearch = component.handleSearchLogo(search('git'))
      await component.handleSearchLogo(search('github'))
      resolveOlderSearch([brand('git-logo')])
      await olderSearch

      expect(component.searchLogoResults).toEqual(['github-logo'])
      expect(component.draftLogoURL).toBe('github-logo')
    })

    it('ignores the results of a search that finishes after the search was cleared', async () => {
      let resolveSearch!: (brands: BrandFetchSearchResult[]) => void
      logoService.searchServiceInfo.and.returnValue(new Promise(resolve => resolveSearch = resolve))

      const pendingSearch = component.handleSearchLogo(search('git'))
      await component.handleSearchLogo(search(''))
      resolveSearch([brand('git-logo')])
      await pendingSearch

      expect(component.searchLogoResults).toEqual([])
      expect(component.draftLogoURL).toBe('')
    })

    it('handles search errors', async () => {
      logoService.searchServiceInfo.and.rejectWith(new Error('Failed to fetch service info'))

      await expectAsync(component.handleSearchLogo(search('git'))).toBeResolved()
      expect(component.searchLogoResults).toEqual([])
    })
  })
});
