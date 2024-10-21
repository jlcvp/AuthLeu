export interface BrandFetchSearchAPIResult {
    brandId: string;
    claimed: boolean;
    domain: string;
    icon: string;
    name: string;
}

export interface BrandFetchSearchResult extends BrandFetchSearchAPIResult {
    logo: string;
}

export type BrandFetchSearchResultArray = BrandFetchSearchResult[]