/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LoggingService {
  private systemConsole = {
    log: console.log,
    debug: console.debug,
    warn: console.warn,
    info: console.info
  }

  private isLogEnabled = true;

  constructor() { }

  disableConsoleInProduction(): void {
    if(environment.production){
      this.isLogEnabled = false;
      console.warn(`🚨 Console output is disabled on production!`);
      console.log = (...args: any[]): void => {
        if(this.isLogEnabled) this.systemConsole.log(...args);
      } 
      console.debug = (...args: any[]): void => {
        if(this.isLogEnabled) this.systemConsole.debug(...args);
      }
      console.warn = (...args: any[]): void => {
        if(this.isLogEnabled) this.systemConsole.warn(...args);
      }
      console.info = (...args: any[]): void => {
        if(this.isLogEnabled) this.systemConsole.info(...args);
      }
    }
  }

  enableConsole(): void {
    this.isLogEnabled = true;
    console.warn(`🚨 Console output is enabled!`);
  }
}
