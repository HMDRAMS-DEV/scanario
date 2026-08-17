export type Age = "Adult" | "Paediatric";
export type Modality = "MRI" | "CT";
export type SortKey = "best" | "wait" | "distance";

export type RangeId = "30m" | "1h" | "2h" | "4h" | "anywhere";

export interface RangeOption {
  id: RangeId;
  label: string;
  km: number;
}

export interface WaitTimeRaw {
  PriorityId: number;
  WaitTime90percentile: string;
  WaitTimePercentWithinTarget: string;
  NumberOfCases: string;
  WaitTimeMean: string;
  Target: string;
  PriorityDescription: string | null;
  PriorityWithHighestVolume: string | null;
}

export interface SiteRaw {
  Id: number;
  Name: string;
  Address1: string | null;
  Address2: string | null;
  PostalCode: string | null;
  City: string | null;
  Province: string | null;
  Distance: string;
  Longitude: number;
  Latitude: number;
  Key: string;
  Key2: string;
  WaitTimes: WaitTimeRaw[];
}

export type DataCode = "LV" | "RI" | "NV" | null;

export interface PriorityWait {
  id: number;
  mean: number | null;
  p90: number | null;
  pctTarget: number | null;
  cases: number | null;
  target: number | null;
  code: DataCode;
}

export interface Site {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  km: number;
  lat: number;
  lng: number;
  period: string;
  periodKey: string;
  isProvince: boolean;
  priorities: Record<number, PriorityWait>;
}

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  postal?: string;
  inOntario: boolean;
  source: "postal" | "address";
}

export interface PostalResponse {
  PostalCode: string;
  Province: string;
  Longitude: number;
  Latitude: number;
  InOntario: boolean;
}
