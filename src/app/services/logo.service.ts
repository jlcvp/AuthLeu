import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { BrandFetchSearchResultArray } from '../models/brand-fetch-search.model';

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

    const brands: BrandFetchSearchResultArray = (await response.json()).map((brand: any) => {
      return {
        brandId: brand.brandId,
        claimed: brand.claimed,
        domain: brand.domain,
        icon: brand.icon,
        name: brand.name,
        logo: `https://cdn.brandfetch.io/${brand.domain}/w/250/h/120/logo`
      }
    })
    console.log("BRANDS:::::", {brands})
    return brands
  }
}
