export interface BrandFetchSearchResult {
    brandId: string;
    claimed: boolean;
    domain: string;
    icon: string;
    name: string;
    logo: string;
}

export type BrandFetchSearchResultArray = BrandFetchSearchResult[]