import { ExtendedJsonMetadata, Prompt, TraitId } from "../types/history";

export function generateTextFromPrompt(prompt: Prompt): string {
  // TODO: check if values prompt values provided are valid
  console.log(prompt);
  return "a oil portrait of a man wearing sunglasses, in the style of vincent van gogh";
}

function separatePromptTraits(prompt: Prompt): Map<TraitId, string> {
  if (prompt.length > 3) {
    throw new Error("Array should have max of 3 elements");
  }

  // set for checking selected option per trait only occurs once in prompt
  const options = new Set<TraitId>();
  const map = new Map<TraitId, string>();

  prompt.forEach((trait) => {
    const [optionStr, value] = trait.split(":");

    if (!(optionStr in TraitId)) {
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

export function checkIfSelectedPromptIsValid(
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
