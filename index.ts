import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  MetaplexFile,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import cors from "cors";
import express from "express";
//import fetch from "node-fetch";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import secret from "./devnet.json";

const BASE_IMAGE_URL =
  "https://arweave.net/I2dvS-utEDRcvfzRyUFls3SFP-3MkAfb_RFamxnIeSw?ext=png";

const configuration = new Configuration({
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

const WALLET = Keypair.fromSecretKey(new Uint8Array(secret));
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
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

app.post("/api/resetImage", async function (req, res) {
  const mint = req.body.mintAddress;
  const evolution = req.body.evolution || "0";


  try {
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(mint) });

    const historyLength = ((nft.json?.properties?.history as (Array<String> | null))?.length || 0);
    if (Number(evolution) > historyLength) {
      console.log("evolution and historyLength dont match:", evolution, historyLength)
      res.sendStatus(500)
    }

    const nftWithChangedMetaData = {
      ...nft.json,
      attributes: [
        {
          trait_type: "Evolution",
          value: evolution,
        },
      ],
      image: BASE_IMAGE_URL,
    };
    console.log(nftWithChangedMetaData, "nftWithChangedMetaData");

    const { uri } = await metaplex.nfts().uploadMetadata(nftWithChangedMetaData);

    await metaplex.nfts().update({
      nftOrSft: nft,
      uri,
    });

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.post("/api/getImage", async function (req, res) {
  const mint = req.body.mintAddress;
  //const mintAddress = "2JJUoWhpJK32CoZjkH8w8dSzH9YF7fzXN3zFuvkrrUcU";

  try {
    // Get Image from NFT
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(mint) });
    const imageUrlResponse = await axios.get(nft.uri);
    console.log(imageUrlResponse);
    const oldImageUrl = imageUrlResponse.data.image;

    const responseOldImage = await axios.get(oldImageUrl, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(responseOldImage.data, "utf-8");
    const oldImageFile: any = buffer;
    oldImageFile.name = "image.png";

    //OPENAI Variation
    const responseOpenAI = await openai.createImageVariation(
      oldImageFile,
      1,
      "1024x1024"
    );
    const newImageUrl = responseOpenAI.data.data[0].url;

    //Get Image and Convert to Metaplex File
    let metaplexFile: MetaplexFile;

    if (!newImageUrl) {
      res.sendStatus(500);
      return;
    }

    const responseMetaPlex = await axios.get(newImageUrl, {
      responseType: "arraybuffer",
    });
    metaplexFile = toMetaplexFile(responseMetaPlex.data, "image.jpg");
    const metaplexImageUri = await metaplex.storage().upload(metaplexFile);

    console.log("Trying to upload the Metadata");
    const oldAttributes = nft.json?.attributes || [{ value: "0" }];
    const oldEvolutionValue = Number(oldAttributes[0].value);

    // History always includes the currently newest image as well
    // if we generate the first variation we simply add the base image as the history
    const oldHistory = (nft.json?.properties?.history as (Array<String> | null)) || [BASE_IMAGE_URL];
    const oldImageUri = nft.json?.image;

    let newHistory;
    if (oldHistory.length == oldEvolutionValue + 1) {
      // This is the case if we simply progress in our evolution
      newHistory = [
        ...oldHistory,
        metaplexImageUri,
      ];
    } else {
      // This is the case if we have previously reset the image to a prior point
      newHistory = [
        ...oldHistory.slice(0, oldEvolutionValue + 1),
        metaplexImageUri,
      ];
    }

    const nftWithChangedMetaData = {
      ...nft.json,
      attributes: [
        {
          trait_type: "Evolution",
          value: `${oldEvolutionValue + 1}`,
        },
      ],
      properties: {
        ...nft.json?.properties,
        "history": newHistory,
      },
      image: metaplexImageUri,
    };

    console.log(nftWithChangedMetaData, "nftWithChangedMetaData");

    const { uri } = await metaplex.nfts().uploadMetadata(nftWithChangedMetaData);

    await metaplex.nfts().update({
      nftOrSft: nft,
      uri,
    });

    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});
