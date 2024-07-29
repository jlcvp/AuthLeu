import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {
  private storage!: Storage;
  private initialized = false;
  constructor(private storageProvider: Storage) {
    this.init()
  }

  async init() {
    const storage = await this.storageProvider.create();
    this.storage = storage;
    this.initialized = true;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.initialized) {
      await this.init()
    }
    const value: T | undefined = await this.storage.get(key)
    return value
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
    return this.storage.set(key, value)
  }

  async remove(key: string): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
    return this.storage.remove(key)
  }

  async append<T>(key: string, value: T): Promise<void> {
    const currentArray: T[] = (await this.get(key)) || []
    currentArray.unshift(value)
    return this.set(key, currentArray)
  }

  async clearStorage(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
    return this.storage.clear()
  }
}
