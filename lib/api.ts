import { Metaplex, toMetaplexFile } from "@metaplex-foundation/js";
import { OpenAIApi } from "openai";
import { base64ToArrayBuffer } from "./helper";

const GENERATION_STEPS = 50;
const SAMPLE_SIZE = 3;

/**
 * @returns New DALLE variation of an image as link.
 */
export async function getOpenAiVariation(
  imageBuffer: File,
  openai: OpenAIApi
): Promise<string> {
  const responseOpenAI = await openai.createImageVariation(
    imageBuffer,
    1,
    "1024x1024"
  );

  const openAiImageUrl = responseOpenAI.data.data[0].url;
  console.log("Received temporary variation url from OpenAi:", openAiImageUrl);

  if (!openAiImageUrl) {
    throw new Error("OpenAI Imageurl undefined");
  }

  return openAiImageUrl;
}

export async function getDreamStudioImgToImgVariation(
  prompt: string,
  imageStrenght: number,
  file: File,
  metaplex: Metaplex
): Promise<string[]> {
  console.log(
    `${new Date().toLocaleTimeString()}: Start image generation call`
  );

  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-beta-v2-2-2/text-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${process.env.DREAMSTUDIO_API_KEY}`,
      },
      body: JSON.stringify({
        init_image: file,
        init_image_mode: "IMAGE_STRENGTH",
        image_strength: imageStrenght,
        text_prompts: [
          {
            text: prompt,
          },
        ],
        cfg_scale: 7,
        clip_guidance_preset: "FAST_BLUE",
        samples: SAMPLE_SIZE,
        steps: GENERATION_STEPS,
      }),
    }
  );

  console.log(
    `${new Date().toLocaleTimeString()}: Finish image generation call`
  );
  if (!response.ok) {
    throw new Error(`Non-200 response: ${await response.text()}`);
  }

  interface GenerationResponse {
    artifacts: Array<{
      base64: string;
      seed: number;
      finishReason: string;
    }>;
  }

  const responseJSON = (await response.json()) as GenerationResponse;

  const newMetaplexImageUrls: string[] = [];
  // TODO: Modify to allow a variable number of images
  responseJSON.artifacts.forEach(async (artifact, i) => {
    const buffer = base64ToArrayBuffer(artifact.base64);
    const metaplexFile = toMetaplexFile(buffer, "image.png");

    console.log(
      `${new Date().toLocaleTimeString()}: Start uploading image ${i} to Metaplex`
    );

    const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

    console.log(
      `${new Date().toLocaleTimeString()}: Finish uploading image ${i} to Metaplex`
    );

    newMetaplexImageUrls.push(newMetaplexImageUrl);
  });
  return newMetaplexImageUrls;
}
