import * as tfa from '2factor-auth';

export class Account2FA {
    id: string;
    serviceName: string;
    accountName: string;
    secret: string;
    interval?: number;
    active?: boolean;
    logo?: string;

    constructor(id: string, serviceName: string, accountName: string, secret: string, interval?: number, active?: boolean, logo?: string) {
        this.id = id;
        this.serviceName = serviceName;
        this.accountName = accountName;
        this.secret = secret;
        this.interval = interval;
        this.active = active;
        this.logo = logo;
    }

    getCode(): string {
        return tfa.generateCode(this.secret, Math.floor(Date.now() / ((this.interval || 30) * 1000)));
    }
}