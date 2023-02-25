import { JsonMetadata } from "@metaplex-foundation/js";

export type NftHistory = {
  visiblePath: IndexPath;
  focusIndex: number;
  favorites: IndexPath[];
  baseImages: ImageVariation[];
};

export type ImageVariation = {
  url: string;
  created: string;
  variations: ImageVariation[];
};

export type IndexPath = number[];

export interface ExtendedJsonMetadata extends JsonMetadata {
  properties: JsonMetadata["properties"] & {
    history: NftHistory;
  };
}
