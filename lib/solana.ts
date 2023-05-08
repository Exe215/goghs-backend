import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  AccountData,
  AlreadyInProgressError,
  Modification,
  ReceiptData,
} from "../types/program";
import { Program } from "@project-serum/anchor";
import { GoghsProgram } from "../goghs_program";
import { Metaplex, toMetaplexFile } from "@metaplex-foundation/js";
import { ExtendedJsonMetadata, NftHistory } from "../types/history";
import axios from "axios";
import { getImageAtPath } from "./history";

/**
 * Derives and returns the [PublicKey] of:
 * - Receipt PDA: Holds instruction data for the nft modification
 * - Credit PDA: Holds the count for the free credits
 */
export function getProgramAccounts(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey
): AccountData {
  // Derive the receipt account based on req parameters
  const [receiptPda] = PublicKey.findProgramAddressSync(
    [nftAddress.toBuffer(), userAddress.toBuffer(), Buffer.from("receipt")],
    programId
  );

  // Derive the credits account in case we need to refund the credit
  const [creditsPda] = PublicKey.findProgramAddressSync(
    [nftAddress.toBuffer(), Buffer.from("credits")],
    programId
  );

  return {
    receiptPda,
    creditsPda,
  };
}

/**
 * Fetch and return the data of [receiptPda]
 * Throws an error if the indexPath is empty or not of type [Array]
 */
export async function getReceiptData(
  receiptPda: PublicKey,
  program: Program<GoghsProgram>
): Promise<ReceiptData> {
  // Retrieve the varation instruction from the receipt account
  const receiptState = await program.account.receiptState.fetch(receiptPda);
  const receiptIndexPath = receiptState.indexPath;
  const inProgress = receiptState.inProgress;
  const receiptTimestamp = receiptState.time.toNumber();
  const paymentType = receiptState.paymentType;
  const instructionType = receiptState.instructionType;
  const oldMetadataUri = receiptState.oldMetadata;
  const prompt = receiptState.prompt;

  if (receiptIndexPath.length < 1 || !Array.isArray(receiptIndexPath)) {
    throw new Error("IndexPath not valid");
  }

  return {
    receiptIndexPath,
    receiptTimestamp,
    inProgress,
    paymentType,
    instructionType,
    oldMetadataUri,
    prompt,
  };
}

/**
 * Fetches metadata for an nft.
 *
 * Checks if the [image] property is defined.
 * Casts metadata to [ExtendedJsonMetadata] - (Metadata + History).
 *
 * @returns Metadata object of Nft
 */
export async function getMetadataFromNftMintAddress(
  nftAddress: PublicKey,
  metaplex: Metaplex
): Promise<ExtendedJsonMetadata> {
  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;

  if (!nftMetaData.image) {
    throw new Error("Metadata has no cover image attached to it");
  }

  return nftMetaData;
}

/**
 *  Creates MetaplexFile.
 *  Uploads it to chosen metaplex storage provider
 *
 *  @returns Link to uploaded file
 */
export async function uploadFileToMetaplex(
  url: string,
  metaplex: Metaplex
): Promise<string> {
  const responseMetaPlex = await axios.get(url, {
    responseType: "arraybuffer",
  });

  let metaplexFile = toMetaplexFile(responseMetaPlex.data, "image.png");

  const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

  console.log(
    "Uploaded variation to permanent metaplex url:",
    newMetaplexImageUrl
  );

  return newMetaplexImageUrl;
}

/**
 * Fetches nft by mint
 * Uploads a new metadata file to metaplex
 * Updates nft with new metadata file
 */
export async function updateNftWithNewMetadata(
  metaplex: Metaplex,
  nftAddress: PublicKey,
  newMetadata: ExtendedJsonMetadata
) {
  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  const { uri: newNftMetaDataUrl } = await metaplex
    .nfts()
    .uploadMetadata(newMetadata);

  await metaplex.nfts().update({
    nftOrSft: nft,
    uri: newNftMetaDataUrl,
  });
}

/**
 * Derive receipt PDA.
 * Return error if receipt is already in progress.
 * Toggle progess indicator on receipt PDA.
 */
export async function startProcessOnReceipt(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signerWallet: Keypair
) {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  // Retrieve receipt account data
  // Throws error if index is no array or empty
  const { inProgress } = await getReceiptData(receiptPda, program);

  // Don't handle another request
  if (inProgress) {
    throw new AlreadyInProgressError("Receipt process already started");
  }

  // Set inProgress to true on receipt pda
  await program.methods
    .startProcess()
    .accounts({
      receipt: receiptPda,
      backend: signerWallet.publicKey,
      user: userAddress,
      nftMint: nftAddress,
    })
    .signers([signerWallet])
    .rpc();
}

/**
 * Closes the receipt PDA account.
 *
 * @param canKeepMoney If this is false, the user will receive a refund.
 */
export async function closeReceiptAccount(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signer: Keypair,
  metaplex: Metaplex
) {
  let canKeepMoney = true;

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const { creditsPda, receiptPda } = getProgramAccounts(
    nftAddress,
    userAddress,
    programId
  );

  const {
    receiptIndexPath: indexPath,
    inProgress,
    instructionType,
    oldMetadataUri,
  } = await getReceiptData(receiptPda, program);

  const slot = await connection.getSlot();
  const solanaTimestamp = await connection.getBlockTime(slot);

  if (!solanaTimestamp) {
    throw new Error("Could not get the solana time");
  }

  const imgUrlAtPath = await getImageAtPath(metaplex, nftAddress, indexPath);

  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const oldMetadata = (await axios.get(oldMetadataUri))
    .data as ExtendedJsonMetadata;

  const newHistory: NftHistory = nftMetaData.properties.history;
  const oldHistory = oldMetadata.properties.history;

  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  // metadata did not change -> update failed
  if (nft.uri === oldMetadataUri) {
    canKeepMoney = false;
  }

  // check if modification was successful
  switch (instructionType) {
    case Modification.CoverChange:
      console.log(imgUrlAtPath, nftMetaData.image, "is the image the same?");
      if (imgUrlAtPath != nftMetaData.image) {
        canKeepMoney = false;
      }
      break;
    case Modification.ToggleFavorite:
      if (oldHistory.favorites.length === newHistory.favorites.length) {
        canKeepMoney = false;
      }
      break;
    case Modification.Variation:
      if (!nftMetaData.attributes || !oldMetadata.attributes) return;
      if (nftMetaData.attributes[0].value === oldMetadata.attributes[0].value) {
        canKeepMoney = false;
      }
      break;
  }

  const tx = await program.methods
    .close(canKeepMoney)
    .accounts({
      receipt: receiptPda,
      nftMint: nftAddress,
      user: userAddress,
      credits: creditsPda,
      backend: signer.publicKey,
    })
    .rpc();

  console.log(
    "CLOSE Transaction",
    `https://explorer.solana.com/tx/${tx}?cluster=devnet`
  );
}
