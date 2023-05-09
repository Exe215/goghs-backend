import { JsonMetadata } from "@metaplex-foundation/js";

export type IndexPath = number[];

/**
Encodes a specific value for one of the traits.

More values can be unlocked over time.

Follows a specific pattern to save redundant
structures:

[TraitID]<delim>[Full Value String]
§ "bg:red_sunglasses"
  => "Background": "Red Sunglasses"

This allows us to encode everything we need in a single
String instead of via Maps like
{type: background, value: red sunglasses}

We must keep track of all these values, and handle
their resolution to actual prompts on the backend

§ "bg:clouds"
  => "sunlit clouds in the background"
§ "bg:underwater"
  => "underwater, surrounded by colorful fishes"
*/
export type TraitValueId = String;

export type Prompt = TraitValueId[];

export type NftHistory = {
  coverPath: IndexPath;
  favorites: IndexPath[];
  baseImages: ImageResult[];
  traitValues: TraitValueId[];
  prompts: Prompt[];
};

export interface ExtendedJsonMetadata extends JsonMetadata {
  properties: JsonMetadata["properties"] & {
    history: NftHistory;
  };
}

export enum TraitId {
  head, // head
  eye, // eyes
  body, // body
  misc, // michellesanus
  bg, // background
}

export type ImageResult = {
  /// Path to the hosted image resource
  /// probably on arweave
  url: string;

  /// Creation timestamp
  date: string;

  /// Index into the top level [History.prompts] list
  ///
  /// Means less redundant storage and faster lookup,
  /// compared to storing lists or long strings
  prompt: number;

  /// Index into the top level [History.characters] list.
  ///
  /// This means we need a transaction+request to create the new character in the meta data before
  /// it can be used inside a prompt.
  ///
  /// We could also send character info together with the image variation request, if a new char is created
  /// from inside the builder during prompt building. This character would only be saved if the prompt request
  /// is actually sent out.
  /// character?: number;

  /// Image variations that were created on the
  /// base of this one.
  variations: ImageResult[];
};
