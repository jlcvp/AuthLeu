import { Injectable } from '@angular/core';
import { AppConfigService } from '../services/app-config.service';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertController } from '@ionic/angular';
import { PASSWORD_CHECK_PERIOD } from '../models/encryption-options.model';
import { Account2faService } from '../services/accounts/account2fa.service';

@Injectable({
  providedIn: 'root'
})

/**
 * Service to handle password related operations
 */
export class PasswordService {
  constructor(
    private alertController: AlertController,
    private configService: AppConfigService,
    private translateService: TranslateService,
    private accountsService: Account2faService
  ) { }

  /**
   * Asks for a new password, twice. The password isn't stored.
   * @param messageKey - Translation key of the message shown in the prompt.
   * @returns The password, or undefined if the prompt was cancelled or the passwords don't match.
   */
  public async setupNewPassword(messageKey = 'HOME.PASSWORD_PROMPT_MESSAGE'): Promise<string | undefined> {
    const passwordData = await this.promptNewPassword(messageKey)
    if(passwordData && passwordData.password && passwordData.password === passwordData.passwordConfirmation) {
      await this.configService.setLastPasswordCheck()
      return passwordData.password
    }
    return undefined
  }

  public async periodicPasswordCheck() {
    const lastCheck = await this.configService.getLastPasswordCheck()
    const nextCheck = lastCheck + PASSWORD_CHECK_PERIOD
    const now = Date.now()
    console.log({ lastCheck, nextCheck, now })
    if(now >= nextCheck) { // 1.2.1
      const checkSuccess = await this.presentPasswordCheckAlert()
      if(checkSuccess) { // 1.2.1.1
        console.log('password check success')
        await this.configService.setLastPasswordCheck()
      } else { // 1.2.1.2
        await this.alertUserAboutInabilityToRecoverPassword()
      }
    }
  }
  
  private async presentPasswordCheckAlert(): Promise<boolean> {
    const title = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MESSAGE'))
    const confirm = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.CONFIRM'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      inputs: [
        {
          type: 'password',
          name: 'password',
          placeholder: passwordPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: confirm,
          role: 'confirm',
          handler: (data) => {
            return data.password
          }
        }
      ]
    })
    await alert.present()

    const { data, role } = await alert.onDidDismiss()
    if (role === 'confirm') {
      const password = data.values.password
      if(!(await this.accountsService.verifyPassword(password))) {
        const tryAgain = await this.presentPasswordCheckMismatchAlert()
        if(tryAgain) {
          return await this.presentPasswordCheckAlert()
        }
      } else {
        return true
      }
    }
    return false
  }

  private async promptNewPassword(messageKey: string): Promise<{password: string, passwordConfirmation: string}> {
    const title = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_TITLE'))
    const message = await firstValueFrom(this.translateService.get(messageKey))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_PLACEHOLDER'))
    const passwordConfirmationPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const cancelText = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CANCEL'))
    const okText = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRM'))
    
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: passwordPlaceholder
        },
        {
          name: 'passwordConfirmation',
          type: 'password',
          placeholder: passwordConfirmationPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelText,
          role: 'cancel'
        }, {
          text: okText,
          role: 'confirm',
          handler: (data) => {
            return { password: data.password, passwordConfirmation: data.passwordConfirmation }
          }
        }
      ]
    })
    await alert.present()

    // Ionic passes the typed values even when the alert is cancelled
    const { data, role } = await alert.onDidDismiss()
    if(role !== 'confirm' || !data) {
      return { password: '', passwordConfirmation: '' }
    }
    return data.values
  }

  /**
   * Asks for the password.
   * @param messageKey - Translation key of the message shown in the prompt.
   * @returns The password, or an empty string if the prompt was cancelled.
   */
  public async promptUnlockPassword(messageKey = 'HOME.ASK_PASSWORD.MESSAGE'): Promise<string> {
    const message = await firstValueFrom(this.translateService.get(messageKey))
    const confirm = await firstValueFrom(this.translateService.get('HOME.ASK_PASSWORD.CONFIRM'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
    const passwordPlaceholder = await firstValueFrom(this.translateService.get('HOME.PASSWORD_PROMPT_CONFIRMATION_PLACEHOLDER'))
    const alert = await this.alertController.create({
      message,
      backdropDismiss: false,
      inputs: [
        {
          type: 'password',
          name: 'password',
          placeholder: passwordPlaceholder
        }
      ],
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: confirm,
          role: 'confirm',
          handler: (data) => {
            return data.password
          }
        }
      ]
    })
    await alert.present()
    // Ionic passes the typed values even when the alert is cancelled
    const { data, role } = await alert.onDidDismiss()
    if(role === 'confirm' && data && data.values) {
      return data.values.password
    }
    return ''
  }

  private async alertUserAboutInabilityToRecoverPassword() {
    const title = await firstValueFrom(this.translateService.get('HOME.PASSWORD_RECOVERY_ALERT.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PASSWORD_RECOVERY_ALERT.MESSAGE'))
    await this.showAlert(message, title)
  }

  private async presentPasswordCheckMismatchAlert(): Promise<boolean> {
    const title = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.TITLE'))
    const message = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.MESSAGE'))
    const tryAgainLabel = await firstValueFrom(this.translateService.get('HOME.PERIODIC_CHECK.MISMATCH.TRY_AGAIN'))
    const cancelLabel = await firstValueFrom(this.translateService.get('HOME.CANCEL'))
    const alert = await this.alertController.create({
      header: title,
      message,
      backdropDismiss: false,
      buttons: [
        {
          text: cancelLabel,
          role: 'cancel'
        },
        {
          text: tryAgainLabel,
          role: 'try_again'
        }
      ]
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    if(role === 'try_again') {
      return true
    }
    return false
  }

  private async showAlert(message: string, header?: string): Promise<void> {
    const title = header
    const okLabel = await firstValueFrom(this.translateService.get('HOME.OK'))
    const alert = await this.alertController.create({
      header: title,
      message,
      buttons: [okLabel]
    })
    await alert.present()
    await alert.onDidDismiss()
  }
}
