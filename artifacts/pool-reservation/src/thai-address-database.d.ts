declare module "thai-address-database" {
  export interface ThaiAddressResult {
    district: string;
    amphoe: string;
    province: string;
    zipcode: string | number;
  }

  export function searchAddressByDistrict(searchStr: string, maxResult?: number): ThaiAddressResult[];
  export function searchAddressByAmphoe(searchStr: string, maxResult?: number): ThaiAddressResult[];
  export function searchAddressByProvince(searchStr: string, maxResult?: number): ThaiAddressResult[];
  export function searchAddressByZipcode(searchStr: string | number, maxResult?: number): ThaiAddressResult[];
}
