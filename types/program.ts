import { PublicKey } from "@solana/web3.js";

export type AccountData = {
  creditsPda: PublicKey;
  receiptPda: PublicKey;
};

export type ReceiptData = {
  receiptTimestamp: number;
  receiptIndexPath: number[];
  inProgress: boolean;
  paymentType: number;
  instructionType: number;
  oldMetadataUri: string;
};

export class AlreadyInProgressError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, AlreadyInProgressError.prototype);
  }
}

export enum Modification {
  Variation,
  CoverChange,
  ToggleFavorite,
}
