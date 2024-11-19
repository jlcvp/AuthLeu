import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { BrandFetchSearchAPIResult, BrandFetchSearchResultArray } from '../models/brand-fetch-search.model';

@Injectable({
  providedIn: 'root'
})
export class LogoService {
  private static baseLogoDevURL = "https://img.logo.dev/$DOMAIN$"
  private static baseBrandFetchURL = "https://api.brandfetch.io/v2/search/$SERVICE_NAME$"
  private static logodevAPIKey = environment.LOGO_DEV_APIKEY
  private static brandfetchAPIKey = environment.BRANDFETCH_APIKEY
  constructor() { }

  
  getLogoDevURL(domain: string, size: number = 128, format: ("png" | "jpg") = "png", greyscale: boolean = true): string {
    const tokenParam = `token=${LogoService.logodevAPIKey}`
    const sizeParam = `size=${size}`
    const formatParam = `format=${format}`
    const greyscaleParam = `greyscale=${greyscale}`

    domain = domain.replace(/^(https?):\/\//i, "")

    const validDomainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,6}$/i
    if(!validDomainRegex.test(domain.toLocaleLowerCase())) {
      throw new Error("Invalid domain")
    }

    const url = LogoService.baseLogoDevURL
      .replace("$DOMAIN$", domain)
      .concat(`?${tokenParam}&${sizeParam}&${formatParam}&${greyscaleParam}`)
    return url
  }

  async searchServiceInfo(serviceName: string): Promise<BrandFetchSearchResultArray> {
    const url = LogoService.baseBrandFetchURL.replace("$SERVICE_NAME$", serviceName)
    const bearerToken = `Bearer ${LogoService.brandfetchAPIKey}`
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": bearerToken
      }
    })
    if(!response.ok) { throw new Error("Failed to fetch service info") }

    const brands: BrandFetchSearchResultArray = (await response.json()).map((brand: BrandFetchSearchAPIResult) => {
      return {
        brandId: brand.brandId,
        claimed: brand.claimed,
        domain: brand.domain,
        icon: brand.icon,
        name: brand.name,
        logo: `https://cdn.brandfetch.io/${brand.domain}/w/250/h/120/logo`
      }
    })

    //try to fetch the logo for each brand
    const promises: Promise<void>[] = []
    for(const brand of brands) {
      const p = new Promise<void>(async (resolve) => {
        try {
          brand.logo = await this.downloadImageAsBase64(brand.logo)
        } catch (error) {
          console.warn("Error downloading logo (Using original URL instead)", error) // if unable, keep the original URL
        }
        resolve()
      })
      promises.push(p)
    }
    await Promise.all(promises)
    console.log("BRANDFETCH BRANDS:::::", {brands})
    return brands
  }

   /**
   * Downloads an image from a given URL and converts it to a Base64 data URL.
   * @param imageUrl The URL of the image to download.
   * @returns A Promise that resolves with the Base64 data URL of the image.
   */
   async downloadImageAsBase64(imageUrl: string): Promise<string> {
    try {
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const blob = await response.blob();

      // Convert the blob to a Base64 string
      return await this.blobToBase64(blob);
    } catch (error) {
      console.error('Error downloading or converting image:', error);
      throw error;
    }
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
