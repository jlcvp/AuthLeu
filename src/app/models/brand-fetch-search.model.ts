export interface BrandFetchSearchResult {
    brandId: string;
    claimed: boolean;
    domain: string;
    icon: string;
    name: string;
}

export type BrandFetchSearchResultArray = BrandFetchSearchResult[]