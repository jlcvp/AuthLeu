import { Pipe, PipeTransform } from '@angular/core';
import { Account2FA } from '../models/account2FA.model';

@Pipe({
  name: 'accountFilter',
  standalone: true
})
export class AccountFilterPipe implements PipeTransform {
  transform(data: Account2FA[] | null, search: string): Account2FA[] {
    if(!data) {
      return []
    }
    if(!search) {
      return data
    }

    return data.filter((account) => { 
      return (account.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || 
              account.issuer?.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    })
  }
}
