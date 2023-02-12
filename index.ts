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

/// {"nft_address" : "2JJ...UcU", "index_path": [0,1,0]} // TODO add transaction ID for payment check
//app.post("/api/variation", async function (req, res) {
app.post("/api/getImage", async function (req, res) {
  console.log("================================");
  console.log("/api/variation");

  // ------------------------------------------------------------------
  // Check parameters

  let nftAddress: string;
  let indexPath: Array<number>;
  try {
    nftAddress = req.body.nft_address;
    indexPath = req.body.index_path;
    if (indexPath.length < 1) {
      console.log("ERR empty index path");
      res.sendStatus(400);
      return;
    }
  } catch {
    console.log("ERR missing params", req);
    res.sendStatus(400);
    return;
  }


  try {
    // ------------------------------------------------------------------
    // Extract the image URL that we want to create a variation from

    let imgUrlAtPath: string;

    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(nftAddress) });

    const nftMetaData = nft.json;
    if (!nftMetaData) {
      console.log("No metadata in nft");
      res.sendStatus(500);
      return;
    }
    const nftCoverImageUrl: string = nftMetaData.image!;

    let history: any = nftMetaData.properties!.history;
    if (history) {
      let children = history.rootImages;
      let imageUrl: string = "";
      // We return 400 at the top if length is less than one
      for (let i = 0; i < indexPath.length; i++) {
        let childKey = Object.keys(children)[indexPath[i]];
        children = children[childKey];
      }
      imgUrlAtPath = imageUrl;
    } else {
      // TODO write this as new with the one new child
      // history = {
      //   "focusIndex": 0,
      //   "visiblePath": [0],
      //   "rootImages": {
      //     // wtf JS wtf is this shit, you seriously want me to put brackets here you fucking ass clown
      //     [nftCoverImageUrl]: {},
      //   }
      // };
      let indexPathPointsToRoot = indexPath.length == 1 && indexPath[0] == 0;
      if (!indexPathPointsToRoot) {
        console.log("ERR no history yet, but index path does not point to root", indexPath);
        res.sendStatus(400);
        return;
      }
      imgUrlAtPath = nftCoverImageUrl;
    }
    console.log("Found imgUrlAtPath:", imgUrlAtPath);


    // ------------------------------------------------------------------
    // Get the actual image for the URL

    const imgForImgUrlAtPath = (await axios.get(imgUrlAtPath, {
      responseType: "arraybuffer",
    })).data;
    const imgBuffer: any = Buffer.from(imgForImgUrlAtPath, "utf-8");
    imgBuffer.name = "image.png";


    // ------------------------------------------------------------------
    // Create a variation for the image via OpenAi api

    const responseOpenAI = await openai.createImageVariation(
      imgBuffer,
      1,
      "1024x1024"
    );
    const openAiImageUrl = responseOpenAI.data.data[0].url;
    console.log("Received temporary variation url from OpenAi:", openAiImageUrl);

    if (!openAiImageUrl) {
      // TODO need to retry or refund the user
      res.sendStatus(500);
      return;
    }


    // ------------------------------------------------------------------
    // Upload new variation as Metaplex File

    const responseMetaPlex = await axios.get(openAiImageUrl, {
      responseType: "arraybuffer",
    });
    let metaplexFile: MetaplexFile = toMetaplexFile(responseMetaPlex.data, "image.jpg");
    const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

    console.log("Uploaded variation to permanent metaplex url:", newMetaplexImageUrl);


    // ------------------------------------------------------------------
    // Update the nft meta data

    // get evolution attribute
    const oldAttributes = nftMetaData?.attributes || [{ trait_type: "Evolution", value: "0" }];
    const oldEvolutionValue = Number(oldAttributes[0].value);
    const newEvolutionValue = oldEvolutionValue + 1;

    // get history property or init if freshly minted
    const oldHistory: any = (nftMetaData?.properties?.history ||
    {
      focusIndex: 0,
      visiblePath: [0],
      rootImages: {
        // wtf JS wtf is this shit, you seriously want me to put brackets here you fucking ass clown
        [nftCoverImageUrl]: {},
      }
    });

    // get the parent into which we want to insert the new child
    let children = oldHistory.rootImages;
    for (let i = 0; i < indexPath.length; i++) {
      let childKey = Object.keys(children)[indexPath[i]];
      children = children[childKey];
    }
    children[newMetaplexImageUrl] = {};

    console.log(Object.keys(children), "keys");
    let lastIndexInParent = (Object.keys(children).length - 1);
    console.log(lastIndexInParent, "lastIndexInParent");

    // adjust the visible path and focus
    let newVisiblePath = [...indexPath, lastIndexInParent];
    let newFocusIndex = newVisiblePath.length - 1;

    const newHistory = {
      focusIndex: newFocusIndex,
      visiblePath: newVisiblePath,
      rootImages: oldHistory.rootImages, // Now includes new child
    };

    const nftWithChangedMetaData = {
      ...nftMetaData,
      attributes: [
        {
          trait_type: "Evolution",
          value: newEvolutionValue.toString(),
        },
      ],
      properties: {
        ...nftMetaData.properties,
        "files": [
          {
            "uri": newMetaplexImageUrl,
            "type": "image/png"
          }
        ],
        "history": newHistory,
      },
      image: newMetaplexImageUrl,
    };

    console.log(JSON.stringify(nftWithChangedMetaData), "nftWithChangedMetaData");

    const { uri: newNftMetaDataUrl } = await metaplex.nfts().uploadMetadata(nftWithChangedMetaData);

    await metaplex.nfts().update({
      nftOrSft: nft,
      uri: newNftMetaDataUrl,
    });

    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});
