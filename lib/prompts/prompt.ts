import {
  ExtendedJsonMetadata,
  Prompt,
  PromptBlock,
  TraitId,
  TraitValue,
} from "../../types/history";
import {
  headValues,
  bgValues,
  bodyValues,
  eyeValues,
  miscValues,
} from "./traitValueMap";

const MAX_TRAIT_AMOUNT = 3;

export function generateTextFromPrompt(prompt: Prompt): string {
  const traitMap: Map<TraitId, TraitValue> = separatePromptTraits(prompt);
  let finalPromptString = "";
  traitMap.forEach((value, key) => {
    const promptBlock = lookupPromptBlockForTraitValue(key, value);
    if (!promptBlock) {
      throw new Error(`Selected prompt ${value} of traitId ${key} not valid.`);
    }
    finalPromptString = finalPromptString + promptBlock + "\n";
  });

  return finalPromptString;
}

function lookupPromptBlockForTraitValue(
  traitId: TraitId,
  traitValue: TraitValue
): PromptBlock | undefined {
  switch (traitId) {
    case TraitId.head:
      return headValues.get(traitValue);
    case TraitId.bg:
      return bgValues.get(traitValue);
    case TraitId.body:
      return bodyValues.get(traitValue);
    case TraitId.eye:
      return eyeValues.get(traitValue);
    case TraitId.misc:
      return miscValues.get(traitValue);
  }
}

function separatePromptTraits(prompt: Prompt): Map<TraitId, TraitValue> {
  if (prompt.length > MAX_TRAIT_AMOUNT) {
    throw new Error(`Array should have max of ${MAX_TRAIT_AMOUNT} elements`);
  }

  // set for checking selected option per trait only occurs once in prompt
  const options = new Set<TraitId>();
  const map = new Map<TraitId, string>();

  prompt.forEach((trait) => {
    const [optionStr, value] = trait.split(":");

    const traitIdKeys = Object.keys(TraitId);

    if (!traitIdKeys.includes(optionStr)) {
      throw new Error(`Invalid option "${optionStr}"`);
    }

    const option = TraitId[optionStr as keyof typeof TraitId];

    if (options.has(option)) {
      throw new Error(`Option "${option}" occurs more than once`);
    }

    options.add(option);
    map.set(option, value);
  });

  return map;
}

export function checkIfNftContainsTraitValueGivenInPrompt(
  prompt: Prompt,
  metadata: ExtendedJsonMetadata
) {
  const history = metadata.properties.history;
  const traitValues = history.traitValues;

  prompt.forEach((trait) => {
    if (!traitValues.includes(trait)) {
      throw new Error(`TraitValues Array of NFT does not include ${trait}`);
    }
  });
  return true;
}
