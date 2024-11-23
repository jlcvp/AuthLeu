import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CorsProxyService {

  constructor() { }


  public async fetchDataURL(url: string): Promise<string> {
    const services = [ this.request, this.fetchFromCorsProxy, this.fetchFromAllOrigins, this.fetchFromHTMLDriven, this.fetchFromNCIP, this.fetchFromCorsSh ]
    for(const service of services) {
      try {
        const response = await service.call(this, url)
        const data = await this.blobToBase64(await response.blob())
        return data
      } catch (error) {
        console.warn(error)
      }
    }
    
    throw new Error("Unable to fetch image via available proxies")
  }
  
  private async fetchFromCorsProxy(url: string): Promise<Response> {
    const proxyUrl = "https://corsproxy.io/?"
    console.log("fetching via CORSPROXY.io", { url })
    const response = await this.request(proxyUrl + url)
    console.log("Success via CORSPROXY.io")
    return response
  }

  private fetchFromCorsSh(url: string): Promise<Response> {
    console.log("fetching via CORS.SH", { url })
    throw new Error("awaiting CORS.SH key approval")
  }

  private async fetchFromHTMLDriven(url: string): Promise<Response> {
    const proxyUrl = "https://cors-proxy.htmldriven.com/?url="
    console.log("fetching via HTMLDRIVEN", { url })
    const response = await this.request(proxyUrl + url)
    console.log("Success via HTMLDRIVEN")
    return response
  }

  private async fetchFromAllOrigins(url: string): Promise<Response> {
    const proxyUrl = "https://api.allorigins.win/raw?url="
    console.log("fetching via ALLORIGINS", { url })
    const response = await this.request(proxyUrl + url)
    console.log("Success via ALLORIGINS")
    return response
  }

  private async fetchFromNCIP(url: string): Promise<Response> {
    const proxyUrl = "https://ncip.leu.dev.br/api?src="
    console.log("fetching via NCIP", { url })
    const response = await this.request(proxyUrl + url)
    console.log("Success via NCIP")
    return response
  }

  private async request(url: string): Promise<Response> {
    const response = await fetch(url)
    if(!response.ok) { 
      throw new Error("Failed to fetch data") 
    }
    return response
  }

  /**
   * Converts a Blob to a Base64 string.
   * @param blob The Blob to convert.
   * @returns A Promise that resolves with the Base64 string.
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  }

}
