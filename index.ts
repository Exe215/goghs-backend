import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import {
  AnchorProvider,
  Program,
  setProvider,
  Wallet,
} from "@project-serum/anchor";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import cors from "cors";
import express from "express";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import secret from "./devnet.json";
import { IDL } from "./goghs_program";
import { closeNftModification, modifyNft } from "./lib/modification";
import { Modification } from "./types/program";

const PROGRAM_ID = new PublicKey(
  "6Ru71r5FRDfoUFhVe6uMQmoGbS8BAv5MXsERfRppSZ3V"
);

// OpenAi Setup
const configuration = new Configuration({
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

// Wallet Setup
const WALLET = Keypair.fromSecretKey(new Uint8Array(secret));
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Anchor Setup
const provider = new AnchorProvider(connection, new Wallet(WALLET), {});
setProvider(provider);
const program = new Program(IDL, PROGRAM_ID);

// Metaplex Setup
const metaplex = new Metaplex(connection);
metaplex.use(keypairIdentity(WALLET));
metaplex.use(
  bundlrStorage({
    address: "https://devnet.bundlr.network",
    providerUrl: "https://api.devnet.solana.com",
    timeout: 60000,
  })
);

var app = express();
app.use(cors());
app.use(express.urlencoded());
app.use(express.json());

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "/index.html"));
});

app.listen(3001, "0.0.0.0", function () {
  console.log("Listening on port 3001!");
});

/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § "3XJ...isJ"
///
/// Checks if [index_path] is valid for the existing history.
/// Extracts the image url for that path.
/// Sets that image to be the new cover.
/// Sets the focusIndex and visiblePath to that new cover.
///
/// Returns error if no history exists yet (means the original nft is untouched => no need to setCover).
app.post("/api/setCover", async function (req, res) {
  console.log("================================");
  console.log("/api/setCover");
  try {
    await modifyNft(
      req,
      Modification.CoverChange,
      PROGRAM_ID,
      WALLET,
      program,
      metaplex
    );
    res.sendStatus(200);
  } catch (e) {
    console.log("Cover Change failed", e);
    res.sendStatus(400);
  }
});

/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § "3XJ...isJ"
///
/// Extracts the image belonging to [index_path] from the history.
/// Generates a new variation for that image.
/// Inserts that new variation back into the tree as a child of [index_path].
/// Sets the focusIndex and visiblePath to that new variation.
/// Sets that image to be the new cover.
app.post("/api/variation", async function (req, res) {
  console.log("================================");
  console.log("/api/variation");
  try {
    await modifyNft(
      req,
      Modification.Variation,
      PROGRAM_ID,
      WALLET,
      program,
      metaplex,
      openai
    );
    res.sendStatus(200);
  } catch (e) {
    console.log("Cover Change failed", e);
    res.sendStatus(400);
  }
});

app.post("/api/toggleFavorite", async function (req, res) {
  console.log("================================");
  console.log("/api/toggleFavorite");
  try {
    await modifyNft(
      req,
      Modification.ToggleFavorite,
      PROGRAM_ID,
      WALLET,
      program,
      metaplex,
      openai
    );
    res.sendStatus(200);
  } catch (e) {
    console.log("Cover Change failed", e);
    res.sendStatus(400);
  }
});

app.post("/api/closeReceipt", async function (req, res) {
  console.log("================================");
  console.log("/api/closeReceipt");
  try {
    await closeNftModification(req, program, PROGRAM_ID, WALLET, metaplex);
    res.sendStatus(200);
  } catch (e) {
    console.log("Cover Change failed", e);
    res.sendStatus(400);
  }
});

export default app;
