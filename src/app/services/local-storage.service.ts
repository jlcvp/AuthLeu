import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {
  private storage!: Storage;
  constructor(private storageProvider: Storage) {
    this.init()
  }

  async init() {
    const storage = await this.storageProvider.create();
    this.storage = storage;
  }

  async get<T>(key: string): Promise<T> {
    const value: T = await this.storage.get(key)
    return value
  }

  async set<T>(key: string, value: T): Promise<void> {
    return this.storage.set(key, value)
  }

  async remove(key: string): Promise<void> {
    return this.storage.remove(key)
  }

  async append<T>(key: string, value: T): Promise<void> {
    const currentArray: T[] = (await this.get(key)) || []
    currentArray.unshift(value)
    return this.set(key, currentArray)
  }

  async clearStorage(): Promise<void> {
    return this.storage.clear()
  }
}
